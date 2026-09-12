from datetime import date

from apps.operations.models import Trip
from apps.operations.services.live_demo import _select_trips, stop_demo
from apps.operations.services.rider_routes import (
    attach_linked_riders,
    boarding_for_student,
    ensure_demo_geometry,
    ensure_today_trips,
    rider_claim_code,
)
from apps.routing.models import Route, RoutePlan, RouteStop
from tests.conftest import api


def _generated_plan(district, school, depot):
    plan = RoutePlan.objects.create(
        district=district, name="AM generated", school=school, status=RoutePlan.Status.GENERATED
    )
    route = Route.objects.create(
        route_plan=plan,
        name="Oakridge AM",
        route_code="OAK-01",
        school=school,
        depot=depot,
    )
    RouteStop.objects.create(
        route=route, sequence=1, kind="stop", name="Maple", latitude=38.247, longitude=-85.731
    )
    RouteStop.objects.create(
        route=route, sequence=2, kind="school", name="Oakridge", latitude=38.2412, longitude=-85.7245
    )
    return plan, route


def test_rider_claim_code(student):
    assert rider_claim_code(student) == "AVA001"


def test_demo_prep_exposes_linked_parent_trip(district, school, depot, linked_guardian, student):
    """A real district: generated plan + linked parent, no publish / RouteStopStudent yet."""
    _plan, route = _generated_plan(district, school, depot)

    assert Trip.objects.filter(district=district, service_date=date.today()).count() == 0
    stop, found = boarding_for_student(student)
    assert found.id == route.id
    assert stop.name == "Maple"

    trips = ensure_today_trips(district)
    assert trips
    attached = attach_linked_riders(district)
    assert attached == 1

    trip_ids, hero_id = _select_trips(district, [str(route.id)])
    assert trip_ids
    assert hero_id == trip_ids[0]

    client = api(linked_guardian)
    etas = client.get("/api/v1/guardian/etas/")
    assert etas.status_code == 200
    row = etas.data[0]
    assert row["trip_id"]
    assert row["route_code"] == "OAK-01"
    assert row["student_first_name"] == "Ava"

    trip = client.get(f"/api/v1/guardian/trip/{student.id}/")
    assert trip.status_code == 200
    assert trip.data["trip_id"] == row["trip_id"]
    assert len(trip.data["stops"]) == 2

    stop_demo(district)


def test_driver_without_run_can_follow_live_demo(district, school, depot, driver_user):
    """A driver with no assigned trip may follow the district live demo, but only
    while it is running."""
    from apps.operations.services import live_demo as ld

    _plan, route = _generated_plan(district, school, depot)
    trip = Trip.objects.create(
        district=district, route=route, service_date=date.today(), status="scheduled"
    )
    client = api(driver_user)

    # No demo running → the driver sees nothing and cannot open the trip.
    listing = client.get("/api/v1/trips/")
    assert listing.data["count"] == 0
    assert client.get(f"/api/v1/trips/{trip.id}/").status_code == 404

    # Register a running demo controller for this district (no background thread).
    controller = ld.DemoController(str(district.id), [str(trip.id)], str(trip.id))
    controller.running = True
    ld._controllers[str(district.id)] = controller
    try:
        listing = client.get("/api/v1/trips/")
        assert any(row["id"] == str(trip.id) for row in listing.data["results"])
        assert client.get(f"/api/v1/trips/{trip.id}/").status_code == 200
    finally:
        ld._controllers.pop(str(district.id), None)

    # Demo stopped → access is revoked again.
    assert client.get(f"/api/v1/trips/{trip.id}/").status_code == 404


def test_demo_geometry_when_district_has_no_routes(district, school, depot, linked_guardian, student):
    assert ensure_demo_geometry(district) == 1
    assert ensure_demo_geometry(district) == 0  # idempotent once routes exist
    trips = ensure_today_trips(district)
    attach_linked_riders(district)
    assert trips
    etas = api(linked_guardian).get("/api/v1/guardian/etas/")
    assert etas.status_code == 200
    assert etas.data[0]["trip_id"]
    assert etas.data[0]["route_code"].startswith("LD-")
