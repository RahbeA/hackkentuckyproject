from datetime import time

from apps.districts.models import Depot, DistrictPolicy, School
from apps.routing.models import RoutePlan
from apps.routing.services.optimizer import diagnose_infeasibility, generate_plan
from apps.transportation.models import BusStop, DriverProfile, Student, StudentStopAssignment, Vehicle
from common.exceptions.errors import InfeasibleRouteError


def _base(district, school, depot):
    DistrictPolicy.objects.update_or_create(
        district=district,
        defaults={"max_student_ride_minutes": 50, "min_arrival_buffer_minutes": 10},
    )
    v = Vehicle.objects.create(
        district=district, internal_number="BUS-T", license_plate="T", capacity=40, wheelchair_capacity=2, depot=depot
    )
    return v


def test_insufficient_capacity(district, school, depot, planner):
    _base(district, school, depot)
    Vehicle.objects.filter(district=district).update(capacity=1, wheelchair_capacity=0)
    stop = BusStop.objects.create(
        district=district, name="S", stop_code="S1", address="a", latitude=38.25, longitude=-85.73, is_approved=True
    )
    students = []
    for i in range(3):
        st = Student.objects.create(
            district=district,
            external_id=f"C-{i}",
            first_name="A",
            last_name=str(i),
            grade="2",
            school=school,
            home_address="x",
            latitude=38.25,
            longitude=-85.73,
        )
        StudentStopAssignment.objects.create(student=st, bus_stop=stop)
        students.append(st)
    plan = RoutePlan.objects.create(district=district, name="cap", school=school, created_by=planner)
    try:
        generate_plan(plan)
        assert False, "should be infeasible"
    except InfeasibleRouteError as exc:
        assert any("capacity" in r.lower() for r in exc.details["reasons"])


def test_wheelchair_constraint(district, school, depot, planner, driver_user):
    Vehicle.objects.create(
        district=district, internal_number="STD", license_plate="s", capacity=40, wheelchair_capacity=0, depot=depot
    )
    stop = BusStop.objects.create(
        district=district, name="S", stop_code="W1", address="a", latitude=38.245, longitude=-85.73, is_approved=True
    )
    st = Student.objects.create(
        district=district,
        external_id="WC-1",
        first_name="Mia",
        last_name="Santos",
        grade="1",
        school=school,
        home_address="x",
        latitude=38.245,
        longitude=-85.73,
        requires_wheelchair=True,
    )
    StudentStopAssignment.objects.create(student=st, bus_stop=stop)
    plan = RoutePlan.objects.create(district=district, name="wc", school=school, created_by=planner)
    try:
        generate_plan(plan)
        assert False
    except InfeasibleRouteError as exc:
        assert any("wheelchair" in r.lower() for r in exc.details["reasons"])


def test_no_approved_stop(district, school, depot, planner, driver_user):
    Vehicle.objects.create(
        district=district, internal_number="B", license_plate="b", capacity=40, wheelchair_capacity=1, depot=depot
    )
    Student.objects.create(
        district=district,
        external_id="NS-1",
        first_name="No",
        last_name="Stop",
        grade="2",
        school=school,
        home_address="x",
        latitude=38.24,
        longitude=-85.72,
    )
    plan = RoutePlan.objects.create(district=district, name="stop", school=school, created_by=planner)
    generate_plan(plan)
    plan.refresh_from_db()
    assert plan.status == RoutePlan.Status.GENERATED
    assert plan.routes.count() >= 1


def test_feasible_small_plan(district, school, depot, planner, driver_user):
    Vehicle.objects.create(
        district=district,
        internal_number="BUS-OK",
        license_plate="ok",
        capacity=40,
        wheelchair_capacity=2,
        depot=depot,
        status="active",
    )
    stop = BusStop.objects.create(
        district=district,
        name="Maple",
        stop_code="M1",
        address="a",
        latitude=38.247,
        longitude=-85.731,
        is_approved=True,
    )
    for i in range(6):
        st = Student.objects.create(
            district=district,
            external_id=f"OK-{i}",
            first_name="Kid",
            last_name=str(i),
            grade="2",
            school=school,
            home_address="x",
            latitude=38.247 + i * 0.001,
            longitude=-85.731,
        )
        StudentStopAssignment.objects.create(student=st, bus_stop=stop)
    plan = RoutePlan.objects.create(
        district=district, name="ok", school=school, created_by=planner, optimization_mode=RoutePlan.Mode.FASTEST
    )
    generate_plan(plan)
    plan.refresh_from_db()
    assert plan.status == RoutePlan.Status.GENERATED
    assert plan.routes.count() >= 1
    assert plan.routes.first().stops.count() >= 2
