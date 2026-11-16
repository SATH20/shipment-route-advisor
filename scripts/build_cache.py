"""Precompute GET /api/shipments/{id} for every shipment with default settings.

Runs the API's own analysis function (the same code path as a live request: analyze +
explain, with the confidence check and tipping points) and writes the exact JSON bytes the
endpoint would return to api/cache/{id}.json, plus api/cache/manifest.json with a
fingerprint of the inputs. The API serves these files only while the fingerprint matches.

Run after changing the data, the engine, services, config, geography.py or api/main.py:

    python scripts/build_cache.py
"""
from __future__ import annotations

import glob
import json
import os
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from api import cache_store  # noqa: E402
from api.main import _load_shipments, _shipment_analysis  # noqa: E402


def main() -> None:
    os.makedirs(cache_store.CACHE_DIR, exist_ok=True)
    ids = sorted(_load_shipments(()))
    for old in glob.glob(os.path.join(cache_store.CACHE_DIR, "*.json")):
        os.remove(old)  # no stale files for shipments that no longer exist
    t0 = time.perf_counter()
    for sid in ids:
        # mode None = the shipment's own profile mode; no events or overrides
        response = _shipment_analysis(sid, None, (), None, None, None, None)
        body = json.dumps(response, **cache_store.JSON_KW).encode("utf-8")
        with open(os.path.join(cache_store.CACHE_DIR, f"{sid}.json"), "wb") as f:
            f.write(body)
    manifest = {
        "fingerprint": cache_store.fingerprint(),
        "environment": cache_store.environment(),
        "shipments": ids,
        "note": "Default-settings responses of GET /api/shipments/{id}. "
                "Rebuild with: python scripts/build_cache.py",
    }
    with open(cache_store.MANIFEST, "w", encoding="utf-8", newline="\n") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")
    cache_store.clear_memory()
    print(f"Wrote {len(ids)} responses to {cache_store.CACHE_DIR} in {time.perf_counter() - t0:.1f}s")
    print(f"fingerprint {manifest['fingerprint'][:16]}...  {manifest['environment']}")


if __name__ == "__main__":
    main()
