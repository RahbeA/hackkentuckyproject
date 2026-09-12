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
from apps.operations.services.lifecycle import broadcast_event, ingest_gps, notify_guardians_for_trip, refresh_trip_eta
from apps.operations.services.rider_routes import boarding_for_student, guardian_route_ids, rider_claim_code
from apps.routing.models import RouteStopStudent
from common.exceptions.errors import RouteWiseError
from common.permissions.roles import HasRole
from common.permissions.tenancy import TenantQuerySetMixin

STAFF = (
    UserRole.PLATFORM_ADMIN,
    UserRole.DISTRICT_ADMIN,
    UserRole.PLANNER,
    UserRole.DISPATCHER,
)

# Dispatcher-initiated guardian alerts. Accident/breakdown also log an
# Incident (a real operational event); running-late/other are communication
# only — being behind schedule isn't itself an incident, and the automatic
# ML-driven delay alert (see lifecycle.maybe_raise_delay_alert) already
# covers that case unprompted. Accident/breakdown bypass guardian
# notification-preference muting since they're safety-critical.
GUARDIAN_ALERT_TYPES = {
    "accident": {"incident_type": Incident.Type.ACCIDENT, "default_severity": "critical", "title": "Accident reported", "bypass_preferences": True},
    "breakdown": {"incident_type": Incident.Type.BREAKDOWN, "default_severity": "critical", "title": "Bus breakdown", "bypass_preferences": True},
    "running_late": {"incident_type": None, "default_severity": "warning", "title": "Running significantly late", "bypass_preferences": False},
    "other": {"incident_type": Incident.Type.OTHER, "default_severity": "warning", "title": "Dispatcher alert", "bypass_preferences": False},
}


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
            return qs.filter(driver__user=user)
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
        if user.role == UserRole.DRIVER and trip.driver and trip.driver.user_id == user.id:
            return
        raise RouteWiseError("You cannot access this trip.", code="FORBIDDEN", status_code=403)

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
        """Dispatcher-initiated emergency alert: accident, breakdown, running very late, or other.

        Creates an OperationalAlert (shows up in the dispatcher alert feed),
        an Incident for accident/breakdown/other (real operational log entry
        — running_late is communication-only), and a Notification for every
        verified guardian of a student on this route.
        """
        trip = self.get_object()
        if request.user.role not in STAFF:
            raise RouteWiseError("Only dispatchers can send guardian alerts.", code="FORBIDDEN", status_code=403)

        alert_type = request.data.get("alert_type")
        spec = GUARDIAN_ALERT_TYPES.get(alert_type)
        if not spec:
            raise RouteWiseError(
                f"alert_type must be one of: {', '.join(GUARDIAN_ALERT_TYPES)}.", code="INVALID_REQUEST"
            )
        severity = request.data.get("severity") or spec["default_severity"]
        if severity not in {"warning", "critical"}:
            raise RouteWiseError("severity must be 'warning' or 'critical'.", code="INVALID_REQUEST")

        message = (request.data.get("message") or "").strip()
        title = f"{spec['title']} — {trip.route.route_code}"
        body = message or (
            f"Dispatch has an update on your child's bus ({trip.route.route_code}). "
            "Please check the app for details."
        )

        incident = None
        if spec["incident_type"] is not None:
            incident = Incident.objects.create(
                trip=trip,
                type=spec["incident_type"],
                severity=Incident.Severity.CRITICAL if severity == "critical" else Incident.Severity.HIGH,
                description=body,
                created_by=request.user,
            )

        alert = OperationalAlert.objects.create(
            district=trip.district,
            trip=trip,
            alert_type=f"manual_{alert_type}",
            title=title,
            message=body,
            severity=OperationalAlert.Severity.CRITICAL if severity == "critical" else OperationalAlert.Severity.WARNING,
        )

        guardians_notified = notify_guardians_for_trip(
            trip,
            title=title,
            body=body,
            event_type="alert.guardian",
            payload={"alert_id": str(alert.id), "trip_id": str(trip.id), "alert_type": alert_type},
            bypass_preferences=spec["bypass_preferences"],
        )

        from apps.notifications.services import notify_roles

        notify_roles(
            trip.district,
            ["dispatcher", "planner", "district_admin"],
            title,
            body,
            "alert.created",
            {"alert_id": str(alert.id), "trip_id": str(trip.id)},
        )
        broadcast_event(trip, "alert.created", {"alert_id": str(alert.id), "title": title})

        return Response(
            {
                "alert": AlertSerializer(alert).data,
                "incident_id": str(incident.id) if incident else None,
                "guardians_notified": guardians_notified,
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
                event.absent_count = (event.absent_count or 0) + 1
                extra = f" Guardian marked {link.student.first_name} absent ({scope})."
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
