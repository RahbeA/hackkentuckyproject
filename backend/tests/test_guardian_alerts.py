import uuid
from datetime import date

from apps.accounts.models import GuardianStudentLink
from apps.notifications.models import Notification
from apps.operations.models import Incident, OperationalAlert, Trip
from apps.routing.models import Route, RoutePlan, RouteStop, RouteStopStudent
from apps.transportation.models import Vehicle
from tests.conftest import api


def _trip(district, school, depot, student=None, driver=None):
    plan = RoutePlan.objects.create(district=district, name="p", school=school, status="published")
    tag = uuid.uuid4().hex[:8]
    v = Vehicle.objects.create(district=district, internal_number=f"A-{tag}", license_plate=f"z{tag}", capacity=40, depot=depot)
    route = Route.objects.create(
        route_plan=plan, name="r", route_code="R1", school=school, depot=depot, assigned_vehicle=v,
        p50_duration_seconds=600, p90_duration_seconds=800,
    )
    trip = Trip.objects.create(
        district=district, route=route, service_date=date.today(), vehicle=v, status="active", driver=driver
    )
    if student:
        stop = RouteStop.objects.create(
            route=route, sequence=1, kind="stop", name="Stop", latitude=38.24, longitude=-85.73,
        )
        RouteStopStudent.objects.create(route_stop=stop, student=student, action="board")
    return trip


def test_accident_notifies_guardian_and_logs_incident(district, school, depot, dispatcher, linked_guardian, student):
    trip = _trip(district, school, depot, student=student)
    client = api(dispatcher)
    res = client.post(
        f"/api/v1/trips/{trip.id}/alert-guardians/",
        {"alert_type": "accident", "message": "Minor collision, everyone is safe."},
        format="json",
    )
    assert res.status_code == 201, res.data
    assert res.data["guardians_notified"] == 1
    assert res.data["incident_id"] is not None

    incident = Incident.objects.get(id=res.data["incident_id"])
    assert incident.type == Incident.Type.ACCIDENT
    assert incident.severity == Incident.Severity.CRITICAL

    alert = OperationalAlert.objects.get(id=res.data["alert"]["id"])
    assert alert.alert_type == "manual_accident"
    assert alert.severity == OperationalAlert.Severity.CRITICAL

    note = Notification.objects.get(user=linked_guardian)
    assert "Minor collision" in note.body
    assert note.payload["alert_type"] == "accident"


def test_running_late_is_communication_only_no_incident(district, school, depot, dispatcher, linked_guardian, student):
    trip = _trip(district, school, depot, student=student)
    res = api(dispatcher).post(
        f"/api/v1/trips/{trip.id}/alert-guardians/", {"alert_type": "running_late"}, format="json"
    )
    assert res.status_code == 201
    assert res.data["incident_id"] is None
    assert Incident.objects.filter(trip=trip).count() == 0
    assert OperationalAlert.objects.get(id=res.data["alert"]["id"]).severity == OperationalAlert.Severity.WARNING


def test_accident_bypasses_muted_preferences_but_running_late_respects_them(
    district, school, depot, dispatcher, linked_guardian, student
):
    GuardianStudentLink.objects.filter(guardian=linked_guardian, student=student).update(
        notification_preferences={"emergency": False}
    )
    trip = _trip(district, school, depot, student=student)

    res = api(dispatcher).post(
        f"/api/v1/trips/{trip.id}/alert-guardians/", {"alert_type": "running_late"}, format="json"
    )
    assert res.data["guardians_notified"] == 0

    res = api(dispatcher).post(
        f"/api/v1/trips/{trip.id}/alert-guardians/", {"alert_type": "breakdown"}, format="json"
    )
    assert res.data["guardians_notified"] == 1


def test_unverified_guardian_not_notified(district, school, depot, dispatcher, guardian, student):
    GuardianStudentLink.objects.create(guardian=guardian, student=student, is_verified=False)
    trip = _trip(district, school, depot, student=student)
    res = api(dispatcher).post(
        f"/api/v1/trips/{trip.id}/alert-guardians/", {"alert_type": "accident"}, format="json"
    )
    assert res.data["guardians_notified"] == 0
    assert not Notification.objects.filter(user=guardian).exists()


def test_invalid_alert_type_rejected(district, school, depot, dispatcher):
    trip = _trip(district, school, depot)
    res = api(dispatcher).post(
        f"/api/v1/trips/{trip.id}/alert-guardians/", {"alert_type": "meteor_strike"}, format="json"
    )
    assert res.status_code == 400


def test_driver_on_own_trip_accident_notifies_guardian(
    district, school, depot, driver_user, linked_guardian, student
):
    trip = _trip(district, school, depot, student=student, driver=driver_user.driver_profile)
    res = api(driver_user).post(
        f"/api/v1/trips/{trip.id}/alert-guardians/",
        {"alert_type": "accident", "message": "Collision at 3rd and Oak. Everyone is safe."},
        format="json",
    )
    assert res.status_code == 201, res.data
    assert res.data["guardians_notified"] == 1
    incident = Incident.objects.get(id=res.data["incident_id"])
    assert incident.type == Incident.Type.ACCIDENT
    assert incident.created_by_id == driver_user.id
    note = Notification.objects.get(user=linked_guardian)
    assert note.event_type == "alert.guardian"
    assert "Collision" in note.body


def test_driver_cannot_alert_someone_elses_trip(district, school, depot, driver_user):
    from django.contrib.auth import get_user_model

    from apps.accounts.models import UserRole
    from apps.transportation.models import DriverProfile

    other = get_user_model().objects.create_user(
        email="driver2@jefferson.demo",
        password="DemoPass123!",
        first_name="Other",
        last_name="Driver",
        role=UserRole.DRIVER,
        district=district,
    )
    DriverProfile.objects.create(user=other, district=district, employee_id="D-2002")
    trip = _trip(district, school, depot, driver=driver_user.driver_profile)
    res = api(other).post(
        f"/api/v1/trips/{trip.id}/alert-guardians/", {"alert_type": "accident"}, format="json"
    )
    assert res.status_code in (403, 404)
    assert not Notification.objects.filter(event_type="alert.guardian").exists()


def test_driver_behavior_incident_does_not_notify_guardians(
    district, school, depot, driver_user, linked_guardian, student
):
    trip = _trip(district, school, depot, student=student, driver=driver_user.driver_profile)
    res = api(driver_user).post(
        "/api/v1/incidents/",
        {
            "trip": str(trip.id),
            "type": "behavior",
            "severity": "medium",
            "description": "Student issue on board.",
        },
        format="json",
    )
    assert res.status_code == 201, res.data
    assert Incident.objects.filter(trip=trip, type=Incident.Type.BEHAVIOR).exists()
    assert not Notification.objects.filter(user=linked_guardian).exists()


def test_guardian_cannot_send_guardian_alert(district, school, depot, linked_guardian, student):
    # Trip must be within the guardian's own scope (their linked student's route) so this
    # exercises the role check inside the view, not the queryset's guardian-visibility scoping.
    trip = _trip(district, school, depot, student=student)
    res = api(linked_guardian).post(
        f"/api/v1/trips/{trip.id}/alert-guardians/", {"alert_type": "accident"}, format="json"
    )
    assert res.status_code == 403


def test_guardian_trip_list_scoped_to_own_linked_student(district, school, depot, linked_guardian, student):
    """A guardian should only ever see trips that carry one of their own verified students —
    not every trip in the district (previously the trip queryset had no guardian filter at all)."""
    from apps.transportation.models import Student

    other_student = Student.objects.create(
        district=district,
        external_id="S-2",
        first_name="Other",
        last_name="Kid",
        grade="3",
        school=school,
        home_address="1 Elm",
        latitude=38.25,
        longitude=-85.72,
    )
    own_trip = _trip(district, school, depot, student=student)
    _trip(district, school, depot, student=other_student)  # unrelated trip, must stay invisible

    res = api(linked_guardian).get("/api/v1/trips/")
    assert res.status_code == 200
    ids = {row["id"] for row in res.data["results"]}
    assert ids == {str(own_trip.id)}


def test_guardian_cannot_view_unrelated_trip_detail(district, school, depot, linked_guardian):
    trip = _trip(district, school, depot)  # no student linked to this guardian
    res = api(linked_guardian).get(f"/api/v1/trips/{trip.id}/")
    assert res.status_code == 404
