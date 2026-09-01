"""Platform superadmin console (cross-tenant).

Every firm on the platform, with the full lifecycle a superadmin needs:
provision a new firm and its first admin, edit its plan/limits/branding,
suspend or delete it, impersonate it to see exactly what the firm sees, and
resend the admin's sign-in credentials. All of it is superadmin-only
(SuperadminDep) and audited.

`max_clients` / `max_users` / `is_demo` are kept in Tenant.settings (JSONB) so
no schema migration is needed; a null cap reads as unlimited.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import func, or_, select, text, true

from ..config import settings as app_settings
from ..deps import SessionDep, SuperadminDep, client_ip
from ..models import AuditLog, Client, Deadline, EngagementLetter, Profile, Tenant
from ..permissions import seed_default_roles
from ..schemas import (
    ExpiryAlert,
    ImpersonateResult,
    PlatformAuditLogRead,
    RemindTenantInput,
    TenantAdminCreate,
    TenantAdminDetail,
    TenantAdminEdit,
    TenantAdminSummary,
    TenantProvisionResult,
)
from ..services import accounts, audit, local_auth, plan_expiry, vercel_analytics
from ..services.accounts import AccountError
from ..services.email import deliver, email_status, test_message_html
from ..utils import ensure_found
from .reminders import sweep_tenant

router = APIRouter(prefix="/admin", tags=["admin"])


# --- helpers -----------------------------------------------------------------
def _int_cap(value: Any) -> int | None:
    """A stored limit, or None for 'unlimited'. Bools are not ints here."""
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value)
    return None


def _caps(tenant: Tenant) -> tuple[int | None, int | None, bool, bool]:
    s = tenant.settings or {}
    return (
        _int_cap(s.get("max_clients")),
        _int_cap(s.get("max_users")),
        bool(s.get("is_demo")),
        bool(s.get("is_platform")),
    )


def _is_platform(tenant: Tenant) -> bool:
    """The platform operator's own internal workspace, flagged via
    Tenant.settings.is_platform (see provision_tenant/edit_tenant below) — not
    a customer firm, so it's excluded from the "Firms" list/stats and can't be
    deleted from here like a real tenant could be."""
    return bool((tenant.settings or {}).get("is_platform"))


async def _firm_admin(session: SessionDep, tenant_id: uuid.UUID) -> Profile | None:
    """The firm's own admin login — the earliest owner, or failing that the
    earliest admin. This is who a superadmin impersonates and whose credentials
    'resend invite' rotates."""
    for role in ("owner", "admin"):
        found = await session.scalar(
            select(Profile)
            .where(
                Profile.tenant_id == tenant_id,
                Profile.client_id.is_(None),
                Profile.role == role,
            )
            .order_by(Profile.created_at)
            .limit(1)
        )
        if found is not None:
            return found
    return None


def _summary(tenant: Tenant, *, clients: int, users: int, letters: int, admin_email: str | None) -> dict[str, Any]:
    max_clients, max_users, is_demo, is_platform = _caps(tenant)
    return {
        "id": tenant.id,
        "name": tenant.name,
        "slug": tenant.slug,
        "plan": tenant.plan,
        "seats": tenant.seats,
        "is_active": tenant.is_active,
        "is_demo": is_demo,
        "is_platform": is_platform,
        "custom_domain": tenant.custom_domain,
        "admin_email": admin_email or tenant.email,
        "trial_ends_at": tenant.trial_ends_at,
        "plan_expires_at": tenant.plan_expires_at,
        "service_expires_at": tenant.service_expires_at,
        "created_at": tenant.created_at,
        "clients": clients,
        "users": users,
        "signed_letters": letters,
        "max_clients": max_clients,
        "max_users": max_users,
    }


async def _detail(session: SessionDep, tenant: Tenant) -> dict[str, Any]:
    clients = await session.scalar(
        select(func.count(Client.id)).where(Client.tenant_id == tenant.id)
    ) or 0
    users = await session.scalar(
        select(func.count(Profile.id)).where(
            Profile.tenant_id == tenant.id, Profile.client_id.is_(None)
        )
    ) or 0
    letters = await session.scalar(
        select(func.count(EngagementLetter.id)).where(
            EngagementLetter.tenant_id == tenant.id, EngagementLetter.status == "signed"
        )
    ) or 0
    admin = await _firm_admin(session, tenant.id)

    data = _summary(
        tenant, clients=clients, users=users, letters=letters,
        admin_email=admin.email if admin else None,
    )
    data.update(
        {
            "legal_name": tenant.legal_name,
            "email": tenant.email,
            "phone": tenant.phone,
            "website": tenant.website,
            "brand_color": tenant.brand_color,
            "accent_color": tenant.accent_color,
            "logo_url": tenant.logo_url,
            "email_from_name": tenant.email_from_name,
            "admin_id": admin.id if admin else None,
            "admin_name": (admin.full_name or admin.email) if admin else None,
            "admin_last_seen": admin.last_seen_at if admin else None,
        }
    )
    return data


async def _unique_slug(session: SessionDep, name: str) -> str:
    slug = await session.scalar(text("select public.unique_tenant_slug(:name)"), {"name": name})
    return slug or name.strip().lower().replace(" ", "-")


# --- read --------------------------------------------------------------------
@router.get("/tenants", response_model=list[TenantAdminSummary])
async def list_tenants(session: SessionDep, user: SuperadminDep) -> list[dict[str, Any]]:
    tenants = [
        t
        for t in (await session.scalars(select(Tenant).order_by(Tenant.created_at.desc()))).all()
        if not _is_platform(t)
    ]

    client_counts = dict((await session.execute(
        select(Client.tenant_id, func.count(Client.id)).group_by(Client.tenant_id)
    )).all())
    user_counts = dict((await session.execute(
        select(Profile.tenant_id, func.count(Profile.id))
        .where(Profile.client_id.is_(None))
        .group_by(Profile.tenant_id)
    )).all())
    letter_counts = dict((await session.execute(
        select(EngagementLetter.tenant_id, func.count(EngagementLetter.id))
        .where(EngagementLetter.status == "signed")
        .group_by(EngagementLetter.tenant_id)
    )).all())

    # Earliest owner per tenant, in one pass (rows arrive oldest-first per
    # tenant, so the first seen for each is the earliest).
    admin_emails: dict[uuid.UUID, str] = {}
    for tid, email in (await session.execute(
        select(Profile.tenant_id, Profile.email)
        .where(Profile.client_id.is_(None), Profile.role == "owner")
        .order_by(Profile.tenant_id, Profile.created_at)
    )).all():
        admin_emails.setdefault(tid, email)

    return [
        _summary(
            tenant,
            clients=client_counts.get(tenant.id, 0),
            users=user_counts.get(tenant.id, 0),
            letters=letter_counts.get(tenant.id, 0),
            admin_email=admin_emails.get(tenant.id),
        )
        for tenant in tenants
    ]


@router.get("/tenants/{tenant_id}", response_model=TenantAdminDetail)
async def get_tenant(
    tenant_id: uuid.UUID, session: SessionDep, user: SuperadminDep
) -> dict[str, Any]:
    tenant = await session.get(Tenant, tenant_id)
    ensure_found(tenant, "Tenant")
    return await _detail(session, tenant)


# --- create ------------------------------------------------------------------
async def provision_tenant(
    session: SessionDep,
    payload: TenantAdminCreate,
    *,
    actor_id: uuid.UUID,
    actor_email: str,
    ip_address: str | None,
) -> dict[str, Any]:
    """Provision a new firm and its first admin login in one step.

    Shared by the single-tenant POST /admin/tenants route below and the
    superadmin bulk tenant importer (routers/imports.py) — creating a firm
    from a spreadsheet row is the same operation, just called in a loop.
    """
    name = payload.name.strip()

    if payload.slug:
        wanted = payload.slug.strip().lower()
        taken = await session.scalar(select(Tenant.id).where(Tenant.slug == wanted))
        if taken is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, f"The slug '{wanted}' is already taken.")
        slug = wanted
    else:
        slug = await _unique_slug(session, name)

    admin_email = str(payload.admin_email).strip().lower()
    tenant = Tenant(
        name=name,
        slug=slug,
        email=admin_email,
        email_from_name=name,
        plan=payload.plan.strip() or "trial",
        custom_domain=(payload.custom_domain or "").strip() or None,
        seats=payload.max_users if payload.max_users is not None else 5,
        trial_ends_at=datetime.now(timezone.utc) + timedelta(days=14),
        settings={
            "max_clients": payload.max_clients,
            "max_users": payload.max_users,
            "is_demo": payload.is_demo,
            "is_platform": payload.is_platform,
        },
    )
    session.add(tenant)
    await session.flush()

    await session.execute(
        text("select public.seed_default_services(:tenant_id)"), {"tenant_id": str(tenant.id)}
    )
    await seed_default_roles(session, tenant.id)

    try:
        provisioned = await accounts.provision(
            session,
            tenant=tenant,
            email=admin_email,
            full_name=payload.admin_name.strip() or admin_email.split("@")[0],
            role="owner",
            send_welcome=payload.send_email,
            reply_to=actor_email,
        )
    except AccountError as exc:
        raise HTTPException(exc.status_code, str(exc)) from exc

    await audit.record(
        session,
        tenant_id=tenant.id,
        actor_id=actor_id,
        actor_email=actor_email,
        action="created",
        entity="tenant",
        entity_id=tenant.id,
        summary=f"Provisioned firm {tenant.name} with admin {admin_email}",
        ip_address=ip_address,
    )

    detail = await _detail(session, tenant)
    return {
        "tenant": detail,
        "admin": {
            "profile_id": provisioned.profile.id,
            "email": admin_email,
            "full_name": provisioned.profile.full_name,
            "role": "owner",
            "temp_password": provisioned.temp_password,
            "login_url": accounts.login_url(),
            "email_sent": provisioned.email_sent,
            "message": (
                "Firm created and the admin's credentials were emailed."
                if provisioned.email_sent
                else "Firm created — email delivery isn't configured, so share the password below."
            ),
        },
    }


@router.post("/tenants", response_model=TenantProvisionResult, status_code=status.HTTP_201_CREATED)
async def create_tenant(
    payload: TenantAdminCreate, session: SessionDep, user: SuperadminDep, request: Request
) -> dict[str, Any]:
    return await provision_tenant(
        session,
        payload,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        ip_address=client_ip(request),
    )


# --- edit / suspend ----------------------------------------------------------
async def apply_tenant_edit(session: SessionDep, tenant: Tenant, data: dict[str, Any]) -> list[str]:
    """The field-by-field diff/apply behind PATCH /admin/tenants/{id} — pulled
    out so a plan-change approval (routers/plan_requests.py) can apply the
    same plan/cap fields through the same code path rather than a second,
    possibly-diverging copy. `data` is expected to already be
    `payload.model_dump(exclude_unset=True)`-shaped: only keys the caller
    actually means to change should be present at all."""
    changed: list[str] = []

    if "slug" in data and data["slug"]:
        wanted = data["slug"].strip().lower()
        if wanted != tenant.slug:
            taken = await session.scalar(
                select(Tenant.id).where(Tenant.slug == wanted, Tenant.id != tenant.id)
            )
            if taken is not None:
                raise HTTPException(status.HTTP_409_CONFLICT, f"The slug '{wanted}' is already taken.")
            tenant.slug = wanted
            changed.append("slug")

    for field in ("name", "plan"):
        if field in data and data[field] is not None:
            value = data[field].strip()
            if value and getattr(tenant, field) != value:
                setattr(tenant, field, value)
                changed.append(field)

    if "email" in data:
        value = (data["email"] or "").strip() or None
        if tenant.email != value:
            tenant.email = value
            changed.append("email")

    if "custom_domain" in data:
        value = (data["custom_domain"] or "").strip() or None
        if tenant.custom_domain != value:
            tenant.custom_domain = value
            changed.append("custom_domain")

    if "is_active" in data and data["is_active"] is not None and tenant.is_active != data["is_active"]:
        tenant.is_active = data["is_active"]
        changed.append("is_active")

    # Expiry dates (0024). A present key with a datetime sets it; an explicit null
    # clears it (untracked). Moving a date resets that axis's reminder marker
    # below so the daily sweep re-notifies from the top rung.
    expiry_reset: list[str] = []
    for field, target in (("plan_expires_at", "plan"), ("service_expires_at", "service")):
        if field not in data:
            continue
        value = data[field]
        if isinstance(value, datetime) and value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        if getattr(tenant, field) != value:
            setattr(tenant, field, value)
            changed.append(field)
            expiry_reset.append(target)

    # settings-backed caps and the demo/platform flags — merge, don't clobber other keys.
    new_settings = dict(tenant.settings or {})
    for key in ("max_clients", "max_users", "is_demo", "is_platform"):
        if key in data:
            new_settings[key] = data[key]
            changed.append(key)
    for target in expiry_reset:
        plan_expiry.reset_marker(new_settings, target)
    if data.get("max_users") is not None:
        tenant.seats = data["max_users"]
    tenant.settings = new_settings

    await session.flush()
    return changed


@router.patch("/tenants/{tenant_id}", response_model=TenantAdminDetail)
async def update_tenant(
    tenant_id: uuid.UUID,
    payload: TenantAdminEdit,
    session: SessionDep,
    user: SuperadminDep,
    request: Request,
) -> dict[str, Any]:
    tenant = await session.get(Tenant, tenant_id)
    ensure_found(tenant, "Tenant")

    changed = await apply_tenant_edit(session, tenant, payload.model_dump(exclude_unset=True))

    if changed:
        await audit.record(
            session,
            tenant_id=tenant.id,
            actor_id=user.profile.id,
            actor_email=user.profile.email,
            action="updated",
            entity="tenant",
            entity_id=tenant.id,
            summary=f"Updated {tenant.name} ({', '.join(sorted(set(changed)))})",
            ip_address=client_ip(request),
        )

    return await _detail(session, tenant)


@router.post("/tenants/{tenant_id}/suspend", response_model=TenantAdminDetail)
async def suspend_tenant(
    tenant_id: uuid.UUID,
    session: SessionDep,
    user: SuperadminDep,
    request: Request,
    active: bool = Query(default=False, description="False suspends, True re-activates."),
) -> dict[str, Any]:
    """Suspend (or re-activate) a firm. A suspended firm's logins are refused
    at sign-in — get_current_user / login both reject an inactive account, and
    setting the tenant inactive is the flag the rest of the platform reads."""
    tenant = await session.get(Tenant, tenant_id)
    ensure_found(tenant, "Tenant")
    if tenant.is_active != active:
        tenant.is_active = active
        await session.flush()
        await audit.record(
            session,
            tenant_id=tenant.id,
            actor_id=user.profile.id,
            actor_email=user.profile.email,
            action="activated" if active else "suspended",
            entity="tenant",
            entity_id=tenant.id,
            summary=f"{'Re-activated' if active else 'Suspended'} firm {tenant.name}",
            ip_address=client_ip(request),
        )
    return await _detail(session, tenant)


# --- plan / server-domain expiry (0024) --------------------------------------
@router.get("/expiry-alerts", response_model=list[ExpiryAlert])
async def expiry_alerts(session: SessionDep, user: SuperadminDep) -> list[dict[str, Any]]:
    """Every customer firm with a plan or server/domain date within the alert
    window (or already past), soonest first — the data behind the superadmin's
    blinking expiry popup and the plan-requests "Renewals" section. A firm can
    contribute two rows (one per axis). The platform's own workspace is excluded."""
    today = datetime.now(timezone.utc).date()
    rows = (
        (
            await session.execute(
                select(Tenant).where(
                    or_(
                        Tenant.plan_expires_at.is_not(None),
                        Tenant.service_expires_at.is_not(None),
                    )
                )
            )
        )
        .scalars()
        .all()
    )

    alerts: list[dict[str, Any]] = []
    for tenant in rows:
        if _is_platform(tenant):
            continue
        for entry in plan_expiry.alert_entries(tenant, today):
            alerts.append(
                {
                    "tenant_id": tenant.id,
                    "tenant_name": tenant.name,
                    "target": entry["target"],
                    "expires_at": entry["expires_at"],
                    "days_remaining": entry["days_remaining"],
                    "severity": entry["severity"],
                }
            )
    alerts.sort(key=lambda a: a["days_remaining"])
    return alerts


@router.post("/tenants/{tenant_id}/remind", response_model=TenantAdminDetail)
async def remind_tenant(
    tenant_id: uuid.UUID,
    payload: RemindTenantInput,
    session: SessionDep,
    user: SuperadminDep,
    request: Request,
) -> dict[str, Any]:
    """Manually drop an expiry reminder into a company's bell — the superadmin's
    "Send reminder now" button. Independent of the daily sweep, so it can be sent
    the moment an overdue firm is spotted in the alert popup."""
    tenant = await session.get(Tenant, tenant_id)
    ensure_found(tenant, "Tenant")

    meta = plan_expiry.TARGETS[payload.target]
    label = meta["label"]
    expires_at = getattr(tenant, meta["attr"])
    if payload.message:
        body = payload.message
    elif expires_at is not None:
        on_date = expires_at.date().isoformat()
        days = (expires_at.date() - datetime.now(timezone.utc).date()).days
        body = (
            f"Your {label} expired on {on_date}. Renew now to restore your SpidNums services."
            if days < 0
            else f"Your {label} is set to expire on {on_date}. "
            "Request a renewal to avoid any interruption to your SpidNums services."
        )
    else:
        body = (
            f"Please review your {label} with your provider to keep your SpidNums "
            "services running without interruption."
        )

    await audit.notify(
        session,
        tenant_id=tenant.id,
        type=meta["type"],
        title=f"Reminder: renew your {label}",
        body=body,
        link="/billing",
    )
    await audit.record(
        session,
        tenant_id=tenant.id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="reminded",
        entity="tenant",
        entity_id=tenant.id,
        summary=f"Sent {label} renewal reminder to {tenant.name}",
        ip_address=client_ip(request),
    )
    return await _detail(session, tenant)


# --- delete ------------------------------------------------------------------
@router.delete("/tenants/{tenant_id}")
async def delete_tenant(
    tenant_id: uuid.UUID, session: SessionDep, user: SuperadminDep, request: Request
) -> dict[str, Any]:
    """Permanently delete a firm and everything under it. Every tenant-scoped
    table cascades on tenant_id (see db/migrations/0001_schema.sql), so the
    clients, tasks, deadlines, letters, logins and this firm's own audit trail
    all go with it. The deletion audit row is written at platform scope
    (tenant_id null) so it survives the cascade."""
    tenant = await session.get(Tenant, tenant_id)
    ensure_found(tenant, "Tenant")
    if _is_platform(tenant):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "The platform's own workspace can't be deleted.")

    name, slug = tenant.name, tenant.slug
    await session.delete(tenant)
    await session.flush()

    await audit.record(
        session,
        tenant_id=None,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="deleted",
        entity="tenant",
        entity_id=tenant_id,
        summary=f"Deleted firm {name} ({slug}) and all of its data",
        ip_address=client_ip(request),
    )
    return {"ok": True, "message": f"{name} and all of its data were permanently deleted."}


# --- impersonate -------------------------------------------------------------
@router.post("/tenants/{tenant_id}/impersonate", response_model=ImpersonateResult)
async def impersonate_tenant(
    tenant_id: uuid.UUID, session: SessionDep, user: SuperadminDep, request: Request
) -> dict[str, Any]:
    """Mint a short-lived access token that drops the superadmin into this
    firm — the token still identifies them (audit shows their email), it just
    carries an act_as_tenant claim so every tenant-scoped router serves this
    firm's data. See services/local_auth.create_access_token and
    deps.get_current_user."""
    tenant = await session.get(Tenant, tenant_id)
    ensure_found(tenant, "Tenant")

    token = local_auth.create_access_token(user.profile, act_as_tenant=tenant.id)

    await audit.record(
        session,
        tenant_id=tenant.id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="impersonated",
        entity="tenant",
        entity_id=tenant.id,
        summary=f"Superadmin opened {tenant.name} as the firm",
        ip_address=client_ip(request),
    )
    return {
        "access_token": token,
        "expires_in": app_settings.access_token_ttl_seconds,
        "tenant_id": tenant.id,
        "tenant_name": tenant.name,
    }


@router.post("/tenants/{tenant_id}/resend-invite", response_model=dict)
async def resend_admin_invite(
    tenant_id: uuid.UUID, session: SessionDep, user: SuperadminDep, request: Request
) -> dict[str, Any]:
    """Rotate the firm admin's password to a fresh one-time value and re-send
    it — the superadmin equivalent of the firm's own 'resend credentials'."""
    tenant = await session.get(Tenant, tenant_id)
    ensure_found(tenant, "Tenant")
    admin = await _firm_admin(session, tenant.id)
    if admin is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This firm has no admin login to resend to.")

    try:
        result = await accounts.reissue(
            session, tenant=tenant, profile=admin, reply_to=user.profile.email
        )
    except AccountError as exc:
        raise HTTPException(exc.status_code, str(exc)) from exc

    await audit.record(
        session,
        tenant_id=tenant.id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="password_reset",
        entity="profile",
        entity_id=admin.id,
        summary=f"Superadmin reissued credentials for {admin.email}",
        ip_address=client_ip(request),
    )
    return {
        "email": admin.email,
        "temp_password": result.temp_password,
        "login_url": accounts.login_url(),
        "email_sent": result.email_sent,
        "message": (
            "New credentials emailed to the firm admin."
            if result.email_sent
            else "Password reset — email delivery isn't configured, so share the password below."
        ),
    }


# --- platform email (superadmin view of the default sender) ------------------
# The transport, sender and API key are configured via environment variables on
# the API (RESEND_API_KEY / SMTP_* / EMAIL_FROM) — deliberately not editable
# here, so a long-lived credential never lands in the database. These endpoints
# give the platform owner, who has no tenant of their own, the same "is email
# working / send me a test" visibility a firm admin gets at /settings/email.
class PlatformEmailTest(BaseModel):
    to: EmailStr | None = None


@router.get("/email")
async def platform_email_status(user: SuperadminDep) -> dict[str, Any]:
    """The platform default sender's delivery status — no key, ever (see
    services/email.email_status). Superadmin-scoped so a tenant-less platform
    owner can read it; the firm-facing GET /settings/email needs a tenant."""
    return email_status()


@router.post("/email/test")
async def platform_email_test(payload: PlatformEmailTest, user: SuperadminDep) -> dict[str, Any]:
    """Send a real message through the platform's configured transport, to the
    caller by default. Fixed, contentless template — not a usable relay."""
    recipient = str(payload.to) if payload.to else user.profile.email
    result = await deliver(
        to=recipient,
        subject="SpidNums: platform email delivery test",
        html=test_message_html(
            firm_name="SpidNums",
            requested_by=user.profile.full_name or user.profile.email,
            provider=app_settings.resolved_email_provider,
        ),
        reply_to=user.profile.email,
    )
    return {
        "ok": result.ok,
        "provider": result.provider,
        "to": recipient,
        "error": result.error,
        "message": (
            f"Test email sent to {recipient}. Check the inbox, and the spam folder."
            if result.ok
            else (result.error or "The message could not be sent.")
        ),
    }


# --- platform-wide operations (unchanged) ------------------------------------
@router.post("/reminders/sweep")
async def sweep_all_reminders(
    session: SessionDep, user: SuperadminDep, send_emails: bool = True
) -> dict[str, Any]:
    """Run the reminder sweep for every active firm.

    This is the endpoint a scheduler (Render cron, Supabase scheduled function)
    should hit once a day with a superadmin token — POST /reminders/run only
    covers the caller's own firm. Both are idempotent, so an overlapping manual
    run does no harm.
    """
    tenants = (
        await session.scalars(select(Tenant).where(Tenant.is_active.is_(True)))
    ).all()

    totals = {"tenants": 0, "created": 0, "skipped": 0, "emailed": 0, "scanned": 0}
    for tenant in tenants:
        result = await sweep_tenant(session, tenant, send_emails=send_emails)
        totals["tenants"] += 1
        for key, value in result.as_dict().items():
            totals[key] += value
    return totals


@router.get("/audit", response_model=list[PlatformAuditLogRead])
async def platform_audit(
    session: SessionDep, user: SuperadminDep, limit: int = Query(default=100, ge=1, le=500)
) -> list[dict[str, Any]]:
    rows = (
        await session.execute(
            select(AuditLog, Tenant.name)
            .outerjoin(Tenant, Tenant.id == AuditLog.tenant_id)
            .order_by(AuditLog.created_at.desc())
            .limit(limit)
        )
    ).all()
    return [
        {
            "id": entry.id,
            "actor_email": entry.actor_email,
            "action": entry.action,
            "entity": entry.entity,
            "entity_id": entry.entity_id,
            "summary": entry.summary,
            "created_at": entry.created_at,
            "tenant_name": tenant_name,
        }
        for entry, tenant_name in rows
    ]


@router.get("/reach")
async def platform_reach(session: SessionDep, user: SuperadminDep) -> dict[str, Any]:
    """The "Reach" page: how far the platform travels — marketing-site traffic
    (via Vercel Web Analytics, when configured) alongside live cross-tenant
    scale. Search-footprint / indexable-page counts are derived on the frontend
    from the sitemap so they can never drift from what's actually published."""
    return {
        "vercel": vercel_analytics.config_status(),
        "traffic": await vercel_analytics.fetch_traffic(),
        "scale": {
            "tenants": await session.scalar(select(func.count(Tenant.id))) or 0,
            "active_tenants": await session.scalar(
                select(func.count(Tenant.id)).where(Tenant.is_active.is_(True))
            ) or 0,
            "clients": await session.scalar(select(func.count(Client.id))) or 0,
            # Firm staff logins (client_id null) — the "seats" number, matching
            # the tenants table's Users column rather than counting portal logins.
            "users": await session.scalar(
                select(func.count(Profile.id)).where(Profile.client_id.is_(None))
            ) or 0,
            "engagements": await session.scalar(select(func.count(EngagementLetter.id))) or 0,
        },
    }


@router.get("/stats")
async def platform_stats(session: SessionDep, user: SuperadminDep) -> dict[str, Any]:
    # Same exclusion as list_tenants — the platform's own workspace isn't one
    # of "the firms" these counts are about.
    platform_ids = {
        tid
        for tid, s in (await session.execute(select(Tenant.id, Tenant.settings))).all()
        if bool((s or {}).get("is_platform"))
    }
    not_platform = Tenant.id.notin_(platform_ids) if platform_ids else true()

    return {
        "tenants": await session.scalar(select(func.count(Tenant.id)).where(not_platform)) or 0,
        "active_tenants": await session.scalar(
            select(func.count(Tenant.id)).where(Tenant.is_active.is_(True), not_platform)
        ) or 0,
        "suspended_tenants": await session.scalar(
            select(func.count(Tenant.id)).where(Tenant.is_active.is_(False), not_platform)
        ) or 0,
        "trialing_tenants": await session.scalar(
            select(func.count(Tenant.id)).where(
                Tenant.is_active.is_(True), Tenant.plan == "trial", not_platform
            )
        ) or 0,
        "users": await session.scalar(select(func.count(Profile.id))) or 0,
        "clients": await session.scalar(select(func.count(Client.id))) or 0,
        "deadlines": await session.scalar(select(func.count(Deadline.id))) or 0,
        "letters_signed": await session.scalar(
            select(func.count(EngagementLetter.id)).where(EngagementLetter.status == "signed")
        ) or 0,
    }
