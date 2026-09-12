from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.models import UserRole
from apps.routing.models import BackgroundJob, Route, RoutePlan, RouteStop, RouteTransfer
from apps.routing.services.optimizer import compare_plans
from apps.routing.tasks import generate_route_plan_task
from common.exceptions.errors import RouteWiseError
from common.permissions.roles import HasRole
from common.permissions.tenancy import TenantQuerySetMixin


class RouteTransferSerializer(serializers.ModelSerializer):
    depot_name = serializers.CharField(source="depot.name", read_only=True)
    feeder_route_code = serializers.CharField(source="feeder_route.route_code", read_only=True)
    trunk_route_code = serializers.CharField(source="trunk_route.route_code", read_only=True)

    class Meta:
        model = RouteTransfer
        fields = (
            "id",
            "depot",
            "depot_name",
            "feeder_route",
            "feeder_route_code",
            "trunk_route",
            "trunk_route_code",
            "planned_arrival",
            "planned_departure",
            "buffer_minutes",
            "student_count",
            "wheelchair_count",
        )


class RouteStopSerializer(serializers.ModelSerializer):
    class Meta:
        model = RouteStop
        fields = (
            "id",
            "sequence",
            "kind",
            "name",
            "bus_stop",
            "latitude",
            "longitude",
            "scheduled_arrival",
            "scheduled_departure",
            "predicted_p50_arrival",
            "predicted_p90_arrival",
            "student_count",
            "cumulative_load",
            "distance_from_previous_km",
            "expected_seconds_from_previous",
        )


class RouteSerializer(serializers.ModelSerializer):
    stops = RouteStopSerializer(many=True, read_only=True)
    vehicle_number = serializers.CharField(source="assigned_vehicle.internal_number", read_only=True, default=None)
    driver_name = serializers.SerializerMethodField()
    school_name = serializers.CharField(source="school.name", read_only=True)
    is_feeder = serializers.SerializerMethodField()
    transfers_out = RouteTransferSerializer(many=True, read_only=True)
    transfers_in = RouteTransferSerializer(many=True, read_only=True)

    class Meta:
        model = Route
        fields = (
            "id",
            "name",
            "route_code",
            "school",
            "school_name",
            "depot",
            "assigned_vehicle",
            "vehicle_number",
            "assigned_driver",
            "driver_name",
            "direction",
            "scheduled_start",
            "scheduled_school_arrival",
            "total_distance_km",
            "p50_duration_seconds",
            "p90_duration_seconds",
            "on_time_probability",
            "risk_score",
            "capacity_utilization",
            "risk_factors",
            "safety_context",
            "student_count",
            "wheelchair_count",
            "is_feeder",
            "transfers_out",
            "transfers_in",
            "stops",
        )

    def get_is_feeder(self, obj):
        return obj.transfers_out.exists()

    def get_driver_name(self, obj):
        if not obj.assigned_driver:
            return None
        u = obj.assigned_driver.user
        return u.full_name


class RoutePlanSerializer(serializers.ModelSerializer):
    routes = RouteSerializer(many=True, read_only=True)
    school_name = serializers.CharField(source="school.name", read_only=True, default=None)
    created_by_email = serializers.EmailField(source="created_by.email", read_only=True, default=None)

    class Meta:
        model = RoutePlan
        fields = (
            "id",
            "district",
            "name",
            "academic_term",
            "status",
            "optimization_mode",
            "school",
            "school_name",
            "created_by",
            "created_by_email",
            "objective_weights",
            "aggregate_metrics",
            "solver_metadata",
            "infeasibility",
            "version",
            "job_id",
            "routes",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "district",
            "status",
            "aggregate_metrics",
            "solver_metadata",
            "infeasibility",
            "job_id",
            "created_at",
            "updated_at",
            "created_by",
        )


class JobSerializer(serializers.ModelSerializer):
    class Meta:
        model = BackgroundJob
        fields = (
            "id",
            "job_type",
            "status",
            "progress",
            "message",
            "result",
            "error",
            "related_id",
            "created_at",
        )


class RoutePlanViewSet(TenantQuerySetMixin, viewsets.ModelViewSet):
    serializer_class = RoutePlanSerializer
    queryset = RoutePlan.objects.select_related("school", "created_by").prefetch_related(
        "routes__stops",
        "routes__assigned_vehicle",
        "routes__assigned_driver__user",
        "routes__transfers_out__depot",
        "routes__transfers_out__trunk_route",
        "routes__transfers_in__depot",
        "routes__transfers_in__feeder_route",
    )
    permission_classes = [IsAuthenticated, HasRole]
    allowed_roles = (
        UserRole.PLATFORM_ADMIN,
        UserRole.DISTRICT_ADMIN,
        UserRole.PLANNER,
        UserRole.DISPATCHER,
    )
    filterset_fields = ("status", "optimization_mode", "school")
    search_fields = ("name",)

    def perform_create(self, serializer):
        serializer.save(district=self.request.user.district, created_by=self.request.user)

    def get_serializer(self, *args, **kwargs):
        # list views skip nested stops for speed
        ser = super().get_serializer(*args, **kwargs)
        return ser

    def list(self, request, *args, **kwargs):
        qs = self.filter_queryset(self.get_queryset())
        page = self.paginate_queryset(qs)
        ser = RoutePlanSerializer(page or qs, many=True)
        # Strip heavy nested routes on list
        data = ser.data
        for item in data:
            item.pop("routes", None)
        if page is not None:
            return self.get_paginated_response(data)
        return Response(data)

    @action(detail=True, methods=["post"])
    def generate(self, request, pk=None):
        plan = self.get_object()
        if request.user.role not in {
            UserRole.PLATFORM_ADMIN,
            UserRole.DISTRICT_ADMIN,
            UserRole.PLANNER,
        }:
            raise RouteWiseError("Planners generate route plans.", code="FORBIDDEN", status_code=403)
        weights = request.data.get("objective_weights") or plan.objective_weights
        if weights:
            plan.objective_weights = weights
        plan.optimization_mode = request.data.get("optimization_mode", plan.optimization_mode)
        plan.status = RoutePlan.Status.GENERATING
        plan.save()
        job = BackgroundJob.objects.create(
            district=plan.district,
            job_type="route_generation",
            status=BackgroundJob.Status.QUEUED,
            related_id=plan.id,
            created_by=request.user,
            message="Queued route generation",
        )
        plan.job_id = job.id
        plan.save(update_fields=["job_id"])
        generate_route_plan_task.delay(
            str(plan.id),
            str(job.id),
            request.data.get("vehicle_ids"),
            request.data.get("driver_ids"),
        )
        job.refresh_from_db()
        plan.refresh_from_db()
        return Response({"job": JobSerializer(job).data, "plan": RoutePlanSerializer(plan).data})

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        plan = self.get_object()
        if plan.status not in {RoutePlan.Status.GENERATED, RoutePlan.Status.APPROVED}:
            raise RouteWiseError("Only generated plans can be approved.", code="INVALID_STATUS")
        plan.status = RoutePlan.Status.APPROVED
        plan.save(update_fields=["status", "updated_at"])
        return Response(RoutePlanSerializer(plan).data)

    @action(detail=True, methods=["post"])
    def publish(self, request, pk=None):
        plan = self.get_object()
        plan.status = RoutePlan.Status.PUBLISHED
        plan.save(update_fields=["status", "updated_at"])
        from apps.operations.services.lifecycle import materialize_trips_for_plan

        trips = materialize_trips_for_plan(plan)
        return Response({"plan": RoutePlanSerializer(plan).data, "trips_created": len(trips)})

    @action(detail=False, methods=["post"], url_path="compare")
    def compare(self, request):
        a_id, b_id = request.data.get("plan_a"), request.data.get("plan_b")
        qs = self.get_queryset()
        try:
            a, b = qs.get(id=a_id), qs.get(id=b_id)
        except RoutePlan.DoesNotExist:
            raise RouteWiseError("Both plans must exist in your district.", code="NOT_FOUND", status_code=404)
        return Response(compare_plans(a, b))

    @action(detail=False, methods=["post"], url_path="scan-construction-hazards")
    def scan_construction_hazards(self, request):
        """Re-checks published routes in the caller's district against live ROW permits."""
        from apps.routing.services.hazard_watch import scan_published_routes

        created = scan_published_routes(district=request.user.district)
        return Response({"alerts_created": len(created), "routes": created})


class JobViewSet(TenantQuerySetMixin, viewsets.ReadOnlyModelViewSet):
    serializer_class = JobSerializer
    queryset = BackgroundJob.objects.all()
    permission_classes = [IsAuthenticated, HasRole]
    allowed_roles = (
        UserRole.PLATFORM_ADMIN,
        UserRole.DISTRICT_ADMIN,
        UserRole.PLANNER,
        UserRole.DISPATCHER,
    )
    filterset_fields = ("job_type", "status")
