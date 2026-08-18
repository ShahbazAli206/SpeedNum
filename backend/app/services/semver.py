"""Minimal semantic-version parsing and comparison for desktop release
validation (routers/desktop_releases.py). No third-party dependency for
something this small; deliberately stricter than full semver (no
pre-release/build-metadata suffixes) since a desktop installer version is
always plain X.Y.Z here."""

from __future__ import annotations

import re

_SEMVER_RE = re.compile(r"^(\d{1,6})\.(\d{1,6})\.(\d{1,6})$")


class InvalidVersionError(ValueError):
    pass


def parse_semver(version: str) -> tuple[int, int, int]:
    """Parse a strict "X.Y.Z" version string. Raises InvalidVersionError for
    anything else -- leading "v", pre-release suffixes, extra segments,
    non-numeric parts, or a string-comparable-but-numerically-wrong value
    like "1.10.0" being treated as less than "1.9.0" by an accidental string
    sort."""
    match = _SEMVER_RE.match(version.strip()) if isinstance(version, str) else None
    if not match:
        raise InvalidVersionError(f"{version!r} is not a valid X.Y.Z version.")
    return (int(match.group(1)), int(match.group(2)), int(match.group(3)))


def is_newer(candidate: str, current: str) -> bool:
    """True when `candidate` is strictly newer than `current`, comparing as
    tuples of integers (so 1.10.0 > 1.9.0, unlike a plain string compare)."""
    return parse_semver(candidate) > parse_semver(current)
