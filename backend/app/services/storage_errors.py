"""Shared error type for every storage provider.

Split out of storage.py so storage_supabase.py, storage_s3.py and the
dispatcher (storage.py) can all raise/catch the same exception without a
circular import between the dispatcher and the providers it selects between.
"""

from __future__ import annotations


class StorageError(RuntimeError):
    """A storage provider is unconfigured, or rejected the request."""
