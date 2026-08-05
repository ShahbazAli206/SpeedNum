"""Internal team roster, workload and invitations."""

from __future__ import annotations

import secrets
import uuid
from datetime import timedelta

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import func, select

from ..config import settings
from ..deps import AdminUserDep, SessionDep, TenantUserDep, client_ip
from ..models import Client, Deadline, Invitation, Profile, Task
from ..schemas import InvitationCreate, InvitationRead, Ok, ProfileUpdate, TeamMemberRead
from ..services import audit
from ..services.email import invite_html, send_email
from ..utils import apply_updates, ensure_found, now_utc, read, today_utc

router = APIRouter(prefix="/team", tags=["team"])

OPEN_TASK_STATES = ("todo", "in_progress", "review", "blocked")


def _invite_url(token: str) -> str:
    return f"{settings.public_app_url.rstrip('/')}/signup?invite={token}"


@router.get("", response_model=list[TeamMemberRead])
async def list_team(session: SessionDep, user: TenantUserDep) -> list[TeamMemberRead]:
    members = (
        await session.scalars(
            select(Profile)
            .where(Profile.tenant_id == user.tenant_id)
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


@router.post("/invitations", response_model=InvitationRead, status_code=status.HTTP_201_CREATED)
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
