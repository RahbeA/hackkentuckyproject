from apps.districts.models import Depot, DistrictPolicy
from apps.routing.models import Route, RoutePlan, RouteStopStudent, RouteTransfer
from apps.routing.services.optimizer import generate_plan
from apps.transportation.models import BusStop, Student, StudentStopAssignment, Vehicle


def _vehicle(district, depot, number, capacity=20):
    return Vehicle.objects.create(
        district=district, internal_number=number, license_plate=number, capacity=capacity, depot=depot, status="active"
    )


def _student(district, school, external_id, lat, lng, stop):
    s = Student.objects.create(
        district=district,
        external_id=external_id,
        first_name="Kid",
        last_name=external_id,
        grade="3",
        school=school,
        home_address="x",
        latitude=lat,
        longitude=lng,
    )
    StudentStopAssignment.objects.create(student=s, bus_stop=stop, direction="am")
    return s


def _to_seconds(t):
    return t.hour * 3600 + t.minute * 60 + t.second


def test_feeder_and_trunk_routes_link_via_transfer(district, school, depot, planner, driver_user):
    DistrictPolicy.objects.update_or_create(district=district, defaults={"max_student_ride_minutes": 60})
    _vehicle(district, depot, "V1")
    _vehicle(district, depot, "V2")

    hub = Depot.objects.create(
        district=district,
        name="Transfer Hub",
        address="hub",
        latitude=38.225,
        longitude=-85.73,
        is_active=True,
        is_transfer_hub=True,
    )
    feeder_stop = BusStop.objects.create(
        district=district,
        name="Far Stop",
        stop_code="FEED-1",
        address="x",
        latitude=38.15,
        longitude=-85.85,
        is_approved=True,
        transfer_hub=hub,
    )
    direct_stop = BusStop.objects.create(
        district=district, name="Near Stop", stop_code="DIRECT-1", address="x",
        latitude=38.245, longitude=-85.73, is_approved=True,
    )
    feeder_students = [
        _student(district, school, f"FEED-{i}", 38.15 + i * 0.001, -85.85 + i * 0.001, feeder_stop) for i in range(3)
    ]
    direct_student = _student(district, school, "DIRECT-0", 38.245, -85.73, direct_stop)

    plan = RoutePlan.objects.create(district=district, name="hub-plan", school=school, created_by=planner)
    generate_plan(plan)
    plan.refresh_from_db()

    assert plan.status == RoutePlan.Status.GENERATED

    feeder_route = Route.objects.filter(route_plan=plan, route_code__contains="-FEED-").first()
    assert feeder_route is not None, "expected a feeder route ending at the transfer hub"
    assert feeder_route.student_count == 3
    last_stop = feeder_route.stops.order_by("-sequence").first()
    assert last_stop.kind == "transfer"
    assert last_stop.bus_stop is None

    transfer = RouteTransfer.objects.filter(feeder_route=feeder_route).first()
    assert transfer is not None
    assert transfer.depot_id == hub.id
    assert transfer.student_count == 3

    trunk_route = transfer.trunk_route
    assert trunk_route.id != feeder_route.id
    hub_stop = trunk_route.stops.filter(kind="transfer").first()
    assert hub_stop is not None
    assert hub_stop.student_count == 3

    # The trunk vehicle can never be scheduled to leave the hub before the
    # feeder physically arrives there, plus the transfer buffer.
    assert _to_seconds(transfer.planned_departure) >= _to_seconds(transfer.planned_arrival) + transfer.buffer_minutes * 60

    # The 3 transferring students actually board the trunk at the hub stop.
    boarded_ids = set(
        RouteStopStudent.objects.filter(route_stop=hub_stop, action="board").values_list("student_id", flat=True)
    )
    assert boarded_ids == {s.id for s in feeder_students}

    # The direct student rides some route in this plan without ever touching a feeder route.
    direct_assignment = RouteStopStudent.objects.filter(
        student=direct_student, route_stop__route__route_plan=plan
    ).first()
    assert direct_assignment is not None
    assert direct_assignment.route_stop.route.route_code == trunk_route.route_code or (
        Route.objects.filter(id=direct_assignment.route_stop.route_id, route_code__contains="-FEED-").count() == 0
    )

    # Each transferring student boards twice — once per physical bus — while
    # the direct student, who never transfers, boards exactly once.
    for s in feeder_students:
        assert RouteStopStudent.objects.filter(
            student=s, route_stop__route__route_plan=plan, action="board"
        ).count() == 2
    assert RouteStopStudent.objects.filter(
        student=direct_student, route_stop__route__route_plan=plan, action="board"
    ).count() == 1


def test_no_transfer_hub_configured_behaves_exactly_as_before(district, school, depot, planner, driver_user):
    """Regression guard: with no BusStop.transfer_hub set anywhere, no feeder
    routes or RouteTransfer records should ever appear."""
    _vehicle(district, depot, "V1")
    stop = BusStop.objects.create(
        district=district, name="S", stop_code="S1", address="a", latitude=38.247, longitude=-85.731, is_approved=True
    )
    for i in range(4):
        _student(district, school, f"PLAIN-{i}", 38.247 + i * 0.001, -85.731, stop)

    plan = RoutePlan.objects.create(district=district, name="plain-plan", school=school, created_by=planner)
    generate_plan(plan)
    plan.refresh_from_db()

    assert plan.status == RoutePlan.Status.GENERATED
    assert not Route.objects.filter(route_plan=plan, route_code__contains="-FEED-").exists()
    assert not RouteTransfer.objects.filter(feeder_route__route_plan=plan).exists()
    assert not plan.routes.filter(stops__kind="transfer").exists()
