"""Unit tests for the small shared helpers in app/utils.py."""

from __future__ import annotations

from dataclasses import dataclass

import pytest
from fastapi import HTTPException
from pydantic import BaseModel

from app.utils import apply_updates, as_float, ensure_found, group_count, is_valid_signature_data_url


class _Update(BaseModel):
    name: str | None = None
    age: int | None = None


@dataclass
class _Row:
    name: str
    age: int


def test_apply_updates_only_touches_fields_explicitly_set():
    row = _Row(name="Ada", age=30)
    changed = apply_updates(row, _Update(name="Grace"))
    assert row.name == "Grace"
    assert row.age == 30  # untouched: not present in the payload at all
    assert changed == ["name"]


def test_apply_updates_ignores_a_value_equal_to_the_current_one():
    row = _Row(name="Ada", age=30)
    changed = apply_updates(row, _Update(name="Ada", age=31))
    assert changed == ["age"]
    assert row.age == 31


def test_apply_updates_respects_the_allowed_filter():
    row = _Row(name="Ada", age=30)
    changed = apply_updates(row, _Update(name="Grace", age=99), allowed={"name"})
    assert row.name == "Grace"
    assert row.age == 30
    assert changed == ["name"]


def test_ensure_found_returns_the_object_when_present():
    row = _Row(name="Ada", age=30)
    assert ensure_found(row, "Row") is row


def test_ensure_found_raises_404_when_missing():
    with pytest.raises(HTTPException) as exc_info:
        ensure_found(None, "Client")
    assert exc_info.value.status_code == 404
    assert "Client" in exc_info.value.detail


@pytest.mark.parametrize(
    "value,default,expected",
    [
        (None, 0.0, 0.0),
        (None, 5.0, 5.0),
        ("12.5", 0.0, 12.5),
        (7, 0.0, 7.0),
        ("not-a-number", 2.0, 2.0),
    ],
)
def test_as_float_covers_none_and_bad_input(value, default, expected):
    assert as_float(value, default) == expected


def test_group_count_sorts_by_count_descending():
    rows = [_Row("a", 1), _Row("b", 1), _Row("a", 1), _Row("c", 1)]
    result = group_count(rows, "name")
    assert result[0] == {"key": "a", "count": 2}
    assert {"key": "b", "count": 1} in result
    assert {"key": "c", "count": 1} in result
    assert len(result) == 3


@pytest.mark.parametrize(
    "value,expected",
    [
        ("data:image/png;base64,iVBORw0KGgo=", True),
        ("data:image/jpeg;base64,/9j/4AAQ", True),
        ("not-a-data-url", False),
        ("", False),
        ("https://example.com/signature.png", False),
        ("data:text/plain;base64,aGVsbG8=", False),
    ],
)
def test_is_valid_signature_data_url(value, expected):
    assert is_valid_signature_data_url(value) is expected
