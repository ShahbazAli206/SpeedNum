"""Client-portal book: employees and pay runs. Shown on /dashboard/payroll.

Per-run amounts are stored, not recomputed from today's employee list — CPP/EI/
tax withheld follow the rules in force for that period, so replaying an old run
against current rates would silently rewrite history.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Request, status
from sqlalchemy import select

from ..deps import BookScopeDep, ClientScopeDep, SessionDep, StaffUserDep, client_ip
from ..models import ClientEmployee, ClientPayRun
from ..schemas import (
    ClientEmployeeCreate,
    ClientEmployeeRead,
    ClientEmployeeUpdate,
    ClientPayRunCreate,
    ClientPayRunRead,
    ClientPayRunUpdate,
    Ok,
    PayrollTotals,
)
from ..services import audit
from ..utils import apply_updates, ensure_client_in_tenant, ensure_found

router = APIRouter(prefix="/client-portal/payroll", tags=["client-portal"])


def _scope(model, stmt, scope: BookScopeDep):
    return stmt.where(model.client_id == scope.client_id) if scope.client_id else stmt


# --- employees ------------------------------------------------------------------
@router.get("/employees", response_model=list[ClientEmployeeRead])
async def list_employees(
    session: SessionDep, scope: BookScopeDep, active_only: bool = True
) -> list[ClientEmployeeRead]:
    stmt = select(ClientEmployee).where(ClientEmployee.tenant_id == scope.tenant_id)
    if active_only:
        stmt = stmt.where(ClientEmployee.is_active.is_(True))
    rows = (await session.scalars(_scope(ClientEmployee, stmt, scope).order_by(ClientEmployee.full_name))).all()
    return [ClientEmployeeRead.model_validate(row) for row in rows]


@router.post("/employees", response_model=ClientEmployeeRead, status_code=status.HTTP_201_CREATED)
async def create_employee(
    payload: ClientEmployeeCreate, session: SessionDep, scope: ClientScopeDep
) -> ClientEmployeeRead:
    await ensure_client_in_tenant(session, scope.tenant_id, scope.client_id)
    row = ClientEmployee(tenant_id=scope.tenant_id, client_id=scope.client_id, **payload.model_dump())
    session.add(row)
    await session.flush()
    return ClientEmployeeRead.model_validate(row)


@router.patch("/employees/{employee_id}", response_model=ClientEmployeeRead)
async def update_employee(
    employee_id: uuid.UUID, payload: ClientEmployeeUpdate, session: SessionDep, scope: BookScopeDep
) -> ClientEmployeeRead:
    stmt = select(ClientEmployee).where(
        ClientEmployee.id == employee_id, ClientEmployee.tenant_id == scope.tenant_id
    )
    row = await session.scalar(_scope(ClientEmployee, stmt, scope))
    ensure_found(row, "Employee")
    apply_updates(row, payload)
    await session.flush()
    return ClientEmployeeRead.model_validate(row)


@router.delete("/employees/{employee_id}", response_model=Ok)
async def remove_employee(employee_id: uuid.UUID, session: SessionDep, scope: BookScopeDep) -> Ok:
    """Soft delete: payroll history should keep referring to a former employee."""
    stmt = select(ClientEmployee).where(
        ClientEmployee.id == employee_id, ClientEmployee.tenant_id == scope.tenant_id
    )
    row = await session.scalar(_scope(ClientEmployee, stmt, scope))
    ensure_found(row, "Employee")
    row.is_active = False
    await session.flush()
    return Ok(message=f"{row.full_name} marked inactive")


# --- pay runs ---------------------------------------------------------------------
@router.get("/runs", response_model=list[ClientPayRunRead])
async def list_pay_runs(session: SessionDep, scope: BookScopeDep) -> list[ClientPayRunRead]:
    stmt = select(ClientPayRun).where(ClientPayRun.tenant_id == scope.tenant_id)
    rows = (await session.scalars(_scope(ClientPayRun, stmt, scope).order_by(ClientPayRun.pay_date.desc()))).all()
    return [ClientPayRunRead.model_validate(row) for row in rows]


@router.get("/totals", response_model=PayrollTotals)
async def payroll_totals(session: SessionDep, scope: BookScopeDep) -> PayrollTotals:
    emp_stmt = _scope(
        ClientEmployee,
        select(ClientEmployee).where(
            ClientEmployee.tenant_id == scope.tenant_id, ClientEmployee.is_active.is_(True)
        ),
        scope,
    )
    employees = (await session.scalars(emp_stmt)).all()

    run_stmt = _scope(
        ClientPayRun,
        select(ClientPayRun).where(
            ClientPayRun.tenant_id == scope.tenant_id, ClientPayRun.status == "scheduled"
        ),
        scope,
    )
    next_run = (await session.scalars(run_stmt.order_by(ClientPayRun.pay_date))).first()

    return PayrollTotals(
        active=len(employees),
        monthly_gross=round(sum(float(e.gross) for e in employees), 2),
        monthly_net=round(sum(float(e.net) for e in employees), 2),
        remittance=round(
            sum(float(e.cpp) * 2 + float(e.ei) * 1.4 + float(e.income_tax) for e in employees), 2
        ),
        next_run=ClientPayRunRead.model_validate(next_run) if next_run else None,
    )


@router.post("/runs", response_model=ClientPayRunRead, status_code=status.HTTP_201_CREATED)
async def create_pay_run(
    payload: ClientPayRunCreate, session: SessionDep, scope: ClientScopeDep
) -> ClientPayRunRead:
    await ensure_client_in_tenant(session, scope.tenant_id, scope.client_id)
    row = ClientPayRun(tenant_id=scope.tenant_id, client_id=scope.client_id, **payload.model_dump())
    session.add(row)
    await session.flush()
    return ClientPayRunRead.model_validate(row)


@router.patch("/runs/{run_id}", response_model=ClientPayRunRead)
async def update_pay_run(
    run_id: uuid.UUID, payload: ClientPayRunUpdate, session: SessionDep, scope: BookScopeDep
) -> ClientPayRunRead:
    stmt = select(ClientPayRun).where(ClientPayRun.id == run_id, ClientPayRun.tenant_id == scope.tenant_id)
    row = await session.scalar(_scope(ClientPayRun, stmt, scope))
    ensure_found(row, "Pay run")
    apply_updates(row, payload)
    await session.flush()
    return ClientPayRunRead.model_validate(row)


@router.post("/runs/{run_id}/process", response_model=ClientPayRunRead)
async def process_pay_run(
    run_id: uuid.UUID, session: SessionDep, user: StaffUserDep, request: Request
) -> ClientPayRunRead:
    row = await session.scalar(
        select(ClientPayRun).where(ClientPayRun.id == run_id, ClientPayRun.tenant_id == user.tenant_id)
    )
    ensure_found(row, "Pay run")
    row.status = "processed"
    await session.flush()
    await audit.record(
        session,
        tenant_id=user.tenant_id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="processed",
        entity="client_pay_run",
        entity_id=row.id,
        summary=f"Processed payroll {row.period_label} — net {float(row.net):,.2f}",
        ip_address=client_ip(request),
    )
    return ClientPayRunRead.model_validate(row)
