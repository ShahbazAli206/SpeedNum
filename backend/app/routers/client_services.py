"""Client-portal book: the client's own service assignments (read-only).

Shown on /dashboard/services — what the client is engaged for and at what
cadence. Mirrors the admin-side GET /clients/{client_id}/services query, but
scoped through BookScopeDep (see client_documents.py for the same pattern):
firm staff may pass ?client_id=, a portal account is pinned to its own.
"""

from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import select

from ..deps import BookScopeDep, SessionDep
from ..models import ClientService, Service
from ..schemas import ClientServiceRead
from ..utils import profile_names, read

router = APIRouter(prefix="/client-portal/services", tags=["client-portal"])


@router.get("", response_model=list[ClientServiceRead])
async def list_services(session: SessionDep, scope: BookScopeDep) -> list[ClientServiceRead]:
    stmt = (
        select(ClientService, Service)
        .join(Service, Service.id == ClientService.service_id)
        .where(ClientService.tenant_id == scope.tenant_id, ClientService.is_active.is_(True))
    )
    if scope.client_id:
        stmt = stmt.where(ClientService.client_id == scope.client_id)

    rows = (await session.execute(stmt.order_by(Service.name))).all()
    names = await profile_names(session, scope.tenant_id)
    return [
        read(
            ClientServiceRead,
            assignment,
            service_name=service.name,
            service_code=service.code,
            frequency=assignment.frequency_override or service.frequency,
            assignee_name=names.get(assignment.assignee_id),
        )
        for assignment, service in rows
    ]
