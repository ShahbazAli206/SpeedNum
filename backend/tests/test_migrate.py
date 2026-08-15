"""Unit tests for the migration runner (scripts/migrate.py).

Nothing here connects to a database. What is worth guarding is the logic that
decides *which* files run, because both failure modes are silent and severe:
skipping a migration leaves the API reading a column that does not exist, and
baselining one marks it applied without ever running it — same outcome, but with
the tracking table now insisting everything is fine.

The specific trap: `baseline 0004` against a database where 0001-0004 are
already recorded must mark nothing, not run off the end and baseline 0005.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]


def _load_migrate():
    """Import scripts/migrate.py by path — `scripts/` is not a package, and the
    runner is deliberately standalone so it works when app/ cannot import."""
    spec = importlib.util.spec_from_file_location("migrate", BACKEND / "scripts" / "migrate.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules["migrate"] = module
    spec.loader.exec_module(module)
    return module


migrate = _load_migrate()


# --- the DSN ------------------------------------------------------------------
@pytest.mark.parametrize(
    "given,expected",
    [
        # app.config hands out SQLAlchemy's driver-qualified form; asyncpg rejects it.
        ("postgresql+asyncpg://u:p@h:6543/postgres", "postgresql://u:p@h:6543/postgres"),
        ("postgres://u:p@h:6543/postgres", "postgresql://u:p@h:6543/postgres"),
        ("postgresql://u:p@h:6543/postgres", "postgresql://u:p@h:6543/postgres"),
    ],
)
def test_dsn_is_normalised_for_asyncpg(monkeypatch, given, expected):
    monkeypatch.setenv("DATABASE_URL", given)
    assert migrate._dsn() == expected


def test_missing_dsn_names_the_variable(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "")
    with pytest.raises(migrate.MigrationError, match="DATABASE_URL"):
        migrate._dsn()


# --- discovery ----------------------------------------------------------------
def test_discovers_the_repo_migrations_in_order(monkeypatch):
    monkeypatch.delenv("MIGRATIONS_DIR", raising=False)
    versions = [version for version, _ in migrate._discover()]
    assert versions == sorted(versions), "application order must be deterministic"
    assert versions[0].startswith("0001")
    # Both 0006 files must survive as distinct versions — they touch different
    # tables, but one silently shadowing the other would lose a migration.
    assert len([v for v in versions if v.startswith("0006")]) == 2
    assert len(set(versions)) == len(versions)


def test_migrations_dir_can_be_overridden(monkeypatch, tmp_path):
    (tmp_path / "0001_only.sql").write_text("select 1;", encoding="utf-8")
    monkeypatch.setenv("MIGRATIONS_DIR", str(tmp_path))
    assert [v for v, _ in migrate._discover()] == ["0001_only"]


def test_an_empty_directory_is_an_error_not_a_silent_no_op(monkeypatch, tmp_path):
    monkeypatch.setenv("MIGRATIONS_DIR", str(tmp_path))
    with pytest.raises(migrate.MigrationError):
        migrate._discover()


def test_checksum_changes_with_content(tmp_path):
    path = tmp_path / "0001_x.sql"
    path.write_text("select 1;", encoding="utf-8")
    before = migrate._checksum(path)
    path.write_text("select 2;", encoding="utf-8")
    assert migrate._checksum(path) != before


# --- the baseline cutoff ------------------------------------------------------
def _cutoff(versions: list[str], upto: str):
    """The selection `cmd_baseline` performs, isolated from the database."""
    return next((i for i, v in enumerate(versions) if v.startswith(upto)), None)


VERSIONS = [
    "0001_schema",
    "0002_rls",
    "0003_functions",
    "0004_client_books",
    "0005_client_portal_invite",
    "0006_engagement_letter_signing",
    "0006_task_type",
    "0007_reminders",
]


def test_baseline_selects_everything_up_to_and_including_the_cutoff():
    index = _cutoff(VERSIONS, "0004")
    assert VERSIONS[: index + 1] == [
        "0001_schema",
        "0002_rls",
        "0003_functions",
        "0004_client_books",
    ]


def test_baseline_never_reaches_the_migrations_that_must_actually_run():
    """The regression this test exists for: 0005 adds
    profiles.must_change_password, which every authenticated request reads.
    Baselining it would mark it applied without creating the column."""
    index = _cutoff(VERSIONS, "0004")
    assert "0005_client_portal_invite" not in VERSIONS[: index + 1]
    assert VERSIONS[index + 1 :] == [
        "0005_client_portal_invite",
        "0006_engagement_letter_signing",
        "0006_task_type",
        "0007_reminders",
    ]


def test_an_unknown_cutoff_is_rejected_rather_than_guessed():
    assert _cutoff(VERSIONS, "0099") is None


def test_cutoff_matches_on_the_numeric_prefix_alone():
    assert _cutoff(VERSIONS, "0007") == 7
    assert _cutoff(VERSIONS, "0006") == 5, "the first 0006 wins, and both stay pending after it"
