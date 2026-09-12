from datetime import date
import uuid

from django.contrib.auth import get_user_model

from apps.accounts.models import UserRole
from apps.operations.models import Trip
from apps.routing.models import Route, RoutePlan, RouteStop, RouteStopStudent
from apps.transportation.models import DriverProfile, Student, Vehicle
from tests.conftest import api


def _trip(district, school, depot, student=None, driver=None):
    plan = RoutePlan.objects.create(district=district, name="p", school=school, status="published")
    tag = uuid.uuid4().hex[:8]
    v = Vehicle.objects.create(
        district=district, internal_number=f"A-{tag}", license_plate=f"z{tag}", capacity=40, depot=depot
    )
    route = Route.objects.create(
        route_plan=plan,
        name="r",
        route_code="R-EDIT",
        school=school,
        depot=depot,
        assigned_vehicle=v,
        assigned_driver=driver,
        p50_duration_seconds=600,
        p90_duration_seconds=800,
    )
    trip = Trip.objects.create(
        district=district, route=route, service_date=date.today(), vehicle=v, status="scheduled", driver=driver
    )
    RouteStop.objects.create(route=route, sequence=1, kind="stop", name="Maple", latitude=38.24, longitude=-85.73)
    if student:
        RouteStopStudent.objects.create(route_stop=route.stops.first(), student=student, action="board")
        route.student_count = 1
        route.save(update_fields=["student_count"])
    return trip


def test_staff_can_reassign_driver(district, school, depot, dispatcher, driver_user):
    other_user = get_user_model().objects.create_user(
        email="second@jefferson.demo",
        password="DemoPass123!",
        first_name="Sam",
        last_name="Wheel",
        role=UserRole.DRIVER,
        district=district,
    )
    other = DriverProfile.objects.create(user=other_user, district=district, employee_id="D-2002")
    trip = _trip(district, school, depot, driver=driver_user.driver_profile)
    res = api(dispatcher).post(f"/api/v1/trips/{trip.id}/assign-driver/", {"driver": str(other.id)}, format="json")
    assert res.status_code == 200, res.data
    trip.refresh_from_db()
    assert trip.driver_id == other.id
    trip.route.refresh_from_db()
    assert trip.route.assigned_driver_id == other.id


def test_staff_can_move_student_between_trips(district, school, depot, dispatcher, student):
    extra = Student.objects.create(
        district=district,
        external_id="S-2",
        first_name="Leo",
        last_name="Bennett",
        grade="K",
        school=school,
        home_address="514 Maple",
        latitude=38.248,
        longitude=-85.732,
    )
    a = _trip(district, school, depot, student=student)
    b = _trip(district, school, depot, student=extra)
    res = api(dispatcher).post(f"/api/v1/trips/{b.id}/roster-add/", {"student": str(student.id)}, format="json")
    assert res.status_code == 200, res.data
    assert not RouteStopStudent.objects.filter(student=student, route_stop__route=a.route).exists()
    assert RouteStopStudent.objects.filter(student=student, route_stop__route=b.route).exists()
    a.route.refresh_from_db()
    b.route.refresh_from_db()
    assert a.route.student_count == 0
    assert b.route.student_count == 2


def test_staff_can_remove_student(district, school, depot, dispatcher, student):
    trip = _trip(district, school, depot, student=student)
    res = api(dispatcher).post(f"/api/v1/trips/{trip.id}/roster-remove/", {"student": str(student.id)}, format="json")
    assert res.status_code == 200, res.data
    assert not RouteStopStudent.objects.filter(student=student, route_stop__route=trip.route).exists()


def test_guardian_cannot_edit_assignments(district, school, depot, guardian, student, driver_user):
    trip = _trip(district, school, depot, student=student, driver=driver_user.driver_profile)
    client = api(guardian)
    assert client.get("/api/v1/trips/assignment-board/").status_code == 403
    assert client.post(f"/api/v1/trips/{trip.id}/assign-driver/", {"driver": None}, format="json").status_code == 403
    assert client.post(f"/api/v1/trips/{trip.id}/roster-add/", {"student": str(student.id)}, format="json").status_code == 403


def test_assignment_board_lists_roster(district, school, depot, dispatcher, student, driver_user):
    _trip(district, school, depot, student=student, driver=driver_user.driver_profile)
    res = api(dispatcher).get("/api/v1/trips/assignment-board/")
    assert res.status_code == 200, res.data
    assert len(res.data["trips"]) == 1
    assert res.data["trips"][0]["students"][0]["first_name"] == "Ava"
    assert res.data["trips"][0]["driver_name"] == "Test User"
