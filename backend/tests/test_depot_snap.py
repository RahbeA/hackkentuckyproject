from apps.districts.models import Depot
from apps.districts.services import snap_depot_to_service_area
from common.utilities.geo import haversine_km


def test_snaps_misplaced_depot_onto_school_area(district, school):
    # A signup-placeholder depot far away (Columbus, OH) from a Louisville school.
    depot = Depot.objects.create(
        district=district, name="Main Bus Depot", address="x", latitude=40.0155, longitude=-83.0300
    )
    assert haversine_km(depot.latitude, depot.longitude, school.latitude, school.longitude) > 120

    moved = snap_depot_to_service_area(district)
    assert moved is True

    depot.refresh_from_db()
    # Now within the service area (co-located with the school centroid).
    assert haversine_km(depot.latitude, depot.longitude, school.latitude, school.longitude) < 1


def test_leaves_local_depot_in_place(district, school, depot):
    before = (float(depot.latitude), float(depot.longitude))
    moved = snap_depot_to_service_area(district)
    assert moved is False
    depot.refresh_from_db()
    assert (float(depot.latitude), float(depot.longitude)) == before


def test_no_schools_is_noop(district):
    Depot.objects.create(district=district, name="Main Bus Depot", address="x", latitude=40.0, longitude=-83.0)
    assert snap_depot_to_service_area(district) is False
