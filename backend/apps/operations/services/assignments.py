from django.db import transaction
from django.db.models import Count

from apps.accounts.models import UserRole
from apps.routing.models import Route, RouteStop, RouteStopStudent
from apps.transportation.models import DriverProfile, Student
from common.exceptions.errors import RouteWiseError


def _same_district(user, district_id) -> bool:
    if user.role == UserRole.PLATFORM_ADMIN:
        return True
    return bool(user.district_id and district_id and str(user.district_id) == str(district_id))


def recount_route(route: Route) -> None:
    board_ids = list(
        RouteStopStudent.objects.filter(
            route_stop__route=route,
            action=RouteStopStudent.Action.BOARD,
        ).values_list("student_id", flat=True)
    )
    unique = set(board_ids)
    route.student_count = len(unique)
    route.wheelchair_count = Student.objects.filter(id__in=unique, requires_wheelchair=True).count()
    route.save(update_fields=["student_count", "wheelchair_count"])
    counts = {
        row["route_stop"]: row["n"]
        for row in RouteStopStudent.objects.filter(
            route_stop__route=route,
            action=RouteStopStudent.Action.BOARD,
        )
        .values("route_stop")
        .annotate(n=Count("id"))
    }
    for stop in route.stops.all():
        n = counts.get(stop.id, 0)
        if stop.student_count != n:
            stop.student_count = n
            stop.save(update_fields=["student_count"])


def assign_trip_driver(trip, *, driver_id, user):
    if driver_id in (None, ""):
        trip.driver = None
    else:
        try:
            driver = DriverProfile.objects.select_related("user").get(id=driver_id)
        except DriverProfile.DoesNotExist as exc:
            raise RouteWiseError("Driver not found.", code="NOT_FOUND", status_code=404) from exc
        if not _same_district(user, driver.district_id) or not _same_district(user, trip.district_id):
            raise RouteWiseError("That driver is not in this district.", code="FORBIDDEN", status_code=403)
        if not driver.is_active:
            raise RouteWiseError("That driver is inactive.", code="INACTIVE_DRIVER", status_code=400)
        trip.driver = driver
    trip.save(update_fields=["driver"])
    if trip.route_id:
        trip.route.assigned_driver = trip.driver
        trip.route.save(update_fields=["assigned_driver"])
    trip.refresh_from_db()
    return trip


def _pickup_stop(route: Route, stop_id=None, student: Student | None = None) -> RouteStop:
    stops = list(route.stops.all())
    if stop_id:
        for s in stops:
            if str(s.id) == str(stop_id):
                return s
        raise RouteWiseError("That stop is not on this route.", code="NOT_FOUND", status_code=404)
    if student:
        assigned = student.stop_assignments.filter(is_active=True).select_related("bus_stop").first()
        if assigned:
            match = next((s for s in stops if s.bus_stop_id and s.bus_stop_id == assigned.bus_stop_id), None)
            if match:
                return match
    pickup = next((s for s in stops if s.kind == "stop"), None)
    if pickup:
        return pickup
    if stops:
        return stops[0]
    raise RouteWiseError("This route has no stops to board at.", code="NO_STOPS", status_code=400)


@transaction.atomic
def add_student_to_trip(trip, *, student_id, user, stop_id=None):
    try:
        student = Student.objects.get(id=student_id)
    except Student.DoesNotExist as exc:
        raise RouteWiseError("Student not found.", code="NOT_FOUND", status_code=404) from exc
    if not _same_district(user, student.district_id) or not _same_district(user, trip.district_id):
        raise RouteWiseError("That student is not in this district.", code="FORBIDDEN", status_code=403)
    if not student.is_active:
        raise RouteWiseError("That student is inactive.", code="INACTIVE_STUDENT", status_code=400)

    route = trip.route
    existing = RouteStopStudent.objects.filter(
        student=student,
        action=RouteStopStudent.Action.BOARD,
        route_stop__route__direction=route.direction,
        route_stop__route__route_plan__district_id=trip.district_id,
    ).select_related("route_stop__route")
    touched: set[Route] = set()
    for row in existing:
        if row.route_stop.route_id != route.id:
            touched.add(row.route_stop.route)
            row.delete()

    stop = _pickup_stop(route, stop_id, student)
    RouteStopStudent.objects.get_or_create(
        route_stop=stop,
        student=student,
        defaults={"action": RouteStopStudent.Action.BOARD},
    )
    recount_route(route)
    for other in touched:
        recount_route(other)
    return student, stop


@transaction.atomic
def remove_student_from_trip(trip, *, student_id, user):
    try:
        student = Student.objects.get(id=student_id)
    except Student.DoesNotExist as exc:
        raise RouteWiseError("Student not found.", code="NOT_FOUND", status_code=404) from exc
    if not _same_district(user, trip.district_id):
        raise RouteWiseError("You cannot change this roster.", code="FORBIDDEN", status_code=403)
    RouteStopStudent.objects.filter(student=student, route_stop__route=trip.route).delete()
    recount_route(trip.route)
    return student
