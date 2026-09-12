from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.models import GuardianStudentLink, UserRole
from apps.transportation.models import BusStop, DriverProfile, Student, StudentStopAssignment, Vehicle
from apps.transportation.serializers import (
    BusStopSerializer,
    DriverProfileSerializer,
    GuardianStudentLinkSerializer,
    StudentSerializer,
    StudentStopAssignmentSerializer,
    VehicleSerializer,
)
from common.exceptions.errors import RouteWiseError
from common.permissions.roles import HasRole
from common.permissions.tenancy import TenantQuerySetMixin

STAFF = (
    UserRole.PLATFORM_ADMIN,
    UserRole.DISTRICT_ADMIN,
    UserRole.PLANNER,
    UserRole.DISPATCHER,
)


class VehicleViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    serializer_class = VehicleSerializer
    queryset = Vehicle.objects.select_related("depot")
    permission_classes = [IsAuthenticated, HasRole]
    allowed_roles = STAFF
    search_fields = ("internal_number", "license_plate")
    filterset_fields = ("status", "vehicle_type", "is_active")

    def perform_create(self, serializer):
        serializer.save(district=self.request.user.district)


class DriverViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    serializer_class = DriverProfileSerializer
    queryset = DriverProfile.objects.select_related("user", "district")
    permission_classes = [IsAuthenticated, HasRole]
    allowed_roles = STAFF + (UserRole.DRIVER,)
    search_fields = ("employee_id", "user__email", "user__first_name", "user__last_name")
    filterset_fields = ("is_active",)

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role == UserRole.DRIVER:
            return qs.filter(user=user)
        return qs

    def perform_create(self, serializer):
        serializer.save(district=self.request.user.district)


class StudentViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    serializer_class = StudentSerializer
    queryset = Student.objects.select_related("school")
    permission_classes = [IsAuthenticated, HasRole]
    allowed_roles = STAFF
    search_fields = ("first_name", "last_name", "external_id")
    filterset_fields = ("school", "grade", "requires_wheelchair", "eligibility", "is_active")

    def perform_create(self, serializer):
        serializer.save(district=self.request.user.district)


class BusStopViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    serializer_class = BusStopSerializer
    queryset = BusStop.objects.all()
    permission_classes = [IsAuthenticated, HasRole]
    allowed_roles = STAFF
    search_fields = ("name", "stop_code", "address")
    filterset_fields = ("is_approved",)

    def perform_create(self, serializer):
        serializer.save(district=self.request.user.district)

    def _school_or_404(self, school_id):
        from apps.districts.models import School

        school = School.objects.filter(id=school_id).select_related("district").first()
        user = self.request.user
        if not school or (user.role != UserRole.PLATFORM_ADMIN and str(school.district_id) != str(user.district_id)):
            raise RouteWiseError("School not found.", code="NOT_FOUND", status_code=404)
        return school

    @action(detail=False, methods=["post"], url_path="suggest")
    def suggest(self, request):
        """Preview walk-radius-constrained stop clusters for a school's students. Read-only."""
        from apps.transportation.services.stop_optimizer import suggest_stops

        school_id = request.data.get("school")
        if not school_id:
            raise RouteWiseError("school is required.", code="INVALID_REQUEST")
        school = self._school_or_404(school_id)
        result = suggest_stops(
            school,
            direction=request.data.get("direction", "am"),
            max_students_per_stop=int(request.data.get("max_students_per_stop", 12)),
            only_unassigned=bool(request.data.get("only_unassigned", True)),
        )
        return Response(result)

    @action(detail=False, methods=["post"], url_path="commit-suggestions")
    def commit_suggestions(self, request):
        """Creates real BusStop + StudentStopAssignment rows from a (possibly edited) suggestion preview."""
        from apps.transportation.services.stop_optimizer import commit_suggested_stops

        school_id = request.data.get("school")
        suggestions = request.data.get("suggestions") or []
        if not school_id or not suggestions:
            raise RouteWiseError("school and suggestions are required.", code="INVALID_REQUEST")
        school = self._school_or_404(school_id)
        created = commit_suggested_stops(school, suggestions, direction=request.data.get("direction", "am"))
        return Response(BusStopSerializer(created, many=True).data, status=201)


class AssignmentViewSet(viewsets.ModelViewSet):
    serializer_class = StudentStopAssignmentSerializer
    queryset = StudentStopAssignment.objects.select_related("student", "bus_stop")
    permission_classes = [IsAuthenticated, HasRole]
    allowed_roles = STAFF

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role == UserRole.PLATFORM_ADMIN:
            return qs
        return qs.filter(student__district_id=user.district_id)


class GuardianLinkViewSet(viewsets.ModelViewSet):
    serializer_class = GuardianStudentLinkSerializer
    queryset = GuardianStudentLink.objects.select_related("guardian", "student")
    permission_classes = [IsAuthenticated, HasRole]
    allowed_roles = (UserRole.PLATFORM_ADMIN, UserRole.DISTRICT_ADMIN)

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.role == UserRole.PLATFORM_ADMIN:
            return qs
        return qs.filter(student__district_id=user.district_id)

    @action(detail=False, methods=["get", "patch"], permission_classes=[IsAuthenticated], url_path="me")
    def me_prefs(self, request):
        if request.user.role != UserRole.GUARDIAN:
            raise RouteWiseError("Only guardians can update their notification preferences.", code="FORBIDDEN", status_code=403)
        links = GuardianStudentLink.objects.filter(guardian=request.user)
        if request.method == "PATCH":
            prefs = request.data.get("notification_preferences") or {}
            links.update(notification_preferences=prefs)
        return Response(GuardianStudentLinkSerializer(links, many=True).data)
