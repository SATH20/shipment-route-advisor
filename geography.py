"""Shared geography: port positions and a small sea-lane network.

Used by generate_dataset.py (leg distances) and by the dashboard maps (drawing), so the
distances in the data and the lines on the map come from the same paths.
The optimizer itself never uses this module.

Ports are at their real positions. Sea legs are drawn as the shortest path through a small
graph of sea waypoints placed at the main passages (Malacca, Bab-el-Mandeb, Suez, Gibraltar,
Cape of Good Hope, Panama...), so lines stay on water. The paths are schematic: they show
which passages a route uses, not an actual vessel track.

Region rules (match the dataset):
  red_sea       may use the Red Sea and Suez Canal
  mediterranean from Port Said onwards, no Red Sea
  open_ocean    avoids the Red Sea (routes tagged open_ocean carry low geopolitical risk)
  cape          forced around the Cape of Good Hope
Air and rail legs are drawn as great-circle lines (rail with a few overland waypoints).
"""
from __future__ import annotations

import heapq
import math
from typing import Dict, Iterable, List, Sequence, Tuple

LatLon = Tuple[float, float]

PORTS: Dict[str, LatLon] = {
    "Shanghai": (31.23, 121.49), "Rotterdam": (51.95, 4.13), "Mumbai": (18.95, 72.84),
    "Hamburg": (53.54, 9.97), "Chennai": (13.10, 80.30), "Los Angeles": (33.74, -118.27),
    "Singapore": (1.26, 103.82), "New York": (40.67, -74.04), "Ho Chi Minh": (10.77, 106.70),
    "Felixstowe": (51.96, 1.33), "Nhava Sheva": (18.95, 72.95), "Antwerp": (51.27, 4.35),
    "Busan": (35.10, 129.04), "Savannah": (32.08, -81.09), "Mundra": (22.74, 69.70),
    "Piraeus": (37.94, 23.63), "Colombo": (6.95, 79.84), "Jebel Ali": (25.01, 55.06),
    "Salalah": (16.95, 54.00), "Port Said": (31.26, 32.30), "Kaohsiung": (22.60, 120.28),
    "Algeciras": (36.13, -5.44), "Panama": (8.95, -79.55), "Manzanillo": (19.05, -104.32),
    "Lianyungang": (34.74, 119.45), "Bandar Abbas": (27.15, 56.21), "Seattle": (47.60, -122.34),
}

# sea waypoints
NODES: Dict[str, LatLon] = {
    "ECS": (29.0, 124.0), "TWS": (22.3, 118.6), "LUZ": (20.8, 121.6), "SCS": (12.0, 111.5),
    "SGS": (1.2, 104.3), "MAL": (6.0, 95.0), "SLE": (7.5, 82.4), "CHO": (11.5, 81.4),
    "BOB": (5.2, 80.6), "ARB": (14.0, 62.0), "GKU": (22.4, 68.4), "GOA": (12.6, 47.5),
    "BAB": (12.6, 43.4), "RED": (20.0, 38.6), "SUZ": (28.5, 33.3), "GOO": (24.8, 58.9),
    "HOR": (26.4, 56.5), "MEDE": (33.5, 28.0), "KAS": (35.45, 26.9), "MEDC": (36.2, 15.8),
    "SIC": (37.3, 11.6), "MEDW": (37.6, 4.0), "GIB": (35.95, -5.5), "SVC": (36.6, -9.6),
    "FIN": (43.5, -10.4), "USH": (48.6, -5.9), "CHN": (50.3, -1.0), "DOV": (51.05, 1.6),
    "SCH": (51.45, 3.4), "NOR": (53.0, 3.6), "NSE": (54.1, 7.4), "AZO": (38.0, -28.0),
    "NYA": (38.5, -70.0), "SAVO": (31.6, -80.3), "BAHE": (23.5, -73.0), "WIN": (20.0, -73.9),
    "CAR": (14.0, -76.0), "PANC": (9.7, -79.9), "PANP": (7.6, -79.4), "CRP": (6.6, -83.0),
    "MEXP": (11.5, -90.0), "MZO": (18.6, -104.8), "BAJ": (21.6, -111.0), "LAO": (33.2, -119.2),
    "NP3": (34.5, -135.0), "NP2": (40.0, -160.0), "NWP": (46.5, -130.0), "JDF": (48.4, -124.9),
    "NP1": (37.0, 165.0), "JPS": (31.5, 140.0), "SKY": (29.5, 131.5), "KST": (33.6, 128.7),
    "IO1": (-5.0, 82.0), "IO3": (-2.0, 58.0), "IO2": (-20.0, 62.0), "MADS": (-30.0, 45.0),
    "CAPE": (-36.0, 20.0), "CAPEFAR": (-39.5, 20.0), "SATL": (-20.0, 0.0), "WA": (0.0, -15.0),
    "CVD": (16.0, -27.0), "CVN": (35.0, -15.0), "LANT": (15.0, -55.0),
}

EDGES = [
    # East Asia / Pacific
    ("Shanghai", "ECS"), ("Lianyungang", "ECS"), ("ECS", "TWS"), ("ECS", "SKY"), ("Busan", "KST"),
    ("KST", "ECS"), ("KST", "SKY"), ("SKY", "JPS"), ("Kaohsiung", "TWS"), ("Kaohsiung", "LUZ"),
    ("TWS", "LUZ"), ("TWS", "SCS"), ("LUZ", "JPS"), ("JPS", "NP1"), ("NP1", "NP2"), ("NP2", "NP3"),
    ("NP2", "NWP"), ("NWP", "JDF"), ("JDF", "Seattle"), ("NP3", "LAO"), ("LAO", "Los Angeles"),
    ("LAO", "BAJ"), ("BAJ", "MZO"), ("MZO", "Manzanillo"), ("MZO", "MEXP"), ("MEXP", "CRP"),
    ("CRP", "PANP"), ("PANP", "Panama"), ("Panama", "PANC"),
    # South East Asia / Indian Ocean
    ("Ho Chi Minh", "SCS"), ("SCS", "SGS"), ("Singapore", "SGS"), ("SGS", "MAL"), ("MAL", "BOB"),
    ("MAL", "SLE"), ("SLE", "CHO"), ("CHO", "Chennai"), ("SLE", "BOB"), ("Colombo", "BOB"),
    ("BOB", "ARB"), ("BOB", "IO1"), ("Mumbai", "ARB"), ("Nhava Sheva", "ARB"), ("Mundra", "GKU"),
    ("GKU", "ARB"), ("GKU", "GOO"), ("ARB", "GOO"), ("GOO", "HOR"), ("HOR", "Jebel Ali"),
    ("HOR", "Bandar Abbas"), ("Salalah", "ARB"), ("Salalah", "GOA"), ("ARB", "GOA"), ("ARB", "IO3"),
    ("IO1", "IO2"), ("IO3", "IO2"), ("IO2", "MADS"), ("MADS", "CAPE"), ("MADS", "CAPEFAR"),
    # Red Sea / Suez / Mediterranean
    ("GOA", "BAB"), ("BAB", "RED"), ("RED", "SUZ"), ("SUZ", "Port Said"), ("Port Said", "MEDE"),
    ("MEDE", "KAS"), ("KAS", "Piraeus"), ("MEDE", "MEDC"), ("MEDC", "SIC"), ("SIC", "MEDW"),
    ("MEDW", "GIB"), ("GIB", "Algeciras"), ("GIB", "SVC"), ("SVC", "FIN"), ("SVC", "CVN"),
    # North Europe
    ("FIN", "USH"), ("USH", "CHN"), ("CHN", "DOV"), ("DOV", "Felixstowe"), ("DOV", "SCH"),
    ("SCH", "Antwerp"), ("DOV", "NOR"), ("NOR", "Rotterdam"), ("NOR", "NSE"), ("NSE", "Hamburg"),
    # Atlantic / Americas
    ("CAPE", "SATL"), ("CAPEFAR", "SATL"), ("SATL", "WA"), ("WA", "CVD"), ("CVD", "CVN"),
    ("CVN", "FIN"), ("WA", "LANT"), ("LANT", "NYA"), ("LANT", "CAR"), ("LANT", "BAHE"),
    ("GIB", "AZO"), ("AZO", "NYA"), ("AZO", "FIN"), ("NYA", "New York"), ("NYA", "SAVO"),
    ("SAVO", "Savannah"), ("BAHE", "SAVO"), ("WIN", "BAHE"), ("CAR", "WIN"), ("CAR", "PANC"),
]

# overland waypoints for rail legs (from, to) -> intermediate points
RAIL_VIA: Dict[Tuple[str, str], List[LatLon]] = {
    ("Lianyungang", "Rotterdam"): [(34.3, 108.9), (43.8, 87.6), (51.2, 71.4), (55.8, 37.6), (52.2, 21.0), (52.5, 13.4)],
    ("Lianyungang", "Felixstowe"): [(34.3, 108.9), (43.8, 87.6), (51.2, 71.4), (55.8, 37.6), (52.2, 21.0), (51.4, 6.8), (50.9, 1.8)],
    ("Bandar Abbas", "Antwerp"): [(35.7, 51.4), (40.4, 49.9), (44.2, 42.0), (47.2, 39.7), (50.4, 30.5), (52.2, 21.0), (51.4, 6.8)],
    ("Bandar Abbas", "Hamburg"): [(35.7, 51.4), (40.4, 49.9), (44.2, 42.0), (47.2, 39.7), (50.4, 30.5), (52.2, 21.0)],
    ("Bandar Abbas", "Piraeus"): [(35.7, 51.4), (38.1, 46.3), (39.9, 32.9), (41.0, 29.0), (40.6, 22.9)],
    ("Los Angeles", "New York"): [(35.1, -106.6), (38.6, -90.2), (41.9, -87.6), (41.5, -81.7)],
    ("Los Angeles", "Savannah"): [(32.2, -110.9), (32.8, -96.8), (33.7, -84.4)],
    ("Seattle", "Los Angeles"): [(45.5, -122.7), (40.6, -122.4), (38.6, -121.5)],
}

CANALS = {"Panama"}

_RULES = {
    "red_sea": {"CAPEFAR"},
    "mediterranean": {"CAPEFAR", "RED", "BAB", "SUZ"},
    "open_ocean": {"CAPEFAR", "RED", "SUZ"},
    "cape": {"RED", "SUZ"},
}


def _coord(name: str) -> LatLon:
    return PORTS[name] if name in PORTS else NODES[name]


def _km(a: LatLon, b: LatLon) -> float:
    la1, lo1, la2, lo2 = map(math.radians, (*a, *b))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(h))


_ADJ: Dict[str, List[str]] = {}
for _a, _b in EDGES:
    _ADJ.setdefault(_a, []).append(_b)
    _ADJ.setdefault(_b, []).append(_a)


def _shortest(src: str, dst: str, banned: Iterable[str]) -> List[str]:
    banned = set(banned)
    dist, prev, heap = {src: 0.0}, {}, [(0.0, src)]
    while heap:
        d, u = heapq.heappop(heap)
        if u == dst:
            break
        if d > dist.get(u, math.inf):
            continue
        for v in _ADJ.get(u, []):
            # ports are not pass-through points, except the Panama Canal
            if v in banned or (v in PORTS and v not in (src, dst) and v not in CANALS):
                continue
            nd = d + _km(_coord(u), _coord(v))
            if nd < dist.get(v, math.inf):
                dist[v], prev[v] = nd, u
                heapq.heappush(heap, (nd, v))
    if dst not in dist:
        return [src, dst]
    path = [dst]
    while path[-1] != src:
        path.append(prev[path[-1]])
    return path[::-1]


def sea_path(frm: str, to: str, region: str) -> List[LatLon]:
    banned = _RULES.get(region, set())
    if region == "cape":
        banned = banned | {"CAPE"}
        names = _shortest(frm, "CAPEFAR", banned) + _shortest("CAPEFAR", to, banned)[1:]
    else:
        names = _shortest(frm, to, banned)
    return [_coord(n) for n in names]


def leg_path(frm: str, to: str, mode: str, region: str) -> List[LatLon]:
    if frm not in PORTS or to not in PORTS:
        return []
    if mode == "sea":
        return sea_path(frm, to, region)
    if mode == "rail":
        return [PORTS[frm]] + RAIL_VIA.get((frm, to), []) + [PORTS[to]]
    return [PORTS[frm], PORTS[to]]                        # air: drawn as a great circle


def route_path(legs: Sequence) -> List[LatLon]:
    pts: List[LatLon] = []
    for l in legs:
        p = leg_path(l.from_hub, l.to_hub, l.mode, l.region)
        pts.extend(p if not pts else p[1:])
    return pts


def path_km(points: Sequence[LatLon]) -> float:
    return sum(_km(a, b) for a, b in zip(points, points[1:]))


def leg_km(frm: str, to: str, mode: str, region: str) -> float:
    """Distance of a leg along its drawn path. Air uses the great circle plus 5% for routing."""
    pts = leg_path(frm, to, mode, region)
    return path_km(pts) * (1.05 if mode == "air" else 1.0)


WAYPOINT_PASSAGES: Dict[str, str] = {
    "CAPE": "Cape of Good Hope",
    "CAPEFAR": "Cape of Good Hope",
    "SUZ": "Suez Canal",
    "Panama": "Panama Canal",
    "MAL": "Strait of Malacca",
    "SGS": "Strait of Malacca",
    "GIB": "Strait of Gibraltar",
    "BAB": "Bab-el-Mandeb",
}


def route_passages(legs: Sequence) -> List[str]:
    """Human-readable names of the passages a route goes through (labels only)."""
    passages: List[str] = []
    seen = set()

    def add_passage(name: str):
        if name not in seen:
            seen.add(name)
            passages.append(name)

    for l in legs:
        if l.mode == "rail":
            add_passage("rail across land")
        elif l.mode == "air":
            add_passage("flight")
        elif l.mode == "sea":
            banned = _RULES.get(l.region, set())
            if l.region == "cape":
                banned = banned | {"CAPE"}
                names = _shortest(l.from_hub, "CAPEFAR", banned) + _shortest("CAPEFAR", l.to_hub, banned)[1:]
            else:
                names = _shortest(l.from_hub, l.to_hub, banned)
            for n in names:
                if n in WAYPOINT_PASSAGES:
                    add_passage(WAYPOINT_PASSAGES[n])

    return passages

