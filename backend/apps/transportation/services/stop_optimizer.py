"""Suggest bus-stop locations from student home addresses.

Turns a school's roster of home addresses into a small set of walk-radius-
constrained stop clusters, nudges each stop off a Vision Zero high-injury
corridor when the real Louisville geodata layer flags one nearby, and names
each stop from the nearest classified road. Nothing touches the database
until `commit_suggested_stops` runs — `suggest_stops` is a pure read.

Algorithm: greedy furthest-point seeding + nearest-centroid growth. Each new
cluster starts from whichever unclustered student is worst-served by the
clusters formed so far (spreads stops out instead of clumping them), then
repeatedly absorbs its nearest remaining student as long as *every* member's
distance to the recomputed centroid stays within the walking-distance policy.
This is a standard radius-constrained clustering heuristic — not an exhaustive
optimum, but a well-behaved, explainable one, consistent with the rest of
this codebase's approach (see apps.routing.services.optimizer for the actual
VRP, which this feeds into).

Known simplification: wheelchair students are clustered separately from
everyone else, at a tighter walk radius, rather than modeling mixed-
accessibility stops with per-student distance caps.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

from django.db import transaction

from common.utilities.geo import haversine_km

DEFAULT_MAX_STUDENTS_PER_STOP = 12
WHEELCHAIR_MAX_WALK_M = 150
NUDGE_RADIUS_M = 70.0
NUDGE_BEARINGS = (0, 45, 90, 135, 180, 225, 270, 315)


@dataclass
class _Cluster:
    students: list = field(default_factory=list)
    lat: float = 0.0
    lng: float = 0.0


def _walk_m(lat1, lng1, lat2, lng2) -> float:
    return haversine_km(lat1, lng1, lat2, lng2) * 1000


def _cluster_students(students: list[dict], max_walk_m: float, max_per_stop: int) -> list[_Cluster]:
    remaining = list(students)
    clusters: list[_Cluster] = []

    while remaining:
        if not clusters:
            seed = remaining.pop(0)
        else:
            seed = max(
                remaining,
                key=lambda s: min(_walk_m(s["lat"], s["lng"], c.lat, c.lng) for c in clusters),
            )
            remaining.remove(seed)
        cluster = _Cluster(students=[seed], lat=seed["lat"], lng=seed["lng"])

        while len(cluster.students) < max_per_stop and remaining:
            candidate = min(remaining, key=lambda s: _walk_m(s["lat"], s["lng"], cluster.lat, cluster.lng))
            trial = cluster.students + [candidate]
            trial_lat = sum(s["lat"] for s in trial) / len(trial)
            trial_lng = sum(s["lng"] for s in trial) / len(trial)
            if all(_walk_m(s["lat"], s["lng"], trial_lat, trial_lng) <= max_walk_m for s in trial):
                cluster.students, cluster.lat, cluster.lng = trial, trial_lat, trial_lng
                remaining.remove(candidate)
            else:
                # The nearest remaining student doesn't fit the walk-distance cap;
                # nobody farther away will fit either, so this cluster is done.
                break
        clusters.append(cluster)

    return clusters


def _offset_latlng(lat: float, lng: float, bearing_deg: float, meters: float) -> tuple[float, float]:
    """Small-distance destination point — equirectangular approx, fine at this scale."""
    r = 6371000.0
    brng = math.radians(bearing_deg)
    lat1, lng1 = math.radians(lat), math.radians(lng)
    lat2 = math.asin(math.sin(lat1) * math.cos(meters / r) + math.cos(lat1) * math.sin(meters / r) * math.cos(brng))
    lng2 = lng1 + math.atan2(
        math.sin(brng) * math.sin(meters / r) * math.cos(lat1),
        math.cos(meters / r) - math.sin(lat1) * math.sin(lat2),
    )
    return math.degrees(lat2), math.degrees(lng2)


def _safer_location(cluster: _Cluster, max_walk_m: float) -> tuple[float, float, dict]:
    from apps.geodata import services as geo_services

    flags = geo_services.stop_safety_flags(cluster.lat, cluster.lng)
    if not flags.get("on_high_injury_corridor"):
        return cluster.lat, cluster.lng, flags

    for bearing in NUDGE_BEARINGS:
        lat, lng = _offset_latlng(cluster.lat, cluster.lng, bearing, NUDGE_RADIUS_M)
        if not all(_walk_m(s["lat"], s["lng"], lat, lng) <= max_walk_m for s in cluster.students):
            continue
        candidate_flags = geo_services.stop_safety_flags(lat, lng)
        if not candidate_flags.get("on_high_injury_corridor"):
            return lat, lng, candidate_flags
    # No safer spot fits every member's walk radius — keep the centroid and
    # surface the flag so a planner sees it before approving.
    return cluster.lat, cluster.lng, flags


def _nearest_road_name(lat: float, lng: float) -> str | None:
    from apps.geodata import services as geo_services

    road = geo_services.road_context_for(lat, lng, radius_m=150.0)
    return road["road_name"].title() if road and road.get("road_name") else None


def suggest_stops(
    school,
    direction: str = "am",
    max_students_per_stop: int = DEFAULT_MAX_STUDENTS_PER_STOP,
    only_unassigned: bool = True,
) -> dict:
    from apps.districts.models import DistrictPolicy
    from apps.transportation.models import Student, StudentStopAssignment

    district = school.district
    policy, _ = DistrictPolicy.objects.get_or_create(district=district)
    max_walk_m = float((policy.max_walking_distance_m or {}).get(school.school_type, 500))
    wc_max_walk_m = min(max_walk_m, WHEELCHAIR_MAX_WALK_M)

    qs = Student.objects.filter(district=district, school=school, is_active=True)
    if only_unassigned:
        qs = qs.exclude(
            stop_assignments__is_active=True,
            stop_assignments__direction__in=[direction, StudentStopAssignment.Direction.BOTH],
        )

    considered, skipped = [], []
    for s in qs:
        if s.latitude is None or s.longitude is None:
            skipped.append({"student_id": str(s.id), "name": s.full_name, "reason": "missing coordinates"})
            continue
        considered.append(
            {
                "student_id": str(s.id),
                "name": s.full_name,
                "lat": float(s.latitude),
                "lng": float(s.longitude),
                "requires_wheelchair": s.requires_wheelchair,
            }
        )

    base = {
        "school_id": str(school.id),
        "direction": direction,
        "max_walk_distance_m": max_walk_m,
        "students_considered": len(considered),
        "skipped_students": skipped,
    }
    if not considered:
        return {**base, "suggested_stops": []}

    wc_students = [s for s in considered if s["requires_wheelchair"]]
    other_students = [s for s in considered if not s["requires_wheelchair"]]

    labeled = [
        (c, wc_max_walk_m) for c in (_cluster_students(wc_students, wc_max_walk_m, max_students_per_stop) if wc_students else [])
    ] + [
        (c, max_walk_m) for c in (_cluster_students(other_students, max_walk_m, max_students_per_stop) if other_students else [])
    ]

    suggestions = []
    for i, (cluster, walk_cap) in enumerate(labeled):
        lat, lng, flags = _safer_location(cluster, walk_cap)
        walk_dists = [round(_walk_m(s["lat"], s["lng"], lat, lng)) for s in cluster.students]
        road_name = _nearest_road_name(lat, lng)
        suggestions.append(
            {
                "temp_id": f"suggested-{i}",
                "name": f"Stop near {road_name}" if road_name else f"Suggested Stop {i + 1}",
                "latitude": round(lat, 6),
                "longitude": round(lng, 6),
                "students": [
                    {
                        "student_id": s["student_id"],
                        "name": s["name"],
                        "walk_distance_m": d,
                        "requires_wheelchair": s["requires_wheelchair"],
                    }
                    for s, d in zip(cluster.students, walk_dists)
                ],
                "student_count": len(cluster.students),
                "wheelchair_count": sum(1 for s in cluster.students if s["requires_wheelchair"]),
                "max_walk_distance_m": max(walk_dists),
                "avg_walk_distance_m": round(sum(walk_dists) / len(walk_dists)),
                "safety_flags": flags,
            }
        )

    return {**base, "suggested_stops": suggestions}


def _safety_note_text(flags: dict) -> str:
    notes = []
    if flags.get("on_high_injury_corridor"):
        name = flags.get("high_injury_corridor_name")
        notes.append(
            f"Auto-suggested near a Vision Zero high-injury corridor{f' ({name})' if name else ''} — review placement."
        )
    if not flags.get("has_marked_crossing_or_signal"):
        notes.append("No marked crossing or signal nearby — verify safe pedestrian access before approving.")
    return " ".join(notes)


@transaction.atomic
def commit_suggested_stops(school, suggestions: list[dict], direction: str = "am") -> list:
    """Creates real BusStop + StudentStopAssignment rows from a (possibly edited) suggestion list."""
    from apps.transportation.models import BusStop, Student, StudentStopAssignment

    district = school.district
    prefix = f"{school.school_code}-SUG"
    existing_max = 0
    for code in BusStop.objects.filter(district=district, stop_code__startswith=f"{prefix}-").values_list(
        "stop_code", flat=True
    ):
        try:
            existing_max = max(existing_max, int(code.rsplit("-", 1)[-1]))
        except ValueError:
            continue

    created = []
    for offset, sugg in enumerate(suggestions, start=1):
        stop = BusStop.objects.create(
            district=district,
            name=sugg["name"],
            stop_code=f"{prefix}-{existing_max + offset:03d}",
            address=sugg.get("address", ""),
            latitude=sugg["latitude"],
            longitude=sugg["longitude"],
            accessibility="wheelchair" if any(st.get("requires_wheelchair") for st in sugg["students"]) else "",
            safety_notes=_safety_note_text(sugg.get("safety_flags") or {}),
        )
        for st in sugg["students"]:
            student = Student.objects.get(id=st["student_id"], district=district)
            StudentStopAssignment.objects.update_or_create(
                student=student,
                bus_stop=stop,
                direction=direction,
                defaults={"walking_distance_m": st.get("walk_distance_m", 0), "is_active": True},
            )
        created.append(stop)
    return created
