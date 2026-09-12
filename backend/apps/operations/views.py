from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.models import GuardianStudentLink, UserRole
from apps.operations.models import Incident, OperationalAlert, StopEvent, Trip
from apps.operations.serializers import (
    AlertSerializer,
    GPSSerializer,
    GuardianETASerializer,
    IncidentSerializer,
    TripDetailSerializer,
    TripListSerializer,
)
from apps.operations.services.alerts import send_guardian_trip_alert
from apps.operations.services.assignments import add_student_to_trip, assign_trip_driver, remove_student_from_trip
from apps.operations.services.lifecycle import broadcast_event, ingest_gps, refresh_trip_eta
from apps.operations.services.rider_routes import boarding_for_student, guardian_route_ids, rider_claim_code
from apps.routing.models import RouteStopStudent
from apps.transportation.models import Student
from common.exceptions.errors import RouteWiseError
from common.permissions.roles import HasRole
from common.permissions.tenancy import TenantQuerySetMixin

STAFF = (
    UserRole.PLATFORM_ADMIN,
    UserRole.DISTRICT_ADMIN,
    UserRole.PLANNER,
    UserRole.DISPATCHER,
)

class TripViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    serializer_class = TripListSerializer
    queryset = Trip.objects.select_related(
        "route__school", "vehicle", "driver__user", "district"
    ).prefetch_related("positions", "alerts", "incidents", "stop_events", "route__stops")
    permission_classes = [IsAuthenticated, HasRole]
    allowed_roles = STAFF + (UserRole.DRIVER, UserRole.GUARDIAN)
    filterset_fields = ("status", "service_date")

    def get_serializer_class(self):
        if self.action in {"retrieve", "timeline"}:
            return TripDetailSerializer
        return TripListSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role == UserRole.DRIVER:
            owned = qs.filter(driver__user=user)
            if owned.exists():
                return owned
            # Driver has no assigned run — let them follow the district live demo
            # so they can see the drive experience even without a route today.
            from apps.operations.services.live_demo import running_trip_ids

            live_ids = running_trip_ids(user.district_id)
            if live_ids:
                return qs.filter(id__in=live_ids)
            return owned
        if user.role == UserRole.GUARDIAN:
            student_ids = list(
                GuardianStudentLink.objects.filter(guardian=user, is_verified=True).values_list(
                    "student_id", flat=True
                )
            )
            return qs.filter(route_id__in=guardian_route_ids(student_ids))
        if self.request.query_params.get("at_risk"):
            qs = qs.order_by("-late_probability", "-current_delay_seconds")
        return qs

    def _driver_or_staff(self, trip):
        user = self.request.user
        if user.role in STAFF:
            return
        if user.role == UserRole.DRIVER:
            if trip.driver and trip.driver.user_id == user.id:
                return
            # A driver without a run may follow a trip that the district live
            # demo is currently animating (read-only follow experience).
            from apps.operations.services.live_demo import running_trip_ids

            if str(trip.id) in running_trip_ids(user.district_id):
                return
        raise RouteWiseError("You cannot access this trip.", code="FORBIDDEN", status_code=403)

    def _require_staff(self):
        if self.request.user.role not in STAFF:
            raise RouteWiseError("Only district staff can change assignments.", code="FORBIDDEN", status_code=403)

    def update(self, request, *args, **kwargs):
        self._require_staff()
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        self._require_staff()
        return super().partial_update(request, *args, **kwargs)

    def perform_update(self, serializer):
        serializer.save()
        trip = serializer.instance
        if "driver" in serializer.validated_data and trip.route_id:
            trip.route.assigned_driver = trip.driver
            trip.route.save(update_fields=["assigned_driver"])

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        trip = self.get_object()
        self._driver_or_staff(trip)
        trip.status = Trip.Status.ACTIVE
        trip.actual_start = timezone.now()
        trip.save()
        refresh_trip_eta(trip)
        broadcast_event(trip, "trip.status.updated", {"status": trip.status})
        return Response(TripDetailSerializer(trip).data)

    @action(detail=True, methods=["post"])
    def pause(self, request, pk=None):
        trip = self.get_object()
        self._driver_or_staff(trip)
        trip.status = Trip.Status.PAUSED
        trip.save()
        broadcast_event(trip, "trip.status.updated", {"status": trip.status})
        return Response(TripDetailSerializer(trip).data)

    @action(detail=True, methods=["post"])
    def resume(self, request, pk=None):
        trip = self.get_object()
        self._driver_or_staff(trip)
        trip.status = Trip.Status.ACTIVE
        trip.save()
        broadcast_event(trip, "trip.status.updated", {"status": trip.status})
        return Response(TripDetailSerializer(trip).data)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        trip = self.get_object()
        self._driver_or_staff(trip)
        trip.status = Trip.Status.COMPLETED
        trip.actual_completion = timezone.now()
        trip.save()
        broadcast_event(trip, "trip.status.updated", {"status": trip.status})
        return Response(TripDetailSerializer(trip).data)

    @action(detail=True, methods=["post"], url_path="arrive-stop")
    def arrive_stop(self, request, pk=None):
        trip = self.get_object()
        self._driver_or_staff(trip)
        rs_id = request.data.get("route_stop_id")
        event, _ = StopEvent.objects.get_or_create(trip=trip, route_stop_id=rs_id)
        event.arrival_time = timezone.now()
        event.save()
        trip.current_stop_sequence = (trip.current_stop_sequence or 0) + 1
        trip.save()
        return Response({"event": event.id, "trip": TripDetailSerializer(trip).data})

    @action(detail=True, methods=["post"], url_path="depart-stop")
    def depart_stop(self, request, pk=None):
        trip = self.get_object()
        self._driver_or_staff(trip)
        rs_id = request.data.get("route_stop_id")
        event, _ = StopEvent.objects.get_or_create(trip=trip, route_stop_id=rs_id)
        event.departure_time = timezone.now()
        event.boarded_count = int(request.data.get("boarded_count") or event.boarded_count)
        event.absent_count = int(request.data.get("absent_count") or event.absent_count)
        event.save()
        return Response({"ok": True})

    @action(detail=True, methods=["post"], url_path="gps")
    def gps(self, request, pk=None):
        trip = self.get_object()
        self._driver_or_staff(trip)
        pos = ingest_gps(
            trip,
            request.data.get("latitude"),
            request.data.get("longitude"),
            heading=float(request.data.get("heading") or 0),
            speed=float(request.data.get("speed_kmh") or 0),
            is_simulated=bool(request.data.get("is_simulated")),
        )
        return Response(GPSSerializer(pos).data)

    @action(detail=True, methods=["get"], url_path="manifest")
    def manifest(self, request, pk=None):
        trip = self.get_object()
        self._driver_or_staff(trip)
        if request.user.role == UserRole.GUARDIAN:
            raise RouteWiseError("Guardians cannot view manifests.", code="FORBIDDEN", status_code=403)
        payload = []
        for stop in trip.route.stops.filter(kind="stop"):
            kids = RouteStopStudent.objects.filter(route_stop=stop).select_related("student")
            payload.append(
                {
                    "stop_id": str(stop.id),
                    "stop_name": stop.name,
                    "sequence": stop.sequence,
                    "scheduled_arrival": stop.scheduled_arrival,
                    "students": [
                        {
                            "id": str(k.student_id),
                            "first_name": k.student.first_name,
                            "last_name": k.student.last_name,
                            "wheelchair": k.student.requires_wheelchair,
                            "grade": k.student.grade,
                        }
                        for k in kids
                    ],
                }
            )
        return Response(payload)

    @action(detail=False, methods=["get"], url_path="assignment-board")
    def assignment_board(self, request):
        """Today's trips with driver + roster so staff can edit assignments in one screen."""
        self._require_staff()
        qs = self.get_queryset().prefetch_related("route__stops__students__student")
        service_date = request.query_params.get("service_date")
        if service_date:
            qs = qs.filter(service_date=service_date)
        else:
            today = timezone.localdate()
            if qs.filter(service_date=today).exists():
                qs = qs.filter(service_date=today)
            else:
                latest = qs.order_by("-service_date").values_list("service_date", flat=True).first()
                if latest:
                    qs = qs.filter(service_date=latest)
        qs = qs.select_related("route__school", "driver__user", "vehicle", "district").order_by(
            "route__route_code", "service_date"
        )
        trips = []
        seated_ids: set = set()
        board_date = None
        for trip in qs:
            if board_date is None:
                board_date = trip.service_date
            students = []
            for stop in trip.route.stops.all():
                for row in stop.students.all():
                    if row.action != RouteStopStudent.Action.BOARD:
                        continue
                    s = row.student
                    seated_ids.add(s.id)
                    students.append(
                        {
                            "id": str(s.id),
                            "first_name": s.first_name,
                            "last_name": s.last_name,
                            "grade": s.grade,
                            "wheelchair": s.requires_wheelchair,
                            "stop_id": str(stop.id),
                            "stop_name": stop.name,
                        }
                    )
            trips.append(
                {
                    "id": str(trip.id),
                    "route": str(trip.route_id),
                    "route_code": trip.route.route_code,
                    "district_name": trip.district.name if trip.district_id else None,
                    "school": str(trip.route.school_id) if trip.route.school_id else None,
                    "school_name": trip.route.school.name if trip.route.school_id else None,
                    "service_date": trip.service_date,
                    "status": trip.status,
                    "driver": str(trip.driver_id) if trip.driver_id else None,
                    "driver_name": trip.driver.user.full_name if trip.driver_id else None,
                    "vehicle": str(trip.vehicle_id) if trip.vehicle_id else None,
                    "vehicle_number": trip.vehicle.internal_number if trip.vehicle_id else None,
                    "student_count": len(students),
                    "stops": [
                        {"id": str(s.id), "name": s.name, "sequence": s.sequence, "kind": s.kind}
                        for s in trip.route.stops.all()
                    ],
                    "students": students,
                }
            )
        unassigned_qs = Student.objects.filter(is_active=True).exclude(id__in=seated_ids)
        if request.user.district_id:
            unassigned_qs = unassigned_qs.filter(district_id=request.user.district_id)
        elif qs:
            unassigned_qs = unassigned_qs.filter(district_id__in={t.district_id for t in qs})
        unassigned = [
            {
                "id": str(s.id),
                "first_name": s.first_name,
                "last_name": s.last_name,
                "grade": s.grade,
                "school_name": s.school.name if s.school_id else None,
            }
            for s in unassigned_qs.select_related("school").order_by("last_name", "first_name")[:400]
        ]
        return Response({"service_date": board_date, "trips": trips, "unassigned": unassigned})

    @action(detail=True, methods=["post"], url_path="assign-driver")
    def assign_driver(self, request, pk=None):
        self._require_staff()
        trip = self.get_object()
        assign_trip_driver(trip, driver_id=request.data.get("driver"), user=request.user)
        trip = self.get_queryset().get(pk=trip.pk)
        return Response(TripDetailSerializer(trip).data)

    @action(detail=True, methods=["post"], url_path="roster-add")
    def roster_add(self, request, pk=None):
        self._require_staff()
        trip = self.get_object()
        student, stop = add_student_to_trip(
            trip,
            student_id=request.data.get("student"),
            user=request.user,
            stop_id=request.data.get("stop_id"),
        )
        return Response(
            {
                "ok": True,
                "student_id": str(student.id),
                "stop_id": str(stop.id),
                "stop_name": stop.name,
                "student_count": trip.route.student_count,
            }
        )

    @action(detail=True, methods=["post"], url_path="roster-remove")
    def roster_remove(self, request, pk=None):
        self._require_staff()
        trip = self.get_object()
        student = remove_student_from_trip(trip, student_id=request.data.get("student"), user=request.user)
        trip.route.refresh_from_db()
        return Response({"ok": True, "student_id": str(student.id), "student_count": trip.route.student_count})

    @action(detail=True, methods=["post"], url_path="simulate-step")
    def simulate_step(self, request, pk=None):
        """Dev-only interpolated GPS step along the route polyline."""
        trip = self.get_object()
        self._driver_or_staff(trip)
        if not request.user.is_staff and request.user.role not in set(STAFF) | {UserRole.DRIVER}:
            raise RouteWiseError("Not allowed.", code="FORBIDDEN", status_code=403)
        t = float(request.data.get("t") or 0)
        from apps.routing.services.street_router import interpolate_along, passed_stop_sequence, route_geometry

        geo = route_geometry(trip.route, fetch=True)
        coords = geo.get("coordinates") or []
        if len(coords) < 2:
            raise RouteWiseError("Route has no path to simulate.", code="NO_PATH")
        lat, lng, heading, along = interpolate_along(coords, t)
        pos = ingest_gps(trip, lat, lng, heading=heading, speed=32, is_simulated=True)
        trip.current_stop_sequence = passed_stop_sequence(trip.route, along, coords)
        if trip.status == Trip.Status.SCHEDULED:
            trip.status = Trip.Status.ACTIVE
            trip.actual_start = timezone.now()
        trip.save(update_fields=["current_stop_sequence", "status", "actual_start"])
        return Response(
            {
                "position": GPSSerializer(pos).data,
                "t": t,
                "simulated": True,
                "heading": heading,
                "follows_streets": bool(geo.get("follows_streets")),
            }
        )

    @action(detail=True, methods=["post"], url_path="disrupt")
    def disrupt(self, request, pk=None):
        trip = self.get_object()
        if request.user.role not in STAFF:
            raise RouteWiseError("Dispatchers inject disruptions in demo mode.", code="FORBIDDEN", status_code=403)
        minutes = int(request.data.get("minutes") or 8)
        refresh_trip_eta(trip, extra_delay_s=minutes * 60)
        broadcast_event(trip, "trip.status.updated", {"status": trip.status, "disruption": True})
        return Response(TripDetailSerializer(trip).data)

    @action(detail=True, methods=["post"], url_path="alert-guardians")
    def alert_guardians(self, request, pk=None):
        """Staff or the assigned driver: accident, breakdown, running late, or other.

        Creates an OperationalAlert (dispatcher feed), an Incident for
        accident/breakdown/other, and a Notification for every verified
        guardian of a student on this route.
        """
        trip = self.get_object()
        user = request.user
        assigned_driver = user.role == UserRole.DRIVER and trip.driver and trip.driver.user_id == user.id
        if user.role not in STAFF and not assigned_driver:
            raise RouteWiseError(
                "Only dispatchers or the assigned driver can send guardian alerts.",
                code="FORBIDDEN",
                status_code=403,
            )

        result = send_guardian_trip_alert(
            trip,
            alert_type=request.data.get("alert_type"),
            message=request.data.get("message") or "",
            severity=request.data.get("severity"),
            created_by=user,
        )
        return Response(
            {
                "alert": AlertSerializer(result.alert).data,
                "incident_id": str(result.incident.id) if result.incident else None,
                "guardians_notified": result.guardians_notified,
            },
            status=201,
        )


class AlertViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    serializer_class = AlertSerializer
    queryset = OperationalAlert.objects.select_related("trip__route")
    permission_classes = [IsAuthenticated, HasRole]
    allowed_roles = STAFF
    filterset_fields = ("is_acknowledged", "severity", "alert_type")

    @action(detail=True, methods=["post"])
    def acknowledge(self, request, pk=None):
        alert = self.get_object()
        alert.is_acknowledged = True
        alert.acknowledged_by = request.user
        alert.acknowledged_at = timezone.now()
        alert.save()
        return Response(AlertSerializer(alert).data)


class IncidentViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    serializer_class = IncidentSerializer
    queryset = Incident.objects.select_related("trip")
    permission_classes = [IsAuthenticated, HasRole]
    allowed_roles = STAFF + (UserRole.DRIVER,)
    tenant_field = "trip__district_id"

    def perform_create(self, serializer):
        trip = serializer.validated_data["trip"]
        user = self.request.user
        if user.role == UserRole.DRIVER and not (trip.driver and trip.driver.user_id == user.id):
            raise RouteWiseError("Drivers may only report incidents on their trips.", code="FORBIDDEN", status_code=403)
        incident = serializer.save(created_by=user)
        broadcast_event(trip, "incident.updated", {"incident_id": str(incident.id), "status": incident.status})


class GuardianViewSet(viewsets.ViewSet):
    permission_classes = [IsAuthenticated]

    def _links(self, request):
        if request.user.role != UserRole.GUARDIAN:
            raise RouteWiseError("Guardian role required.", code="FORBIDDEN", status_code=403)
        return GuardianStudentLink.objects.filter(guardian=request.user, is_verified=True).select_related(
            "student__school"
        )

    def children(self, request):
        from apps.transportation.serializers import GuardianChildSerializer

        students = [link.student for link in self._links(request)]
        return Response(GuardianChildSerializer(students, many=True).data)

    def etas(self, request):
        payload = []
        today = timezone.localdate()
        for link in self._links(request):
            stop, route = boarding_for_student(link.student)
            if not stop or not route:
                payload.append(
                    {
                        "student_id": str(link.student_id),
                        "student_first_name": link.student.first_name,
                        "stop_name": None,
                        "scheduled_pickup": None,
                        "status": "unassigned",
                        "delay_seconds": 0,
                        "p50_eta": None,
                        "is_simulated": False,
                        "on_time": True,
                        "trip_id": None,
                        "route_code": None,
                        "school_name": link.student.school.name if link.student.school_id else None,
                        "current_stop_sequence": 0,
                        "stop_count": 0,
                        "my_stop_sequence": None,
                        "late_probability": 0.0,
                        "latitude": None,
                        "longitude": None,
                        "heading": None,
                    }
                )
                continue
            trip = Trip.objects.filter(route=route, service_date=today).order_by("-created_at").first()
            delay = trip.current_delay_seconds if trip else 0
            pos = trip.positions.order_by("-timestamp").first() if trip else None
            school_name = None
            if trip and trip.route.school_id:
                school_name = trip.route.school.name
            elif route.school_id:
                school_name = route.school.name
            elif link.student.school_id:
                school_name = link.student.school.name
            payload.append(
                {
                    "student_id": str(link.student_id),
                    "student_first_name": link.student.first_name,
                    "stop_name": stop.name,
                    "scheduled_pickup": stop.scheduled_arrival,
                    "status": trip.status if trip else "scheduled",
                    "delay_seconds": delay,
                    "p50_eta": trip.current_p50_eta if trip else None,
                    "is_simulated": bool(trip.is_simulated) if trip else False,
                    "on_time": delay < 180,
                    "trip_id": str(trip.id) if trip else None,
                    "route_code": (trip.route.route_code if trip else route.route_code),
                    "school_name": school_name,
                    "current_stop_sequence": trip.current_stop_sequence if trip else 0,
                    "stop_count": route.stops.count(),
                    "my_stop_sequence": stop.sequence,
                    "late_probability": trip.late_probability if trip else 0.0,
                    "latitude": float(pos.latitude) if pos else None,
                    "longitude": float(pos.longitude) if pos else None,
                    "heading": float(pos.heading) if pos else None,
                }
            )
        return Response(GuardianETASerializer(payload, many=True).data)

    def mark_absent(self, request):
        student_id = request.data.get("student_id")
        link = self._links(request).filter(student_id=student_id).first()
        if not link:
            raise RouteWiseError("Student is not linked to this guardian.", code="FORBIDDEN", status_code=403)
        note = (request.data.get("note") or "").strip()
        scope = request.data.get("scope") or "am"
        stop, route = boarding_for_student(link.student)
        if stop and route:
            today = timezone.localdate()
            trip = Trip.objects.filter(route=route, service_date=today).first()
            if trip:
                event, _ = StopEvent.objects.get_or_create(trip=trip, route_stop=stop)
                marker = f"[absent:{link.student_id}]"
                if marker in (event.notes or ""):
                    return Response(
                        {"ok": True, "student_id": str(link.student_id), "scope": scope, "already": True}
                    )
                event.absent_count = (event.absent_count or 0) + 1
                extra = f" Guardian marked {link.student.first_name} absent ({scope}). {marker}"
                if note:
                    extra += f" Note: {note}"
                event.notes = (event.notes or "") + extra
                event.save()
        return Response({"ok": True, "student_id": str(link.student_id), "scope": scope})

    def trip_for_student(self, request, student_id=None):
        """Privacy-safe trip path + stops for one linked rider. No manifest."""
        from apps.routing.services.street_router import route_geometry

        link = self._links(request).filter(student_id=student_id).first()
        if not link:
            raise RouteWiseError("Student is not linked to this guardian.", code="FORBIDDEN", status_code=403)
        stop, route = boarding_for_student(link.student)
        if not stop or not route:
            return Response({"student_id": str(link.student_id), "trip_id": None, "stops": [], "path": []})
        today = timezone.localdate()
        trip = Trip.objects.filter(route=route, service_date=today).order_by("-created_at").first()
        geo = route_geometry(route, fetch=True)
        coords = geo.get("coordinates") or []
        if len(coords) < 2:
            coords = [[float(s.longitude), float(s.latitude)] for s in route.stops.all()]
        stops = [
            {
                "id": str(s.id),
                "name": s.name,
                "sequence": s.sequence,
                "kind": s.kind,
                "latitude": float(s.latitude),
                "longitude": float(s.longitude),
                "scheduled_arrival": s.scheduled_arrival,
            }
            for s in route.stops.all()
        ]
        return Response(
            {
                "student_id": str(link.student_id),
                "student_first_name": link.student.first_name,
                "trip_id": str(trip.id) if trip else None,
                "route_code": route.route_code,
                "school_name": route.school.name if route.school_id else None,
                "status": trip.status if trip else "scheduled",
                "current_stop_sequence": trip.current_stop_sequence if trip else 0,
                "current_p50_eta": trip.current_p50_eta if trip else None,
                "is_simulated": bool(trip.is_simulated) if trip else False,
                "my_stop_sequence": stop.sequence,
                "my_stop_name": stop.name,
                "path": coords,
                "stops": stops,
            }
        )

    def claim(self, request):
        from apps.transportation.models import Student
        from apps.transportation.serializers import GuardianChildSerializer

        code = (request.data.get("code") or "").strip().upper().replace("-", "").replace(" ", "")
        if len(code) < 4:
            raise RouteWiseError("Enter the six-character rider code from your district.", code="INVALID_CODE")
        match = None
        for student in Student.objects.filter(district=request.user.district, is_active=True):
            if rider_claim_code(student) == code:
                match = student
                break
        if not match:
            raise RouteWiseError("That code is not valid. Contact the transportation office.", code="INVALID_CODE")
        link, created = GuardianStudentLink.objects.get_or_create(
            guardian=request.user,
            student=match,
            defaults={"relationship": "parent", "is_verified": True, "notification_preferences": {"eta": True, "delay": True}},
        )
        if not link.is_verified:
            link.is_verified = True
            link.save(update_fields=["is_verified"])
        return Response(
            {
                "ok": True,
                "already_linked": not created,
                "student": GuardianChildSerializer(match).data,
                "code": rider_claim_code(match),
            }
        )

    def history(self, request):
        student_ids = list(self._links(request).values_list("student_id", flat=True))
        route_ids = guardian_route_ids(student_ids)
        trips = Trip.objects.filter(route_id__in=route_ids).order_by("-service_date")[:20]
        # Do not leak other students
        data = []
        for t in trips:
            data.append(
                {
                    "trip_id": str(t.id),
                    "service_date": t.service_date,
                    "status": t.status,
                    "delay_seconds": t.current_delay_seconds,
                    "school_name": t.route.school.name,
                }
            )
        return Response(data)
