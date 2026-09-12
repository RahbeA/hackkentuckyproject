"""District-level data hygiene helpers."""

from __future__ import annotations

from common.utilities.geo import haversine_km

# A yard/depot sitting farther than this from *every* school in the district is
# treated as a misplaced default (new districts get a placeholder depot at
# signup) rather than a real, if rural, bus yard. School buses do not garage
# ~100+ km from the schools they serve, so this is a safe signal to relocate.
MISPLACED_DEPOT_KM = 120.0


def snap_depot_to_service_area(district) -> bool:
    """Move any misplaced depot to the centroid of the district's schools.

    Returns True if at least one depot was relocated. No-op when the district
    has no schools yet (the depot cannot be placed sensibly) or when depots are
    already near the roster.
    """
    schools = [
        s
        for s in district.schools.filter(is_active=True)
        if s.latitude is not None and s.longitude is not None
    ]
    if not schools:
        return False

    center_lat = round(sum(float(s.latitude) for s in schools) / len(schools), 6)
    center_lng = round(sum(float(s.longitude) for s in schools) / len(schools), 6)

    moved = False
    for depot in district.depots.filter(is_active=True):
        if depot.latitude is None or depot.longitude is None:
            nearest_km = float("inf")
        else:
            nearest_km = min(
                haversine_km(depot.latitude, depot.longitude, s.latitude, s.longitude)
                for s in schools
            )
        if nearest_km > MISPLACED_DEPOT_KM:
            depot.latitude = center_lat
            depot.longitude = center_lng
            depot.save(update_fields=["latitude", "longitude"])
            moved = True
    return moved
