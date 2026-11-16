"""Precomputed responses for GET /api/shipments/{id} with default settings.

The full analysis of one shipment re-runs the decision about 250 times (confidence check and
tipping points). That takes a fraction of a second on a laptop but about a minute on a free
hosting CPU, so scripts/build_cache.py stores the exact JSON the endpoint returns.

The cache is only used when it was built from the same inputs: manifest.json holds a
fingerprint of the data files, the decision code and the Python / numpy / pandas versions.
If anything differs, the API ignores the cache and computes live, so a stale cache can never
change a result. Rebuild it with:  python scripts/build_cache.py
"""
from __future__ import annotations

import functools
import glob
import hashlib
import json
import os
import platform
from typing import Optional

import numpy
import pandas

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE_DIR = os.path.join(ROOT, "api", "cache")
MANIFEST = os.path.join(CACHE_DIR, "manifest.json")

# everything that can change the response of GET /api/shipments/{id}
SOURCES = ["data/*.csv", "engine/*.py", "services/*.py", "config/*.py", "geography.py", "api/main.py"]

# byte-for-byte the serialisation FastAPI uses for a JSON response
JSON_KW = dict(ensure_ascii=False, allow_nan=False, indent=None, separators=(",", ":"))


def fingerprint() -> str:
    h = hashlib.sha256()
    for pattern in SOURCES:
        for path in sorted(glob.glob(os.path.join(ROOT, pattern))):
            rel = os.path.relpath(path, ROOT).replace("\\", "/")
            with open(path, "rb") as f:
                content = f.read().replace(b"\r\n", b"\n")  # same hash on Windows and Linux checkouts
            h.update(rel.encode() + b"\0" + content + b"\0")
    py = ".".join(platform.python_version_tuple()[:2])
    h.update(f"python {py} numpy {numpy.__version__} pandas {pandas.__version__}".encode())
    return h.hexdigest()


def environment() -> dict:
    return {"python": ".".join(platform.python_version_tuple()[:2]),
            "numpy": numpy.__version__, "pandas": pandas.__version__}


@functools.lru_cache(maxsize=1)
def cache_is_current() -> bool:
    try:
        with open(MANIFEST, encoding="utf-8") as f:
            return json.load(f).get("fingerprint") == fingerprint()
    except (OSError, ValueError):
        return False


@functools.lru_cache(maxsize=64)
def cached_response(shipment_id: str) -> Optional[bytes]:
    """The stored JSON bytes for this shipment, or None (no cache, or built from other inputs)."""
    if not cache_is_current():
        return None
    path = os.path.join(CACHE_DIR, f"{os.path.basename(shipment_id)}.json")
    try:
        with open(path, "rb") as f:
            return f.read()
    except OSError:
        return None


def clear_memory() -> None:
    cache_is_current.cache_clear()
    cached_response.cache_clear()
