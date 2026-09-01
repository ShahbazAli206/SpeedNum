"""Unit tests for desktop-release version comparison and publish validation
(routers/desktop_releases.py, services/semver.py). No DB/HTTP client, matching
this suite's existing convention -- the endpoints themselves are thin wrappers
around these pure functions plus a single-table read/write already covered by
the same patterns proven elsewhere in this project (task_attachments.py etc.).
"""

from __future__ import annotations

import pytest

from app.routers.desktop_releases import validate_installer_url, validate_new_release, validate_sha256
from app.services.semver import InvalidVersionError, is_newer, parse_semver

VALID_SHA256 = "a" * 64
BASE_URL = "https://test.spidnums.com/desktop-releases/"


def test_parse_semver_accepts_well_formed_versions():
    assert parse_semver("1.0.0") == (1, 0, 0)
    assert parse_semver("2.10.3") == (2, 10, 3)


@pytest.mark.parametrize("bad", ["1.0", "1.0.0.0", "v1.0.0", "1.0.0-beta", "abc", "", "1..0"])
def test_parse_semver_rejects_malformed_versions(bad):
    with pytest.raises(InvalidVersionError):
        parse_semver(bad)


def test_parse_semver_tolerates_surrounding_whitespace():
    # A version pasted into an admin form field may carry incidental
    # whitespace; stripping it is a deliberate convenience, not a laxness bug.
    assert parse_semver("1.0.0 ") == (1, 0, 0)
    assert parse_semver(" 1.0.0") == (1, 0, 0)


def test_is_newer_compares_numerically_not_as_strings():
    # A plain string compare would put "1.10.0" before "1.9.0" -- the whole
    # reason this exists instead of `candidate > current`.
    assert is_newer("1.10.0", "1.9.0") is True
    assert is_newer("1.9.0", "1.10.0") is False


def test_is_newer_rejects_equal_and_older_versions():
    assert is_newer("1.0.0", "1.0.0") is False
    assert is_newer("0.9.9", "1.0.0") is False


def test_is_newer_handles_major_and_minor_bumps():
    assert is_newer("2.0.0", "1.9.9") is True
    assert is_newer("1.1.0", "1.0.9") is True


def test_validate_installer_url_accepts_the_configured_host():
    assert validate_installer_url(BASE_URL + "SpidNums-Setup-1.0.1.exe") == BASE_URL + "SpidNums-Setup-1.0.1.exe"


@pytest.mark.parametrize(
    "malicious",
    [
        "https://evil.example.com/desktop-releases/SpidNums-Setup.exe",
        "http://test.spidnums.com/desktop-releases/SpidNums-Setup.exe",  # not https
        "https://test.spidnums.com/../etc/passwd",
        "https://test.spidnums.com.evil.com/desktop-releases/x.exe",
        "javascript:alert(1)",
        "file:///etc/passwd",
    ],
)
def test_validate_installer_url_rejects_untrusted_hosts_and_schemes(malicious):
    with pytest.raises(ValueError):
        validate_installer_url(malicious)


def test_validate_sha256_accepts_well_formed_digest():
    assert validate_sha256(VALID_SHA256) == VALID_SHA256
    assert validate_sha256(VALID_SHA256.upper()) == VALID_SHA256  # normalises case


@pytest.mark.parametrize("bad", ["short", "g" * 64, "a" * 63, "a" * 65, "", "not-a-hash-at-all"])
def test_validate_sha256_rejects_malformed_digest(bad):
    with pytest.raises(ValueError):
        validate_sha256(bad)


def test_validate_new_release_accepts_first_ever_release():
    installer_url, sha256 = validate_new_release(
        candidate_version="1.0.0",
        current_version=None,
        installer_url=BASE_URL + "SpidNums-Setup-1.0.0.exe",
        sha256=VALID_SHA256,
    )
    assert installer_url.endswith("1.0.0.exe")
    assert sha256 == VALID_SHA256


def test_validate_new_release_accepts_a_real_version_bump():
    validate_new_release(
        candidate_version="1.0.1",
        current_version="1.0.0",
        installer_url=BASE_URL + "x.exe",
        sha256=VALID_SHA256,
    )  # does not raise


def test_validate_new_release_rejects_a_downgrade():
    with pytest.raises(ValueError):
        validate_new_release(
            candidate_version="1.0.0",
            current_version="1.0.1",
            installer_url=BASE_URL + "x.exe",
            sha256=VALID_SHA256,
        )


def test_validate_new_release_rejects_republishing_the_same_version():
    with pytest.raises(ValueError):
        validate_new_release(
            candidate_version="1.0.0",
            current_version="1.0.0",
            installer_url=BASE_URL + "x.exe",
            sha256=VALID_SHA256,
        )


def test_validate_new_release_rejects_a_malformed_candidate_version():
    with pytest.raises(InvalidVersionError):
        validate_new_release(
            candidate_version="not-a-version",
            current_version="1.0.0",
            installer_url=BASE_URL + "x.exe",
            sha256=VALID_SHA256,
        )


def test_validate_new_release_rejects_an_untrusted_installer_host_even_with_a_valid_version_bump():
    with pytest.raises(ValueError):
        validate_new_release(
            candidate_version="1.0.1",
            current_version="1.0.0",
            installer_url="https://evil.example.com/x.exe",
            sha256=VALID_SHA256,
        )
