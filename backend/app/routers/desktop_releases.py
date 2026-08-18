"""Desktop app release metadata: a public, unauthenticated "what's the
current version, where do I download it" endpoint for the web dashboard's
download button and the installed app's own deep-link-triggered check, plus
a superadmin-only publish/list surface.

Deliberately separate from electron-updater's own feed (the `latest.yml` +
installer uploaded to the `desktop-releases` MinIO bucket, served by Caddy at
/desktop-releases/* -- see DESKTOP.md). That feed is what the *desktop app
itself* uses for its authoritative update check; this table/router is what
the *website* uses, and the two are kept in sync by the same manual publish
step (see DESKTOP.md's release procedure) rather than one reading the other.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import desc, select

from ..config import settings
from ..deps import SessionDep, SuperadminDep, client_ip
from ..models import DesktopRelease
from ..schemas import DesktopReleaseCreate, DesktopReleasePublic, DesktopReleaseRead, Ok
from ..services import audit
from ..services.rate_limit import rate_limit_by_ip
from ..services.semver import InvalidVersionError, is_newer, parse_semver
from ..utils import ensure_found

router = APIRouter(tags=["desktop-releases"])

# Public and unauthenticated by design (a "what version should I download"
# question has no per-caller answer) -- generous enough that a page load
# with retries never sees a 429, tight enough to blunt a scripted poller.
_latest_rate_limit = rate_limit_by_ip("desktop-latest", limit=60, window_seconds=300)


def validate_installer_url(installer_url: str) -> str:
    """The one control that stops a compromised/careless publish call from
    pointing every user's download button at an attacker-controlled host: the
    URL must be HTTPS and sit under the exact configured release bucket
    prefix, never an arbitrary host or a bare path a browser would resolve
    relative to somewhere unexpected."""
    base = settings.desktop_release_base_url
    if not installer_url.startswith(base):
        raise ValueError(f"installer_url must start with {base!r}.")
    return installer_url


def validate_sha256(sha256: str) -> str:
    value = sha256.strip().lower()
    if len(value) != 64 or any(ch not in "0123456789abcdef" for ch in value):
        raise ValueError("sha256 must be exactly 64 hex characters.")
    return value


def validate_new_release(
    *, candidate_version: str, current_version: str | None, installer_url: str, sha256: str
) -> tuple[str, str]:
    """All the pure, DB-independent validation for publishing a release,
    pulled out of the endpoint so it's unit-testable without a database:
    - candidate_version must parse as strict X.Y.Z semver
    - candidate_version must be strictly newer than the current latest, if
      one exists (never allows a downgrade or a same-version republish)
    - installer_url and sha256 must pass their own format/host checks

    Returns the normalised (installer_url, sha256) on success; raises
    ValueError/InvalidVersionError with a message safe to surface to an
    admin caller on failure.
    """
    parse_semver(candidate_version)  # raises InvalidVersionError on malformed input
    if current_version is not None and not is_newer(candidate_version, current_version):
        raise ValueError(
            f"{candidate_version!r} is not newer than the current latest ({current_version!r})."
        )
    return validate_installer_url(installer_url), validate_sha256(sha256)


def _to_public(release: DesktopRelease) -> dict[str, Any]:
    return {
        "version": release.version,
        "platform": release.platform,
        "installer": release.installer_url,
        "sha256": release.sha256,
        "released_at": release.released_at,
        "release_notes": release.release_notes,
    }


@router.get("/desktop/latest", response_model=DesktopReleasePublic, dependencies=[Depends(_latest_rate_limit)])
async def latest_release(session: SessionDep) -> DesktopReleasePublic:
    release = await session.scalar(select(DesktopRelease).order_by(desc(DesktopRelease.released_at)).limit(1))
    ensure_found(release, "Desktop release")
    return DesktopReleasePublic.model_validate(_to_public(release))


@router.get("/admin/desktop-releases", response_model=list[DesktopReleaseRead])
async def list_releases(session: SessionDep, user: SuperadminDep) -> list[DesktopReleaseRead]:
    rows = (
        await session.scalars(select(DesktopRelease).order_by(desc(DesktopRelease.released_at)))
    ).all()
    return [
        DesktopReleaseRead(id=row.id, created_at=row.created_at, **_to_public(row)) for row in rows
    ]


@router.post(
    "/admin/desktop-releases",
    response_model=DesktopReleaseRead,
    status_code=status.HTTP_201_CREATED,
)
async def publish_release(
    payload: DesktopReleaseCreate, session: SessionDep, user: SuperadminDep, request: Request
) -> DesktopReleaseRead:
    """Registers a release that has already been built and uploaded via the
    documented manual step (npm run release / mc cp -- see DESKTOP.md). This
    endpoint never touches MinIO or builds anything itself; it only records
    metadata about a release the operator has already verified exists and
    downloads correctly, matching the "verify before publish" release
    procedure this same pass documents.
    """
    current = await session.scalar(select(DesktopRelease).order_by(desc(DesktopRelease.released_at)).limit(1))
    try:
        installer_url, sha256 = validate_new_release(
            candidate_version=payload.version,
            current_version=current.version if current else None,
            installer_url=payload.installer_url,
            sha256=payload.sha256,
        )
    except (InvalidVersionError, ValueError) as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc

    release = DesktopRelease(
        version=payload.version,
        platform=payload.platform,
        installer_url=installer_url,
        sha256=sha256,
        release_notes=payload.release_notes,
        created_by=user.profile.id,
    )
    session.add(release)
    await session.flush()

    await audit.record(
        session,
        tenant_id=None,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="published",
        entity="desktop_release",
        entity_id=release.id,
        summary=f"Published SpeedNum Desktop {payload.version}",
        ip_address=client_ip(request),
    )

    return DesktopReleaseRead(id=release.id, created_at=release.created_at, **_to_public(release))


@router.delete("/admin/desktop-releases/{release_id}", response_model=Ok)
async def delete_release(release_id: uuid.UUID, session: SessionDep, user: SuperadminDep) -> Ok:
    """Removes stale release *metadata* only -- never touches the installer
    object in MinIO (that stays a manual `mc rm` per the release procedure,
    done only after a newer release is confirmed working, per DESKTOP.md's
    "don't delete the old installer before the new one works" rule)."""
    release = await session.get(DesktopRelease, release_id)
    ensure_found(release, "Desktop release")
    await session.delete(release)
    return Ok(message=f"Removed release {release.version} from the list.")
