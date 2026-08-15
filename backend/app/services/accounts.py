"""Provisioning a login someone else created for you.

Three surfaces need this and must behave identically: Accountants ("Add
accountant"), Users ("Add user"), and the bulk user import. Keeping the logic
here rather than in each router is what guarantees a staff login created from the
spreadsheet importer is the same object as one created from the modal — same
`must_change_password` flag, same email, same Supabase user.

Two account shapes come out of the same call:

* **Firm staff** — `client_id` is None. Sees the whole practice, subject to role.
* **Client portal** — `client_id` set. Pinned to that one client by
  `deps.get_book_scope`, and rejected outright by `deps.get_tenant_user`.

The distinction lives in one column, so it is set in one place.
"""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from urllib.parse import quote

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..models import Client, ClientService, Deadline, Profile, Service, Tenant
from .email import portal_welcome_html, send_email, sender_name, staff_welcome_html
from .supabase_admin import (
    SupabaseAdminError,
    create_auth_user,
    delete_auth_user,
    generate_magic_link,
    generate_temp_password,
    is_configured,
    reset_password,
)

log = logging.getLogger(__name__)

ROLE_LABELS = {
    "owner": "an owner",
    "admin": "an administrator",
    "member": "a team member",
    "viewer": "a read-only viewer",
}


def login_url() -> str:
    return f"{settings.public_app_url.rstrip('/')}/login"


def portal_login_url(*, token_hash: str, email: str, next_path: str = "/dashboard") -> str:
    """One-click sign-in link.

    `/portal-login` exchanges the token for a session, then forwards to
    `next_path` — which is why the same route serves staff (`/overview`) and
    client-portal (`/dashboard`) logins.
    """
    return (
        f"{settings.public_app_url.rstrip('/')}/portal-login"
        # safe="" so the leading slash is percent-encoded too — `quote` leaves
        # "/" alone by default, which works but leaves a raw path sitting in a
        # query value for every mail client and link-rewriter to reinterpret.
        f"?token_hash={token_hash}&email={quote(email, safe='')}&next={quote(next_path, safe='')}"
    )


def staff_login_url(*, token_hash: str, email: str) -> str:
    return portal_login_url(token_hash=token_hash, email=email, next_path="/overview")


class AccountError(RuntimeError):
    """A caller-visible reason the account could not be provisioned."""

    def __init__(self, message: str, *, status_code: int = 409) -> None:
        super().__init__(message)
        self.status_code = status_code


@dataclass(slots=True)
class Provisioned:
    profile: Profile
    temp_password: str
    email_sent: bool
    created: bool


async def assert_available(session: AsyncSession, email: str) -> None:
    """Reject an email that already has a profile anywhere on the platform.

    Deliberately not scoped to the tenant: Supabase Auth keys users on email
    globally, so a second firm claiming the same address would collide at
    `create_auth_user` after we had already written our own row.
    """
    existing = await session.scalar(select(Profile).where(Profile.email == email))
    if existing is None:
        return
    raise AccountError(f"{email} already has an account on the platform.")


def _routing_metadata(*, tenant_id: uuid.UUID, client_id: uuid.UUID | None) -> dict[str, object]:
    """Stamped into Supabase `user_metadata`, and so into the JWT.

    The Next.js proxy reads this to decide whether a signed-in token belongs on
    the firm surface or in the client portal, without querying the database on
    every request. It is a routing hint only — every endpoint still derives
    permission from `profiles`, so a tampered token buys nothing.
    """
    return {
        "tenant_id": str(tenant_id),
        "client_id": str(client_id) if client_id is not None else None,
        "is_portal": client_id is not None,
        "is_staff": client_id is None,
    }


def require_configured() -> None:
    if not is_configured():
        raise AccountError(
            "Creating logins requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the API. "
            "Add them, or use an email invitation instead.",
            status_code=424,
        )


async def provision(
    session: AsyncSession,
    *,
    tenant: Tenant,
    email: str,
    full_name: str,
    role: str = "member",
    client_id: uuid.UUID | None = None,
    title: str | None = None,
    phone: str | None = None,
    weekly_capacity: int = 40,
    send_welcome: bool = True,
    reply_to: str | None = None,
) -> Provisioned:
    """Create the Supabase Auth user and the matching `profiles` row.

    Raises AccountError — never a bare HTTPException — so the bulk importer can
    catch a single bad row and carry on, while the single-record routers turn it
    into a status code.
    """
    email = email.strip().lower()
    require_configured()
    await assert_available(session, email)

    client: Client | None = None
    if client_id is not None:
        client = await session.scalar(
            select(Client).where(Client.id == client_id, Client.tenant_id == tenant.id)
        )
        if client is None:
            raise AccountError("That client record does not exist in this firm.", status_code=404)

    temp_password = generate_temp_password()
    try:
        new_id = await create_auth_user(
            email=email,
            password=temp_password,
            full_name=full_name,
            metadata=_routing_metadata(tenant_id=tenant.id, client_id=client_id),
        )
    except SupabaseAdminError as exc:
        raise AccountError(str(exc), status_code=424) from exc

    profile = Profile(
        id=new_id,
        tenant_id=tenant.id,
        client_id=client_id,
        email=email,
        full_name=full_name.strip() or email,
        title=title,
        phone=phone,
        # A portal login has no say over firm data, whatever role was asked for.
        role="member" if client_id is not None else role,
        weekly_capacity=weekly_capacity,
        is_active=True,
        must_change_password=True,
    )
    session.add(profile)
    await session.flush()

    email_sent = False
    if send_welcome:
        email_sent = await _send_welcome(
            session,
            tenant=tenant,
            profile=profile,
            client=client,
            temp_password=temp_password,
            reply_to=reply_to,
        )

    return Provisioned(
        profile=profile, temp_password=temp_password, email_sent=email_sent, created=True
    )


async def reissue(
    session: AsyncSession,
    *,
    tenant: Tenant,
    profile: Profile,
    send_welcome: bool = True,
    reply_to: str | None = None,
) -> Provisioned:
    """Rotate an existing login's password and re-send the credentials.

    "Resend" is necessarily "reset and send": Supabase stores only the hash, so
    the password issued the first time cannot be read back.
    """
    require_configured()

    client: Client | None = None
    if profile.client_id is not None:
        client = await session.get(Client, profile.client_id)

    temp_password = generate_temp_password()
    try:
        await reset_password(user_id=profile.id, password=temp_password)
    except SupabaseAdminError as exc:
        raise AccountError(str(exc), status_code=424) from exc

    profile.must_change_password = True
    profile.is_active = True
    await session.flush()

    email_sent = False
    if send_welcome:
        email_sent = await _send_welcome(
            session,
            tenant=tenant,
            profile=profile,
            client=client,
            temp_password=temp_password,
            reply_to=reply_to,
        )

    return Provisioned(
        profile=profile, temp_password=temp_password, email_sent=email_sent, created=False
    )


async def revoke(profile: Profile) -> bool:
    """Delete the Supabase Auth login behind a profile.

    Returns whether it succeeded rather than raising: the caller has already
    deactivated the profile, which is what actually blocks access, so a failure
    here is a shortfall to report — not a reason to leave the account enabled.
    """
    if not is_configured():
        return False
    try:
        await delete_auth_user(user_id=profile.id)
        return True
    except SupabaseAdminError as exc:
        log.warning("Could not revoke the Supabase login for %s: %s", profile.email, exc)
        return False


async def _client_engagement_summary(
    session: AsyncSession, client_id: uuid.UUID
) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    """What this client is signed up for, and what is coming up.

    Both go into the welcome email so a new portal user's first message answers
    "what do you actually do for me, and what happens next" rather than only
    handing over a password. Read at send time from the same tables the portal
    renders, so the email cannot describe a different engagement than the app.
    """
    services = [
        {"name": name, "frequency": str(frequency).replace("_", " ")}
        for name, frequency in (
            await session.execute(
                select(Service.name, ClientService.frequency)
                .join(Service, Service.id == ClientService.service_id)
                .where(
                    ClientService.client_id == client_id,
                    ClientService.is_active.is_(True),
                )
                .order_by(Service.name)
            )
        ).all()
    ]

    deadlines = [
        {"title": title, "due_date": due.isoformat() if due else ""}
        for title, due in (
            await session.execute(
                select(Deadline.title, Deadline.due_date)
                .where(
                    Deadline.client_id == client_id,
                    Deadline.status.in_(("open", "snoozed")),
                )
                .order_by(Deadline.due_date)
                .limit(4)
            )
        ).all()
    ]

    return services, deadlines


async def _send_welcome(
    session: AsyncSession,
    *,
    tenant: Tenant,
    profile: Profile,
    client: Client | None,
    temp_password: str,
    reply_to: str | None,
) -> bool:
    """Client-portal accounts get the full onboarding email (documents,
    deadlines, invoices, one-click magic link); staff get the leaner
    credentials-and-role email."""
    if profile.client_id is not None:
        client_name = (
            (client.business_name or client.legal_name) if client else (profile.full_name or "there")
        )
        # Who to talk to. The client's assigned accountant if there is one,
        # otherwise whoever created the account (reply_to).
        contact_name: str | None = None
        if client is not None and client.owner_id is not None:
            owner = await session.get(Profile, client.owner_id)
            contact_name = owner.full_name if owner else None
        magic_token = await generate_magic_link(email=profile.email)
        services, deadlines = await _client_engagement_summary(session, profile.client_id)
        return await send_email(
            to=profile.email,
            subject=f"Welcome to {tenant.name} — your client portal is ready",
            html=portal_welcome_html(
                firm_name=tenant.name,
                client_name=client_name,
                email=profile.email,
                temp_password=temp_password,
                login_url=login_url(),
                magic_url=(
                    portal_login_url(token_hash=magic_token, email=profile.email)
                    if magic_token
                    else None
                ),
                services=services,
                deadlines=deadlines,
                contact_name=contact_name,
                contact_email=reply_to,
                brand_color=tenant.brand_color,
            ),
            reply_to=reply_to,
            from_name=sender_name(tenant.name, tenant.email_from_name),
        )

    # Staff get a magic link too. `staff_welcome_html` has always accepted one;
    # it just was never passed, so an accountant had to type the temporary
    # password by hand while a client got one-click access.
    staff_token = await generate_magic_link(email=profile.email)
    return await send_email(
        to=profile.email,
        subject=f"Your {tenant.name} practice account is ready",
        html=staff_welcome_html(
            firm_name=tenant.name,
            full_name=profile.full_name or profile.email,
            email=profile.email,
            temp_password=temp_password,
            login_url=login_url(),
            role_label=ROLE_LABELS.get(profile.role, "a team member"),
            magic_url=(
                staff_login_url(token_hash=staff_token, email=profile.email)
                if staff_token
                else None
            ),
            brand_color=tenant.brand_color,
        ),
        reply_to=reply_to,
        from_name=sender_name(tenant.name, tenant.email_from_name),
    )
