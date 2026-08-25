"""Unit tests for the bulk importer's parsing layer (app/routers/imports.py).

The importer had no tests at all, which is uncomfortable for the one feature
that writes many rows at once from a file a human typed by hand. Everything
here is the pure part — column detection and row parsing — so no database or
HTTP client is needed.

The properties that matter:

* A messy real-world header ("Business Name", "CRA BN", "Year End") still finds
  its field, because firms export from whatever they already use.
* A bad cell reports an error and does **not** silently invent a value. The
  commit path only sends rows with zero errors, so a parser that "helpfully"
  substitutes a default would import wrong data under a clean preview.
"""

from __future__ import annotations

from app.routers.imports import (
    ROLE_MAP,
    _parse_year_end,
    _to_float,
    detect_mapping,
    detect_service_mapping,
    detect_tenant_mapping,
    detect_user_mapping,
    parse_row,
    parse_service_row,
    parse_tenant_row,
    parse_user_row,
)


# --- column detection ---------------------------------------------------------
def test_detect_mapping_matches_exact_field_names():
    mapping = detect_mapping(["legal_name", "email", "province"])
    assert mapping == {"legal_name": "legal_name", "email": "email", "province": "province"}


def test_detect_mapping_matches_human_headers():
    mapping = detect_mapping(["Legal Name", "Business Name", "Primary Contact Email"])
    assert mapping["Legal Name"] == "legal_name"
    assert mapping["Business Name"] == "business_name"
    assert mapping["Primary Contact Email"] == "email"


def test_detect_mapping_recognises_mrr_plan_owner_and_bare_business():
    mapping = detect_mapping(["Business", "Plan", "MRR", "Accountant"])
    assert mapping["Business"] == "business_name"
    assert mapping["Plan"] == "plan"
    assert mapping["MRR"] == "mrr"
    assert mapping["Accountant"] == "owner"


def test_detect_mapping_ignores_unknown_columns():
    mapping = detect_mapping(["Legal Name", "Favourite Colour"])
    assert "Favourite Colour" not in mapping


def test_each_field_is_claimed_once():
    """Two columns that both look like the same field: the first one wins.

    Otherwise the later column would overwrite the earlier one's value during
    parse_row, and which column won would depend on dict ordering.
    """
    mapping = detect_mapping(["Legal Name", "Registered Name"])
    assert list(mapping.values()).count("legal_name") == 1


# --- year end -----------------------------------------------------------------
def test_year_end_iso():
    assert _parse_year_end("2026-06-30") == (6, 30)


def test_year_end_month_day_pair():
    assert _parse_year_end("6/30") == (6, 30)


def test_year_end_pair_is_reordered_when_the_first_number_cannot_be_a_month():
    # "30/6" is unambiguous — there is no 30th month.
    assert _parse_year_end("30/6") == (6, 30)


def test_year_end_named_month():
    assert _parse_year_end("Dec 31") == (12, 31)
    assert _parse_year_end("31 December") == (12, 31)


def test_year_end_rejects_nonsense():
    assert _parse_year_end("whenever") is None
    assert _parse_year_end("") is None


# --- numbers ------------------------------------------------------------------
def test_to_float_strips_currency_formatting():
    assert _to_float("$9,600.00") == 9600.0
    assert _to_float("11 400") == 11400.0


def test_to_float_returns_none_for_text():
    assert _to_float("n/a") is None
    assert _to_float("") is None


# --- client rows --------------------------------------------------------------
def mapping_for(**columns: str) -> dict[str, str]:
    return dict(columns)


def test_parse_row_happy_path():
    data, errors = parse_row(
        {"Legal Name": "Lakeview Dental Corp.", "Province": "ON", "Annual Fee": "$9,600"},
        {"Legal Name": "legal_name", "Province": "province", "Annual Fee": "annual_fee"},
    )
    assert errors == []
    assert data["legal_name"] == "Lakeview Dental Corp."
    assert data["annual_fee"] == 9600.0


def test_parse_row_requires_a_legal_name():
    data, errors = parse_row({"Legal Name": ""}, {"Legal Name": "legal_name"})
    assert any("Legal name is required" in error for error in errors)
    assert "legal_name" not in data


def test_parse_row_rejects_a_bad_email_rather_than_importing_it():
    _, errors = parse_row({"Email": "not-an-email"}, {"Email": "email"})
    assert any("not a valid email" in error for error in errors)


def test_parse_row_lowercases_email():
    data, _ = parse_row(
        {"Legal Name": "X", "Email": "Hello@Lakeview.CA"},
        {"Legal Name": "legal_name", "Email": "email"},
    )
    assert data["email"] == "hello@lakeview.ca"


def test_parse_row_flags_an_impossible_month():
    _, errors = parse_row(
        {"Legal Name": "X", "Year End Month": "13"},
        {"Legal Name": "legal_name", "Year End Month": "year_end_month"},
    )
    assert any("between 1 and 12" in error for error in errors)


def test_parse_row_flags_an_impossible_day():
    _, errors = parse_row(
        {"Legal Name": "X", "Year End Month": "2", "Year End Day": "31"},
        {
            "Legal Name": "legal_name",
            "Year End Month": "year_end_month",
            "Year End Day": "year_end_day",
        },
    )
    assert any("not a real date" in error for error in errors)


def test_parse_row_splits_tags():
    data, _ = parse_row(
        {"Legal Name": "X", "Tags": "Growth; Priority, VIP"},
        {"Legal Name": "legal_name", "Tags": "tags"},
    )
    assert data["tags"] == ["Growth", "Priority", "VIP"]


def test_parse_row_normalises_status_and_type():
    data, _ = parse_row(
        {"Legal Name": "X", "Status": "Prospect", "Type": "Corporation"},
        {"Legal Name": "legal_name", "Status": "status", "Type": "client_type"},
    )
    assert data["status"] == "prospect"
    assert data["client_type"] == "corporation"


def test_parse_row_converts_mrr_to_annual_fee():
    data, errors = parse_row(
        {"Legal Name": "X", "MRR": "250"},
        {"Legal Name": "legal_name", "MRR": "mrr"},
    )
    assert errors == []
    assert data["annual_fee"] == 3000.0
    assert "mrr" not in data


def test_parse_row_folds_plan_into_tags_alongside_an_explicit_tags_column():
    # Plan and Tags can appear in either order in the file — neither should
    # clobber the other regardless of which column comes first.
    data, _ = parse_row(
        {"Legal Name": "X", "Plan": "Growth", "Tags": "VIP"},
        {"Legal Name": "legal_name", "Plan": "plan", "Tags": "tags"},
    )
    assert set(data["tags"]) == {"Growth", "VIP"}


def test_parse_row_resolves_owner_by_name():
    data, errors = parse_row(
        {"Legal Name": "X", "Accountant": "Amzad Amiri"},
        {"Legal Name": "legal_name", "Accountant": "owner"},
        {"amzad amiri": "22222222-2222-2222-2222-222222222222"},
    )
    assert errors == []
    assert data["owner_id"] == "22222222-2222-2222-2222-222222222222"


def test_parse_row_flags_an_unmatched_owner_rather_than_importing_it_wrong():
    data, errors = parse_row(
        {"Legal Name": "X", "Accountant": "Someone Else"},
        {"Legal Name": "legal_name", "Accountant": "owner"},
        {"amzad amiri": "22222222-2222-2222-2222-222222222222"},
    )
    assert "owner_id" not in data
    assert any("No accountant matches" in error for error in errors)


def test_parse_row_keeps_unrecognised_columns_as_custom_fields():
    data, errors = parse_row(
        {"Legal Name": "X", "Alberta Corp. No.": "2022405969"},
        {"Legal Name": "legal_name"},
    )
    assert errors == []
    assert data["custom"] == {"Alberta Corp. No.": "2022405969"}


def test_parse_row_omits_custom_when_every_column_is_recognised():
    data, _ = parse_row({"Legal Name": "X"}, {"Legal Name": "legal_name"})
    assert "custom" not in data


# --- user rows ----------------------------------------------------------------
def test_detect_user_mapping_matches_human_headers():
    mapping = detect_user_mapping(["Email Address", "Full Name", "Role", "Linked Client"])
    assert mapping["Email Address"] == "email"
    assert mapping["Full Name"] == "full_name"
    assert mapping["Role"] == "role"
    assert mapping["Linked Client"] == "client"


def test_parse_user_row_maps_practice_job_titles_onto_roles():
    for written, expected in [("Partner", "owner"), ("Accountant", "member"), ("Read only", "viewer")]:
        data, errors = parse_user_row(
            {"Email": "a@b.co", "Role": written}, {"Email": "email", "Role": "role"}, {}
        )
        assert data["role"] == expected, written
        assert errors == []


def test_every_role_alias_resolves_to_a_real_role():
    assert set(ROLE_MAP.values()) <= {"owner", "admin", "member", "viewer"}


def test_parse_user_row_derives_a_name_from_the_email_when_blank():
    data, errors = parse_user_row({"Email": "jane.doe@harrisoncpa.ca"}, {"Email": "email"}, {})
    assert data["full_name"] == "Jane Doe"
    assert errors == []


def test_parse_user_row_requires_an_email():
    _, errors = parse_user_row({"Full Name": "Jane"}, {"Full Name": "full_name"}, {})
    assert any("Email is required" in error for error in errors)


def test_parse_user_row_resolves_a_client_to_a_portal_login():
    data, errors = parse_user_row(
        {"Email": "ap@lakeview.ca", "Client": "Lakeview Dental"},
        {"Email": "email", "Client": "client"},
        {"lakeview dental": "11111111-1111-1111-1111-111111111111"},
    )
    assert data["client_id"] == "11111111-1111-1111-1111-111111111111"
    assert errors == []


def test_unmatched_client_warns_rather_than_silently_creating_staff():
    """An unmatched client name is the difference between a portal login and a
    firm-staff login — i.e. between seeing one client's books and seeing all of
    them. It must never pass validation quietly."""
    data, errors = parse_user_row(
        {"Email": "ap@lakeview.ca", "Client": "Lakeview Dentl"},
        {"Email": "email", "Client": "client"},
        {"lakeview dental": "11111111-1111-1111-1111-111111111111"},
    )
    assert "client_id" not in data
    assert any("No client matches" in error for error in errors)


def test_unrecognised_role_is_reported_and_defaults_to_the_least_privilege_it_can():
    data, errors = parse_user_row(
        {"Email": "a@b.co", "Role": "Grand Poobah"}, {"Email": "email", "Role": "role"}, {}
    )
    assert data["role"] == "member"
    assert any("not a role we recognise" in error for error in errors)


# --- service rows ---------------------------------------------------------------
def test_detect_service_mapping_matches_human_headers():
    mapping = detect_service_mapping(["Service Code", "Service Name", "Cadence", "Fee"])
    assert mapping["Service Code"] == "code"
    assert mapping["Service Name"] == "name"
    assert mapping["Cadence"] == "frequency"
    assert mapping["Fee"] == "default_price"


def test_parse_service_row_happy_path():
    data, errors = parse_service_row(
        {"Code": "t2", "Name": "Corporate tax return", "Frequency": "Annual", "Price": "$1,200"},
        {"Code": "code", "Name": "name", "Frequency": "frequency", "Price": "default_price"},
    )
    assert errors == []
    assert data["code"] == "T2"
    assert data["frequency"] == "annual"
    assert data["default_price"] == 1200.0
    # Defaults to the offset-from-period-end rule when no months column is given.
    assert data["due_rule"] == {"type": "offset_from_period_end", "months": 6, "period_basis": "fiscal"}


def test_parse_service_row_requires_code_and_name():
    _, errors = parse_service_row({"Name": ""}, {"Name": "name"})
    assert any("code is required" in error for error in errors)
    assert any("name is required" in error for error in errors)


def test_parse_service_row_reads_months_after_period_end():
    data, _ = parse_service_row(
        {"Code": "T1", "Name": "Personal return", "Months": "3"},
        {"Code": "code", "Name": "name", "Months": "months_after_period_end"},
    )
    assert data["due_rule"]["months"] == 3


def test_parse_service_row_flags_unrecognised_frequency_but_still_defaults():
    data, errors = parse_service_row(
        {"Code": "X", "Name": "Y", "Frequency": "biweekly"},
        {"Code": "code", "Name": "name", "Frequency": "frequency"},
    )
    assert data["frequency"] == "annual"
    assert any("not a frequency we recognise" in error for error in errors)


def test_parse_service_row_reads_is_active():
    data, _ = parse_service_row(
        {"Code": "X", "Name": "Y", "Active": "No"},
        {"Code": "code", "Name": "name", "Active": "is_active"},
    )
    assert data["is_active"] is False


# --- tenant rows ------------------------------------------------------------------
def test_detect_tenant_mapping_matches_human_headers():
    mapping = detect_tenant_mapping(["Firm Name", "Admin Email", "Max Users"])
    assert mapping["Firm Name"] == "name"
    assert mapping["Admin Email"] == "admin_email"
    assert mapping["Max Users"] == "max_users"


def test_parse_tenant_row_happy_path():
    data, errors = parse_tenant_row(
        {"Name": "Lakeview Dental Corp.", "Email": "Admin@Lakeview.CA", "Max Users": "5"},
        {"Name": "name", "Email": "admin_email", "Max Users": "max_users"},
    )
    assert errors == []
    assert data["name"] == "Lakeview Dental Corp."
    assert data["admin_email"] == "admin@lakeview.ca"
    assert data["max_users"] == 5


def test_parse_tenant_row_requires_name_and_admin_email():
    _, errors = parse_tenant_row({"Name": ""}, {"Name": "name"})
    assert any("Firm name is required" in error for error in errors)
    assert any("Admin email is required" in error for error in errors)


def test_parse_tenant_row_rejects_a_bad_email_rather_than_importing_it():
    data, errors = parse_tenant_row(
        {"Name": "X", "Email": "not-an-email"}, {"Name": "name", "Email": "admin_email"}
    )
    assert "admin_email" not in data
    assert any("not a valid email" in error for error in errors)
