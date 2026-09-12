from datetime import date

from apps.accounts.models import UserRole
from apps.operations.models import Trip
from apps.routing.models import Route, RoutePlan, RouteStop, RouteStopStudent
from tests.conftest import _user, api


def _make_route(district, school, depot, student):
    plan = RoutePlan.objects.create(district=district, name="AM plan", school=school, status="published")
    route = Route.objects.create(
        route_plan=plan, name="LOU-EL-AM-01", route_code="LOU-EL-AM-01", school=school, depot=depot
    )
    stop = RouteStop.objects.create(
        route=route, sequence=1, kind="stop", name="Maple & 3rd", latitude=38.24, longitude=-85.73
    )
    RouteStopStudent.objects.create(route_stop=stop, student=student, action="board")
    Trip.objects.create(district=district, route=route, service_date=date.today(), status="scheduled")
    return route


def test_admin_can_delete_route_and_children(district, district_admin, school, depot, student):
    route = _make_route(district, school, depot, student)
    res = api(district_admin).delete(f"/api/v1/routes/{route.id}/")
    assert res.status_code == 204, getattr(res, "data", res)
    assert not Route.objects.filter(id=route.id).exists()
    assert not RouteStop.objects.filter(route_id=route.id).exists()
    assert not Trip.objects.filter(route_id=route.id).exists()


def test_delete_route_is_district_scoped(district, other_district, school, depot, student):
    route = _make_route(district, school, depot, student)
    outsider = _user("admin@other.demo", UserRole.DISTRICT_ADMIN, other_district)
    res = api(outsider).delete(f"/api/v1/routes/{route.id}/")
    assert res.status_code == 404
    assert Route.objects.filter(id=route.id).exists()


def test_guardian_cannot_delete_route(district, guardian, school, depot, student):
    route = _make_route(district, school, depot, student)
    res = api(guardian).delete(f"/api/v1/routes/{route.id}/")
    assert res.status_code in (403, 404)
    assert Route.objects.filter(id=route.id).exists()
