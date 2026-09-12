from datetime import date

from apps.operations.models import Trip
from apps.operations.services.rider_routes import boarding_for_student
from apps.routing.models import Route, RoutePlan, RouteStop, RouteStopStudent


def _route_with_board(district, school, depot, code, student, *, with_trip):
    plan = RoutePlan.objects.create(district=district, name=code, school=school, status="published")
    route = Route.objects.create(
        route_plan=plan, name=code, route_code=code, school=school, depot=depot
    )
    stop = RouteStop.objects.create(
        route=route, sequence=1, kind="stop", name=f"{code} Maple", latitude=38.24, longitude=-85.73
    )
    RouteStop.objects.create(
        route=route, sequence=2, kind="school", name=school.name, latitude=38.2412, longitude=-85.7245
    )
    RouteStopStudent.objects.create(route_stop=stop, student=student, action="board")
    if with_trip:
        Trip.objects.create(district=district, route=route, service_date=date.today(), status="scheduled")
    return route


def test_boarding_prefers_route_running_today(district, school, depot, student):
    # Stale plan (no trip today) created first, so an unordered .first() would pick it.
    stale = _route_with_board(district, school, depot, "OLD-01", student, with_trip=False)
    current = _route_with_board(district, school, depot, "NEW-01", student, with_trip=True)

    _stop, route = boarding_for_student(student)
    assert route.id == current.id, "guardian should resolve to the route with today's trip, not the stale one"
    assert route.id != stale.id
