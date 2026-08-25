"""Internal team roster, workload and invitations."""

from __future__ import annotations

import secrets
import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select

from ..config import settings
from ..deps import AdminUserDep, CurrentUserDep, SessionDep, TenantUserDep, client_ip
from ..models import Client, Deadline, Invitation, Profile, Task, TeamNote
from ..schemas import (
    CredentialResult,
    InvitationAccept,
    InvitationCreate,
    InvitationRead,
    Ok,
    ProfileRead,
    ProfileUpdate,
    StaffCreate,
    TeamMemberRead,
    TeamNoteCreate,
    TeamNoteRead,
)
from ..services import accounts, audit
from ..services.accounts import ROLE_LABELS, AccountError
from ..services.email import invite_html, send_email, sender_name
from ..services.rate_limit import rate_limit_by_tenant
from ..utils import apply_updates, ensure_found, now_utc, read, today_utc

router = APIRouter(prefix="/team", tags=["team"])

OPEN_TASK_STATES = ("todo", "in_progress", "review", "blocked")

# Per-tenant, not per-IP: a firm's staff share an office network, and one
# firm's abuse shouldn't affect another's quota. Generous enough for a firm
# onboarding a full team in one sitting; tight enough to blunt a compromised
# admin session or a scripted account-creation loop.
_account_creation_rate_limit = rate_limit_by_tenant("team-account-creation", limit=20, window_seconds=3600)


def _invite_url(token: str) -> str:
    return f"{settings.public_app_url.rstrip('/')}/signup?invite={token}"


@router.get("", response_model=list[TeamMemberRead])
async def list_team(session: SessionDep, user: TenantUserDep) -> list[TeamMemberRead]:
    # client_id is null = firm staff. Client-portal logins share the tenant but
    # belong on /users, not on the accountant roster.
    members = (
        await session.scalars(
            select(Profile)
            .where(Profile.tenant_id == user.tenant_id, Profile.client_id.is_(None))
            .order_by(Profile.is_active.desc(), Profile.full_name)
        )
    ).all()

    task_counts = dict(
        (
            await session.execute(
                select(Task.assignee_id, func.count(Task.id))
                .where(Task.tenant_id == user.tenant_id, Task.status.in_(OPEN_TASK_STATES))
                .group_by(Task.assignee_id)
            )
        ).all()
    )
    client_counts = dict(
        (
            await session.execute(
                select(Client.owner_id, func.count(Client.id))
                .where(Client.tenant_id == user.tenant_id, Client.status == "active")
                .group_by(Client.owner_id)
            )
        ).all()
    )
    overdue_counts = dict(
        (
            await session.execute(
                select(Deadline.assignee_id, func.count(Deadline.id))
                .where(
                    Deadline.tenant_id == user.tenant_id,
                    Deadline.status == "open",
                    Deadline.due_date < today_utc(),
                )
                .group_by(Deadline.assignee_id)
            )
        ).all()
    )

    return [
        read(
            TeamMemberRead,
            member,
            open_tasks=task_counts.get(member.id, 0),
            clients=client_counts.get(member.id, 0),
            overdue=overdue_counts.get(member.id, 0),
        )
        for member in members
    ]


@router.post(
    "",
    response_model=CredentialResult,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(_account_creation_rate_limit)],
)
async def create_member(
    payload: StaffCreate, session: SessionDep, user: AdminUserDep, request: Request
) -> CredentialResult:
    """Create an accountant's login and email them their credentials.

    The alternative flow — POST /team/invitations — mails a signup link and
    waits for the person to choose their own password. This one is for the
    common case where the firm admin is onboarding staff directly and wants the
    account to exist immediately, so the temporary password is generated here
    and `must_change_password` forces a reset on first sign-in.
    """
    email = str(payload.email).strip().lower()

    try:
        result = await accounts.provision(
            session,
            tenant=user.tenant,
            email=email,
            full_name=payload.full_name,
            role=payload.role,
            title=payload.title,
            phone=payload.phone,
            weekly_capacity=payload.weekly_capacity,
            send_welcome=payload.send_email,
            reply_to=user.profile.email,
        )
    except AccountError as exc:
        raise HTTPException(exc.status_code, str(exc)) from exc

    member = result.profile

    await audit.record(
        session,
        tenant_id=user.tenant_id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="created",
        entity="profile",
        entity_id=member.id,
        summary=f"Created {payload.role} account for {member.full_name} ({email})",
        ip_address=client_ip(request),
    )
    await audit.notify(
        session,
        tenant_id=user.tenant_id,
        type="team",
        title=f"{member.full_name} joined the team",
        body=f"Added as {ROLE_LABELS.get(payload.role, 'a team member')} by {user.profile.full_name or user.profile.email}.",
        link=f"/team/{member.id}",
    )

    return CredentialResult(
        profile_id=member.id,
        email=email,
        full_name=member.full_name,
        role=payload.role,
        temp_password=result.temp_password,
        login_url=accounts.login_url(),
        email_sent=result.email_sent,
        message=(
            "Credentials emailed."
            if result.email_sent
            else "Account created, but email delivery isn't configured — share the password below."
        ),
    )


@router.post(
    "/{profile_id}/resend-credentials",
    response_model=CredentialResult,
    dependencies=[Depends(_account_creation_rate_limit)],
)
async def resend_credentials(
    profile_id: uuid.UUID, session: SessionDep, user: AdminUserDep, request: Request
) -> CredentialResult:
    """Rotate a staff member's password to a fresh one-time value and re-send it.

    The original is unrecoverable once it's Argon2id-hashed, so "resend" is
    necessarily "reset and send" — the same shape as the client-portal resend in
    routers/clients.py.
    """
    member = await session.scalar(
        select(Profile).where(
            Profile.id == profile_id,
            Profile.tenant_id == user.tenant_id,
            Profile.client_id.is_(None),
        )
    )
    ensure_found(member, "Team member")

    try:
        result = await accounts.reissue(
            session, tenant=user.tenant, profile=member, reply_to=user.profile.email
        )
    except AccountError as exc:
        raise HTTPException(exc.status_code, str(exc)) from exc

    await audit.record(
        session,
        tenant_id=user.tenant_id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="password_reset",
        entity="profile",
        entity_id=member.id,
        summary=f"Issued a new temporary password for {member.full_name or member.email}",
        ip_address=client_ip(request),
    )

    return CredentialResult(
        profile_id=member.id,
        email=member.email,
        full_name=member.full_name,
        role=member.role,
        temp_password=result.temp_password,
        login_url=accounts.login_url(),
        email_sent=result.email_sent,
        message=(
            "New credentials emailed."
            if result.email_sent
            else "Password reset, but email delivery isn't configured — share the password below."
        ),
    )


@router.patch("/{profile_id}", response_model=TeamMemberRead)
async def update_member(
    profile_id: uuid.UUID,
    payload: ProfileUpdate,
    session: SessionDep,
    user: AdminUserDep,
    request: Request,
) -> TeamMemberRead:
    member = await session.scalar(
        select(Profile).where(Profile.id == profile_id, Profile.tenant_id == user.tenant_id)
    )
    ensure_found(member, "Team member")

    if payload.role is not None and member.id == user.profile.id and payload.role != "owner":
        owners = await session.scalar(
            select(func.count(Profile.id)).where(
                Profile.tenant_id == user.tenant_id, Profile.role == "owner"
            )
        )
        if member.role == "owner" and owners <= 1:
            raise HTTPException(status.HTTP_409_CONFLICT, "A firm must keep at least one owner.")

    changed = apply_updates(member, payload)
    await session.flush()

    if changed:
        await audit.record(
            session,
            tenant_id=user.tenant_id,
            actor_id=user.profile.id,
            actor_email=user.profile.email,
            action="updated",
            entity="profile",
            entity_id=member.id,
            summary=f"Updated {member.full_name or member.email} ({', '.join(changed)})",
            ip_address=client_ip(request),
        )
    return read(TeamMemberRead, member)


@router.delete("/{profile_id}", response_model=Ok)
async def remove_member(
    profile_id: uuid.UUID,
    session: SessionDep,
    user: AdminUserDep,
    request: Request,
    revoke_login: bool = True,
) -> Ok:
    """Remove an accountant from the firm.

    The `profiles` row is deactivated, not deleted: the clients, tasks and
    deadlines they own reference this id, and a hard delete would null those
    assignments out and lose the audit trail. Deactivating is enough to lock
    them out — get_current_user refuses an inactive profile's token — and every
    refresh token for the account is revoked as well (services/local_auth.py's
    admin_revoke_user), so the credentials themselves stop working rather than
    merely being rejected by us.
    """
    member = await session.scalar(
        select(Profile).where(
            Profile.id == profile_id,
            Profile.tenant_id == user.tenant_id,
            Profile.client_id.is_(None),
        )
    )
    ensure_found(member, "Team member")

    if member.id == user.profile.id:
        raise HTTPException(status.HTTP_409_CONFLICT, "You cannot remove your own account.")

    if member.role == "owner":
        owners = await session.scalar(
            select(func.count(Profile.id)).where(
                Profile.tenant_id == user.tenant_id,
                Profile.role == "owner",
                Profile.is_active.is_(True),
            )
        )
        if (owners or 0) <= 1:
            raise HTTPException(status.HTTP_409_CONFLICT, "A firm must keep at least one owner.")

    member.is_active = False
    await session.flush()

    # The profile is already deactivated, so access is blocked either way —
    # accounts.revoke reports a shortfall rather than failing the request.
    login_revoked = await accounts.revoke(session, member) if revoke_login else False

    await audit.record(
        session,
        tenant_id=user.tenant_id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="deactivated",
        entity="profile",
        entity_id=member.id,
        summary=f"Removed {member.full_name or member.email} from the team",
        metadata={"login_revoked": login_revoked},
        ip_address=client_ip(request),
    )
    return Ok(
        message=(
            f"{member.full_name or member.email} removed and their login revoked."
            if login_revoked
            else f"{member.full_name or member.email} deactivated — they can no longer sign in."
        )
    )


async def _get_member(session: SessionDep, tenant_id: uuid.UUID, profile_id: uuid.UUID) -> Profile:
    member = await session.scalar(
        select(Profile).where(
            Profile.id == profile_id,
            Profile.tenant_id == tenant_id,
            Profile.client_id.is_(None),
        )
    )
    return ensure_found(member, "Team member")


@router.get("/{profile_id}/notes", response_model=list[TeamNoteRead])
async def list_team_notes(
    profile_id: uuid.UUID, session: SessionDep, user: TenantUserDep
) -> list[TeamNoteRead]:
    await _get_member(session, user.tenant_id, profile_id)
    rows = (
        await session.scalars(
            select(TeamNote)
            .where(TeamNote.tenant_id == user.tenant_id, TeamNote.profile_id == profile_id)
            .order_by(TeamNote.created_at.desc())
        )
    ).all()
    return [TeamNoteRead.model_validate(row) for row in rows]


@router.post("/{profile_id}/notes", response_model=TeamNoteRead, status_code=status.HTTP_201_CREATED)
async def create_team_note(
    profile_id: uuid.UUID, payload: TeamNoteCreate, session: SessionDep, user: AdminUserDep
) -> TeamNoteRead:
    """Admin-gated like every other write on a colleague's roster entry — a
    member's capacity/time-off notes are visible to the whole tenant (any
    TenantUserDep can list them) but only an admin adds one."""
    member = await _get_member(session, user.tenant_id, profile_id)
    row = TeamNote(
        tenant_id=user.tenant_id,
        profile_id=member.id,
        author_id=user.profile.id,
        author_name=user.profile.full_name or user.profile.email,
        body=payload.body,
    )
    session.add(row)
    await session.flush()
    return TeamNoteRead.model_validate(row)


@router.delete("/{profile_id}/notes/{note_id}", response_model=Ok)
async def delete_team_note(
    profile_id: uuid.UUID, note_id: uuid.UUID, session: SessionDep, user: AdminUserDep
) -> Ok:
    row = await session.scalar(
        select(TeamNote).where(
            TeamNote.id == note_id,
            TeamNote.profile_id == profile_id,
            TeamNote.tenant_id == user.tenant_id,
        )
    )
    ensure_found(row, "Note")
    await session.delete(row)
    return Ok(message="Note removed")


@router.get("/invitations", response_model=list[InvitationRead])
async def list_invitations(session: SessionDep, user: AdminUserDep) -> list[InvitationRead]:
    rows = (
        await session.scalars(
            select(Invitation)
            .where(Invitation.tenant_id == user.tenant_id)
            .order_by(Invitation.created_at.desc())
        )
    ).all()
    return [read(InvitationRead, row, invite_url=_invite_url(row.token)) for row in rows]


@router.post(
    "/invitations",
    response_model=InvitationRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(_account_creation_rate_limit)],
)
async def invite_member(
    payload: InvitationCreate, session: SessionDep, user: AdminUserDep, request: Request
) -> InvitationRead:
    email = str(payload.email).lower()

    existing_member = await session.scalar(
        select(Profile.id).where(Profile.tenant_id == user.tenant_id, Profile.email == email)
    )
    if existing_member:
        raise HTTPException(status.HTTP_409_CONFLICT, "That person is already on your team.")

    pending = await session.scalar(
        select(Invitation).where(
            Invitation.tenant_id == user.tenant_id,
            Invitation.email == email,
            Invitation.accepted_at.is_(None),
        )
    )
    if pending is not None:
        invitation = pending
        invitation.role = payload.role
        invitation.expires_at = now_utc() + timedelta(days=14)
    else:
        invitation = Invitation(
            tenant_id=user.tenant_id,
            email=email,
            role=payload.role,
            token=secrets.token_hex(24),
            invited_by=user.profile.id,
            expires_at=now_utc() + timedelta(days=14),
        )
        session.add(invitation)
    await session.flush()

    await send_email(
        to=email,
        subject=f"{user.tenant.name} invited you to their practice workspace",
        html=invite_html(
            firm_name=user.tenant.name,
            url=_invite_url(invitation.token),
            brand_color=user.tenant.brand_color,
        ),
        reply_to=user.profile.email,
        from_name=sender_name(user.tenant.name, user.tenant.email_from_name),
    )
    await audit.record(
        session,
        tenant_id=user.tenant_id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="invited",
        entity="invitation",
        entity_id=invitation.id,
        summary=f"Invited {email} as {payload.role}",
        ip_address=client_ip(request),
    )
    return read(InvitationRead, invitation, invite_url=_invite_url(invitation.token))


@router.post("/invitations/accept", response_model=ProfileRead)
async def accept_invitation(
    payload: InvitationAccept, session: SessionDep, user: CurrentUserDep
) -> ProfileRead:
    """Attach the signed-in account to the firm that invited it.

    Called by the signup form when it was reached from an invitation link. It has
    to run *after* /auth/register has created the profile, because until then
    there is nothing to attach — which is also why it takes CurrentUserDep rather
    than TenantUserDep: the caller has no tenant yet, that is the point.
    """
    invitation = await session.scalar(
        select(Invitation).where(Invitation.token == payload.token)
    )
    if invitation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "That invitation link is not valid.")
    if invitation.accepted_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "That invitation has already been used.")
    if invitation.expires_at < now_utc():
        raise HTTPException(
            status.HTTP_410_GONE, "That invitation has expired — ask your firm to send a new one."
        )
    if user.profile.tenant_id is not None and user.profile.tenant_id != invitation.tenant_id:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "This account already belongs to a different firm."
        )

    user.profile.tenant_id = invitation.tenant_id
    user.profile.role = invitation.role
    user.profile.client_id = None
    if payload.full_name:
        user.profile.full_name = payload.full_name.strip()
    invitation.accepted_at = now_utc()
    await session.flush()

    await audit.record(
        session,
        tenant_id=invitation.tenant_id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="accepted",
        entity="invitation",
        entity_id=invitation.id,
        summary=f"{user.profile.full_name or user.profile.email} joined as {invitation.role}",
    )
    await audit.notify(
        session,
        tenant_id=invitation.tenant_id,
        type="team",
        title=f"{user.profile.full_name or user.profile.email} accepted their invitation",
        body=f"They joined as {ROLE_LABELS.get(invitation.role, 'a team member')}.",
        link=f"/team/{user.profile.id}",
    )
    return ProfileRead.model_validate(user.profile)


@router.delete("/invitations/{invitation_id}", response_model=Ok)
async def revoke_invitation(
    invitation_id: uuid.UUID, session: SessionDep, user: AdminUserDep
) -> Ok:
    invitation = await session.scalar(
        select(Invitation).where(
            Invitation.id == invitation_id, Invitation.tenant_id == user.tenant_id
        )
    )
    ensure_found(invitation, "Invitation")
    await session.delete(invitation)
    return Ok(message="Invitation revoked")
