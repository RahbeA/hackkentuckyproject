"""Resolve a rider onto a route so a parent can see their child's bus."""

from __future__ import annotations


def rider_claim_code(student) -> str:
    """Deterministic 6-char code, e.g. Ava + S-10001 → AVA001."""
    prefix = (student.first_name or "XXX")[:3].upper().ljust(3, "X")
    digits = "".join(ch for ch in (student.external_id or "") if ch.isdigit())[-3:].zfill(3)
    return f"{prefix}{digits}"


def boarding_for_student(student):
    """Return (route_stop, route) for a rider, or (None, None).

    Prefers an explicit RouteStopStudent board assignment, then a stop
    assignment from import, then any route serving the student's school.
    """
    from django.utils import timezone

    from apps.routing.models import Route, RouteStop, RouteStopStudent
    from apps.transportation.models import StudentStopAssignment

    today = timezone.localdate()
    board_qs = (
        RouteStopStudent.objects.filter(student=student, action=RouteStopStudent.Action.BOARD)
        .exclude(route_stop__route__route_plan__status__in=("archived", "failed"))
        .select_related("route_stop__route__school")
        # A student can carry BOARD rows from several regenerated plans. Prefer
        # the route that is actually running today (what the live map / demo
        # animates) so the parent's pin matches the moving bus, then fall back
        # to the most recently updated plan.
        .order_by("-route_stop__route__route_plan__updated_at")
    )
    rss = board_qs.filter(route_stop__route__trips__service_date=today).first() or board_qs.first()
    if rss:
        return rss.route_stop, rss.route_stop.route

    asg = (
        StudentStopAssignment.objects.filter(student=student, is_active=True)
        .select_related("bus_stop")
        .first()
    )
    if asg and asg.bus_stop_id:
        rs = (
            RouteStop.objects.filter(
                bus_stop_id=asg.bus_stop_id,
                route__route_plan__district=student.district,
            )
            .exclude(route__route_plan__status__in=("archived", "failed"))
            .select_related("route__school")
            .first()
        )
        if not rs:
            rs = (
                RouteStop.objects.filter(
                    route__route_plan__district=student.district,
                    name__iexact=asg.bus_stop.name,
                )
                .exclude(kind="school")
                .exclude(route__route_plan__status__in=("archived", "failed"))
                .select_related("route__school")
                .first()
            )
        if rs:
            return rs, rs.route

    if student.school_id:
        school_routes = (
            Route.objects.filter(
                school_id=student.school_id,
                route_plan__district=student.district,
            )
            .exclude(route_plan__status__in=("archived", "failed"))
            .order_by("-route_plan__updated_at", "route_code")
            .select_related("school")
        )
        route = (
            school_routes.filter(trips__service_date=timezone.localdate()).first()
            or school_routes.first()
        )
        if route:
            rs = (
                route.stops.exclude(kind__in=("school", "depot")).order_by("sequence").first()
                or route.stops.order_by("sequence").first()
            )
            if rs:
                return rs, route
    return None, None


def attach_linked_riders(district) -> int:
    """Give every verified guardian-linked student a board assignment."""
    from apps.accounts.models import GuardianStudentLink
    from apps.routing.models import RouteStopStudent
    from apps.transportation.models import Student

    student_ids = list(
        GuardianStudentLink.objects.filter(student__district=district, is_verified=True).values_list(
            "student_id", flat=True
        )
    )
    if not student_ids:
        return 0
    already = set(
        RouteStopStudent.objects.filter(student_id__in=student_ids).values_list("student_id", flat=True)
    )
    attached = 0
    for sid in student_ids:
        if sid in already:
            continue
        student = Student.objects.select_related("school", "district").filter(id=sid).first()
        if not student:
            continue
        stop, _route = boarding_for_student(student)
        if not stop:
            continue
        RouteStopStudent.objects.get_or_create(
            route_stop=stop,
            student=student,
            defaults={"action": RouteStopStudent.Action.BOARD},
        )
        attached += 1
        already.add(sid)
    return attached


def ensure_demo_geometry(district) -> int:
    """If the district has riders but no usable routes, build a simple AM plan.

    Real sign-ups often import a roster and link parents without generating a
    published plan. The live demo still needs ≥2 stops so a parent can see a bus.
    """
    from apps.accounts.models import GuardianStudentLink
    from apps.districts.models import Depot
    from apps.routing.models import Route, RoutePlan, RouteStop
    from apps.transportation.models import Student

    existing = Route.objects.filter(route_plan__district=district).exclude(
        route_plan__status__in=(RoutePlan.Status.ARCHIVED, RoutePlan.Status.FAILED)
    )
    if any(r.stops.count() >= 2 for r in existing):
        return 0

    student_ids = list(
        GuardianStudentLink.objects.filter(student__district=district, is_verified=True).values_list(
            "student_id", flat=True
        )
    )
    students = list(Student.objects.filter(id__in=student_ids, is_active=True).select_related("school"))
    if not students:
        students = list(Student.objects.filter(district=district, is_active=True).select_related("school")[:16])
    students = [s for s in students if s.school_id and s.latitude and s.longitude]
    if not students:
        return 0

    depot = Depot.objects.filter(district=district, is_active=True).first()
    plan = RoutePlan.objects.create(
        district=district,
        name="Live demo",
        status=RoutePlan.Status.GENERATED,
        school=students[0].school,
    )
    by_school: dict = {}
    for student in students:
        by_school.setdefault(str(student.school_id), []).append(student)

    created = 0
    for kids in by_school.values():
        school = kids[0].school
        created += 1
        code = f"LD-{(school.school_code or 'X')[:6].upper()}-{created:02d}"
        route = Route.objects.create(
            route_plan=plan,
            name=f"{school.name} AM",
            route_code=code,
            school=school,
            depot=depot,
        )
        seq = 1
        if depot:
            RouteStop.objects.create(
                route=route,
                sequence=seq,
                kind="depot",
                name=depot.name,
                latitude=depot.latitude,
                longitude=depot.longitude,
            )
            seq += 1
        for kid in kids[:8]:
            RouteStop.objects.create(
                route=route,
                sequence=seq,
                kind="stop",
                name=f"{kid.first_name}'s stop",
                latitude=kid.latitude,
                longitude=kid.longitude,
            )
            seq += 1
        RouteStop.objects.create(
            route=route,
            sequence=seq,
            kind="school",
            name=school.name,
            latitude=school.latitude,
            longitude=school.longitude,
        )
    return created


def ensure_today_trips(district) -> list:
    """Materialize today's trips from published (or latest usable) plans."""
    from apps.operations.services.lifecycle import materialize_trips_for_plan
    from apps.routing.models import RoutePlan

    plans = list(RoutePlan.objects.filter(district=district, status=RoutePlan.Status.PUBLISHED))
    if not plans:
        plans = list(
            RoutePlan.objects.filter(
                district=district,
                status__in=[
                    RoutePlan.Status.GENERATED,
                    RoutePlan.Status.APPROVED,
                    RoutePlan.Status.PUBLISHED,
                ],
            )
        )
    if not plans:
        latest = (
            RoutePlan.objects.filter(district=district)
            .exclude(status__in=[RoutePlan.Status.FAILED, RoutePlan.Status.ARCHIVED])
            .order_by("-updated_at")
            .first()
        )
        if latest:
            plans = [latest]
    trips = []
    for plan in plans:
        trips.extend(materialize_trips_for_plan(plan))
    return trips


def hero_route_ids_for_district(district) -> list[str]:
    """Routes that verified parents are watching — always include these in the demo."""
    from apps.accounts.models import GuardianStudentLink
    from apps.routing.models import RouteStopStudent
    from apps.transportation.models import Student

    student_ids = list(
        GuardianStudentLink.objects.filter(student__district=district, is_verified=True).values_list(
            "student_id", flat=True
        )
    )
    ids = [
        str(rid)
        for rid in RouteStopStudent.objects.filter(student_id__in=student_ids)
        .values_list("route_stop__route_id", flat=True)
        .distinct()
        if rid
    ]
    have = set(ids)
    for sid in student_ids:
        student = Student.objects.filter(id=sid).select_related("school").first()
        if not student:
            continue
        _stop, route = boarding_for_student(student)
        if route and str(route.id) not in have:
            ids.append(str(route.id))
            have.add(str(route.id))
    return ids


def guardian_route_ids(student_ids) -> list:
    """Route IDs for a set of students, including boarding fallbacks."""
    from apps.routing.models import RouteStopStudent
    from apps.transportation.models import Student

    route_ids = list(
        RouteStopStudent.objects.filter(student_id__in=student_ids).values_list(
            "route_stop__route_id", flat=True
        )
    )
    have = {str(rid) for rid in route_ids if rid}
    for student in Student.objects.filter(id__in=student_ids).select_related("school"):
        _stop, route = boarding_for_student(student)
        if route and str(route.id) not in have:
            route_ids.append(route.id)
            have.add(str(route.id))
    return route_ids
