"""Unit tests for the pure path-safety logic in routers/task_attachments.py:
where an attachment's object key is minted, and the check that stops a
caller registering a row against a storage_path it was never issued (the
same class of bug as an IDOR, just aimed at object storage instead of a
database row). No DB/HTTP client involved, matching this suite's convention.
"""

from __future__ import annotations

import uuid

from app.routers.task_attachments import _mint_path, _owns_storage_path


def test_mint_path_is_scoped_under_the_tenant_and_task():
    tenant_id = uuid.uuid4()
    task_id = uuid.uuid4()
    path = _mint_path(tenant_id, task_id, "report.pdf")
    assert path.startswith(f"{tenant_id}/tasks/{task_id}/")
    assert path.endswith("report.pdf")


def test_mint_path_sanitises_path_traversal_attempts():
    tenant_id = uuid.uuid4()
    task_id = uuid.uuid4()
    path = _mint_path(tenant_id, task_id, "../../../etc/passwd")
    # No literal ".." or "/" survives from the filename component — the
    # sanitiser strips them all to underscores before uuid-prefixing.
    filename_component = path.split("/")[-1]
    assert ".." not in filename_component
    assert filename_component.count("/") == 0


def test_mint_path_sanitises_null_bytes_and_unicode_control_chars():
    tenant_id = uuid.uuid4()
    task_id = uuid.uuid4()
    path = _mint_path(tenant_id, task_id, "evil\x00name‮.exe")
    assert "\x00" not in path
    assert "‮" not in path


def test_mint_path_handles_empty_or_all_unsafe_name():
    tenant_id = uuid.uuid4()
    task_id = uuid.uuid4()
    path = _mint_path(tenant_id, task_id, "///...")
    assert path.endswith("file")


def test_mint_path_truncates_very_long_names():
    tenant_id = uuid.uuid4()
    task_id = uuid.uuid4()
    path = _mint_path(tenant_id, task_id, "a" * 500 + ".txt")
    filename_component = path.split("/")[-1]
    assert len(filename_component) <= 120 + 37  # sanitised name + uuid + dash


def test_owns_storage_path_accepts_a_path_minted_for_this_tenant_and_task():
    tenant_id = uuid.uuid4()
    task_id = uuid.uuid4()
    path = _mint_path(tenant_id, task_id, "invoice.pdf")
    assert _owns_storage_path(tenant_id, task_id, path) is True


def test_owns_storage_path_rejects_a_different_tenants_object():
    tenant_id = uuid.uuid4()
    other_tenant_id = uuid.uuid4()
    task_id = uuid.uuid4()
    path = _mint_path(other_tenant_id, task_id, "invoice.pdf")
    assert _owns_storage_path(tenant_id, task_id, path) is False


def test_owns_storage_path_rejects_a_different_task_under_the_same_tenant():
    tenant_id = uuid.uuid4()
    task_id = uuid.uuid4()
    other_task_id = uuid.uuid4()
    path = _mint_path(tenant_id, other_task_id, "invoice.pdf")
    assert _owns_storage_path(tenant_id, task_id, path) is False


def test_owns_storage_path_rejects_a_crafted_prefix_match_attempt():
    # A caller can't sneak a sibling task's real prefix in by hand-crafting a
    # storage_path string, since the comparison is a strict startswith on the
    # server-derived prefix, not e.g. a substring/regex match.
    tenant_id = uuid.uuid4()
    task_id = uuid.uuid4()
    crafted = f"{tenant_id}evil/tasks/{task_id}/x"
    assert _owns_storage_path(tenant_id, task_id, crafted) is False
