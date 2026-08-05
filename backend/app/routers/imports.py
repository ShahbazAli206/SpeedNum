"""CSV / XLSX client import with a review step before anything is written."""

from __future__ import annotations

import csv
import io
import re
from datetime import date
from typing import Any

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from sqlalchemy import select

from ..deps import SessionDep, TenantUserDep
from ..models import Client
from ..schemas import ImportCommitRequest, ImportPreview, ImportPreviewRow, ImportResult
from ..services import audit

router = APIRouter(prefix="/import", tags=["import"])

MAX_PREVIEW_ROWS = 100

FIELD_ALIASES: dict[str, tuple[str, ...]] = {
    "code": ("client code", "code", "client id", "client no", "account", "account number"),
    "legal_name": ("legal name", "client name", "name", "company", "company name", "legal"),
    "business_name": ("operating name", "trade name", "business name", "dba"),
    "client_type": ("type", "entity type", "client type"),
    "status": ("status", "client status"),
    "email": ("email", "e-mail", "email address", "contact email"),
    "phone": ("phone", "telephone", "phone number", "contact phone", "mobile"),
    "business_number": ("bn", "business number", "cra bn", "cra business number", "sin"),
    "gst_number": ("gst", "gst number", "gst/hst", "hst number", "gst/hst number"),
    "payroll_number": ("payroll", "payroll number", "rp account"),
    "address_line1": ("address", "address 1", "street", "address line 1", "mailing address"),
    "address_line2": ("address 2", "address line 2", "suite", "unit"),
    "city": ("city", "town"),
    "province": ("province", "state", "prov"),
    "postal_code": ("postal code", "postal", "zip", "zip code"),
    "fiscal_year_end": ("fiscal year end", "year end", "fye", "year-end", "fiscal year-end"),
    "year_end_month": ("year end month", "fye month"),
    "year_end_day": ("year end day", "fye day"),
    "annual_fee": ("annual fee", "fee", "fees", "billing", "annual billing"),
    "notes": ("notes", "comments", "remarks"),
    "tags": ("tags", "labels", "groups"),
}

CLIENT_TYPE_MAP = {
    "corporation": "corporation", "corp": "corporation", "inc": "corporation",
    "incorporated": "corporation", "ltd": "corporation", "company": "corporation",
    "sole proprietor": "sole_proprietor", "sole proprietorship": "sole_proprietor",
    "sole prop": "sole_proprietor", "proprietorship": "sole_proprietor",
    "partnership": "partnership", "llp": "partnership",
    "individual": "individual", "personal": "individual", "t1": "individual", "person": "individual",
    "nonprofit": "nonprofit", "non-profit": "nonprofit", "npo": "nonprofit", "charity": "nonprofit",
    "trust": "trust", "estate": "trust",
}

STATUS_MAP = {
    "active": "active", "current": "active", "client": "active",
    "prospect": "prospect", "lead": "prospect", "pending": "prospect",
    "inactive": "inactive", "dormant": "inactive", "former": "inactive",
    "archived": "archived", "closed": "archived",
}

MONTH_NAMES = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}


def _normalise(header: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", " ", header.strip().lower()).strip()


def detect_mapping(columns: list[str]) -> dict[str, str]:
    """Map source column -> client field, best guess."""
    mapping: dict[str, str] = {}
    taken: set[str] = set()
    for column in columns:
        key = _normalise(column)
        for field, aliases in FIELD_ALIASES.items():
            if field in taken:
                continue
            if key == field or key in aliases:
                mapping[column] = field
                taken.add(field)
                break
    return mapping


def _parse_year_end(raw: str) -> tuple[int, int] | None:
    value = raw.strip().lower()
    if not value:
        return None

    iso = re.match(r"^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$", value)
    if iso:
        return int(iso.group(2)), int(iso.group(3))

    pair = re.match(r"^(\d{1,2})[-/](\d{1,2})$", value)
    if pair:
        first, second = int(pair.group(1)), int(pair.group(2))
        return (first, second) if first <= 12 else (second, first)

    named = re.match(r"^([a-z]{3,9})[ .\-]*(\d{1,2})$", value)
    if named:
        month = MONTH_NAMES.get(named.group(1)[:3])
        if month:
            return month, int(named.group(2))

    named_rev = re.match(r"^(\d{1,2})[ .\-]*([a-z]{3,9})$", value)
    if named_rev:
        month = MONTH_NAMES.get(named_rev.group(2)[:3])
        if month:
            return month, int(named_rev.group(1))
    return None


def _to_float(raw: str) -> float | None:
    cleaned = re.sub(r"[^0-9.\-]", "", raw or "")
    if not cleaned:
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def parse_row(raw: dict[str, Any], mapping: dict[str, str]) -> tuple[dict[str, Any], list[str]]:
    data: dict[str, Any] = {}
    errors: list[str] = []

    for column, field in mapping.items():
        value = raw.get(column)
        text = "" if value is None else str(value).strip()
        if not text:
            continue

        if field == "fiscal_year_end":
            parsed = _parse_year_end(text)
            if parsed is None:
                errors.append(f"Could not read a year end from '{text}'")
            else:
                data["year_end_month"], data["year_end_day"] = parsed
        elif field in ("year_end_month", "year_end_day"):
            number = _to_float(text)
            if number is None:
                errors.append(f"'{text}' is not a number for {field.replace('_', ' ')}")
            else:
                data[field] = int(number)
        elif field == "annual_fee":
            number = _to_float(text)
            if number is None:
                errors.append(f"'{text}' is not a valid fee")
            else:
                data[field] = number
        elif field == "client_type":
            data[field] = CLIENT_TYPE_MAP.get(text.lower(), "corporation")
        elif field == "status":
            data[field] = STATUS_MAP.get(text.lower(), "active")
        elif field == "tags":
            data[field] = [tag.strip() for tag in re.split(r"[,;|]", text) if tag.strip()]
        elif field == "email":
            if "@" not in text:
                errors.append(f"'{text}' is not a valid email")
            else:
                data[field] = text.lower()
        else:
            data[field] = text

    if not data.get("legal_name"):
        errors.append("Legal name is required")

    month = data.get("year_end_month", 12)
    day = data.get("year_end_day", 31)
    if not 1 <= int(month) <= 12:
        errors.append("Year end month must be between 1 and 12")
        data["year_end_month"] = 12
    else:
        try:
            date(2024, int(month), int(day))
        except ValueError:
            errors.append(f"{month}/{day} is not a real date")
            data["year_end_day"] = 28

    return data, errors


async def _read_table(upload: UploadFile) -> tuple[list[str], list[dict[str, Any]]]:
    raw = await upload.read()
    if not raw:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "The uploaded file is empty.")
    filename = (upload.filename or "").lower()

    if filename.endswith((".xlsx", ".xlsm")):
        try:
            from openpyxl import load_workbook
        except ImportError as exc:  # pragma: no cover - dependency is declared
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "Excel support is unavailable on this server. Please upload a CSV instead.",
            ) from exc

        workbook = load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
        sheet = workbook.active
        rows = sheet.iter_rows(values_only=True)
        try:
            header = next(rows)
        except StopIteration as exc:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "The spreadsheet has no rows.") from exc
        columns = [str(cell).strip() if cell is not None else f"column_{i}" for i, cell in enumerate(header)]
        records = [
            {columns[i]: cell for i, cell in enumerate(row) if i < len(columns)}
            for row in rows
            if any(cell is not None and str(cell).strip() for cell in row)
        ]
        workbook.close()
        return columns, records

    for encoding in ("utf-8-sig", "utf-8", "latin-1"):
        try:
            text = raw.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    else:  # pragma: no cover - latin-1 always decodes
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Could not decode the file.")

    try:
        dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
    reader = csv.DictReader(io.StringIO(text), dialect=dialect)
    columns = [c for c in (reader.fieldnames or []) if c]
    if not columns:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "No header row was found.")
    records = [row for row in reader if any((v or "").strip() for v in row.values() if isinstance(v, str))]
    return columns, records


@router.post("/clients/preview", response_model=ImportPreview)
async def preview_clients(
    session: SessionDep, user: TenantUserDep, file: UploadFile = File(...)
) -> ImportPreview:
    columns, records = await _read_table(file)
    mapping = detect_mapping(columns)
    if "legal_name" not in mapping.values():
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "No client-name column was recognised. Rename a column to 'Legal Name' and try again.",
        )

    rows: list[ImportPreviewRow] = []
    valid = 0
    for index, record in enumerate(records[:MAX_PREVIEW_ROWS], start=2):
        data, errors = parse_row(record, mapping)
        if not errors:
            valid += 1
        rows.append(ImportPreviewRow(row=index, data=data, errors=errors))

    return ImportPreview(
        columns=columns,
        detected_mapping=mapping,
        rows=rows,
        total_rows=len(records),
        valid_rows=valid,
    )


@router.post("/clients/commit", response_model=ImportResult)
async def commit_clients(
    payload: ImportCommitRequest, session: SessionDep, user: TenantUserDep
) -> ImportResult:
    created = updated = failed = 0
    errors: list[str] = []
    allowed = {column.name for column in Client.__table__.columns}

    for index, row in enumerate(payload.rows, start=1):
        data = {k: v for k, v in row.items() if k in allowed and k not in ("id", "tenant_id")}
        legal_name = (data.get("legal_name") or "").strip()
        if not legal_name:
            failed += 1
            errors.append(f"Row {index}: missing legal name")
            continue

        existing = None
        if payload.update_existing:
            if data.get("code"):
                existing = await session.scalar(
                    select(Client).where(
                        Client.tenant_id == user.tenant_id, Client.code == data["code"]
                    )
                )
            if existing is None:
                existing = await session.scalar(
                    select(Client).where(
                        Client.tenant_id == user.tenant_id, Client.legal_name == legal_name
                    )
                )

        try:
            # A savepoint keeps one bad row from discarding the whole import.
            async with session.begin_nested():
                if existing is not None:
                    for key, value in data.items():
                        setattr(existing, key, value)
                    updated += 1
                else:
                    session.add(Client(tenant_id=user.tenant_id, created_by=user.profile.id, **data))
                    created += 1
        except Exception as exc:  # noqa: BLE001 - surface the row that failed
            if existing is not None:
                updated -= 1
            else:
                created -= 1
            failed += 1
            errors.append(f"Row {index} ({legal_name}): {type(exc).__name__}")

    await audit.record(
        session,
        tenant_id=user.tenant_id,
        actor_id=user.profile.id,
        actor_email=user.profile.email,
        action="imported",
        entity="client",
        summary=f"Imported {created} new and updated {updated} client(s)",
        metadata={"created": created, "updated": updated, "failed": failed},
    )
    return ImportResult(created=created, updated=updated, failed=failed, errors=errors[:25])
