"""Backup device registration and revocation — platform superadmin only.

Deliberately independent of the JWT/refresh-token machinery (see migration
0012's header comment): a stolen laptop's OS keychain can still hold a valid,
unexpired refresh token, so device revocation must work without depending on
that token ever expiring or being individually tracked. `require_active_device`
is the enforcement point other routers (admin_backups.py) attach to the
specific actions that actually hand over backup bytes.
"""

from __future__ import annotations

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import text

from ..deps import SessionDep, SuperadminDep, client_ip
from ..services.rate_limit import rate_limit_by_ip

router = APIRouter(prefix="/admin/devices", tags=["admin"])

_register_rate_limit = rate_limit_by_ip("backup-device-register", limit=10, window_seconds=3600)


class DeviceRegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    platform: str | None = Field(default=None, max_length=60)
    app_version: str | None = Field(default=None, max_length=40)


class DeviceRegisterResponse(BaseModel):
    device_id: uuid.UUID
    name: str


@router.post("/register", status_code=status.HTTP_201_CREATED, dependencies=[Depends(_register_rate_limit)])
async def register_device(
    payload: DeviceRegisterRequest, session: SessionDep, user: SuperadminDep, request: Request
) -> DeviceRegisterResponse:
    row = (
        await session.execute(
            text(
                "insert into public.backup_devices (name, platform, app_version, registered_by) "
                "values (:name, :platform, :app_version, :registered_by) returning id, name"
            ),
            {
                "name": payload.name,
                "platform": payload.platform,
                "app_version": payload.app_version,
                "registered_by": user.profile.id,
            },
        )
    ).mappings().first()
    await session.execute(
        text(
            "insert into public.backup_audit_log (actor_profile_id, action, detail, ip_address, user_agent, device_id) "
            "values (:actor, 'trigger', cast(:detail as jsonb), :ip, :ua, :device_id)"
        ),
        {
            "actor": user.profile.id,
            "detail": f'{{"registered_device": "{row["name"]}"}}',
            "ip": client_ip(request),
            "ua": request.headers.get("user-agent", "")[:500],
            "device_id": row["id"],
        },
    )
    await session.commit()
    return DeviceRegisterResponse(device_id=row["id"], name=row["name"])


@router.get("")
async def list_devices(session: SessionDep, user: SuperadminDep) -> list[dict[str, Any]]:
    rows = (
        await session.execute(
            text(
                "select id, name, platform, app_version, status, last_seen_at, "
                "revoked_at, created_at "
                "from public.backup_devices order by created_at desc"
            )
        )
    ).mappings().all()
    return [dict(row) for row in rows]


@router.post("/{device_id}/revoke")
async def revoke_device(
    device_id: uuid.UUID, session: SessionDep, user: SuperadminDep, request: Request
) -> dict[str, Any]:
    row = (
        await session.execute(
            text(
                "update public.backup_devices set status = 'revoked', revoked_at = now(), revoked_by = :revoked_by "
                "where id = :id and status = 'active' returning id, name"
            ),
            {"id": device_id, "revoked_by": user.profile.id},
        )
    ).mappings().first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Device not found or already revoked.")

    await session.execute(
        text(
            "insert into public.backup_audit_log (actor_profile_id, action, detail, ip_address, user_agent, device_id) "
            "values (:actor, 'trigger', cast(:detail as jsonb), :ip, :ua, :device_id)"
        ),
        {
            "actor": user.profile.id,
            "detail": f'{{"revoked_device": "{row["name"]}"}}',
            "ip": client_ip(request),
            "ua": request.headers.get("user-agent", "")[:500],
            "device_id": row["id"],
        },
    )
    await session.commit()
    return {"ok": True}


async def require_active_device(
    session: SessionDep,
    user: SuperadminDep,
    x_device_id: Annotated[uuid.UUID | None, Header()] = None,
) -> uuid.UUID:
    """Attach to any endpoint that actually hands over backup bytes
    (download-url, ack-download, restore-drill reporting) — not to read-only
    listing or triggering, which the web admin portal also needs to reach
    without a registered device. A missing header, an unknown id, or a
    revoked device are all rejected the same way (403): a revoked device
    must not be able to tell "not registered" from "revoked" apart, which
    would leak whether a specific id used to be valid.
    """
    if x_device_id is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This action requires a registered backup device.")
    row = (
        await session.execute(
            text("select status from public.backup_devices where id = :id"),
            {"id": x_device_id},
        )
    ).mappings().first()
    if row is None or row["status"] != "active":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This device is not registered or has been revoked.")

    await session.execute(
        text("update public.backup_devices set last_seen_at = now() where id = :id"),
        {"id": x_device_id},
    )
    await session.commit()
    return x_device_id


ActiveDeviceDep = Annotated[uuid.UUID, Depends(require_active_device)]
