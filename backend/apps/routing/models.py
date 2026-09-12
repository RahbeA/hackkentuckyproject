from django.conf import settings
from django.db import models

from common.utilities.models import TenantModel, TimeStampedUUIDModel


class RoutePlan(TenantModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        GENERATING = "generating", "Generating"
        GENERATED = "generated", "Generated"
        APPROVED = "approved", "Approved"
        PUBLISHED = "published", "Published"
        ARCHIVED = "archived", "Archived"
        FAILED = "failed", "Failed"

    class Mode(models.TextChoices):
        FASTEST = "fastest", "Fastest"
        BALANCED = "balanced", "Balanced"
        RELIABILITY = "reliability", "Reliability"

    name = models.CharField(max_length=200)
    academic_term = models.CharField(max_length=40, default="2026-2027")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    optimization_mode = models.CharField(max_length=20, choices=Mode.choices, default=Mode.BALANCED)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    school = models.ForeignKey("districts.School", null=True, blank=True, on_delete=models.SET_NULL, related_name="route_plans")
    objective_weights = models.JSONField(default=dict, blank=True)
    aggregate_metrics = models.JSONField(default=dict, blank=True)
    solver_metadata = models.JSONField(default=dict, blank=True)
    infeasibility = models.JSONField(default=dict, blank=True)
    version = models.PositiveIntegerField(default=1)
    job_id = models.UUIDField(null=True, blank=True)


class Route(TimeStampedUUIDModel):
    class Direction(models.TextChoices):
        AM = "am", "Morning"
        PM = "pm", "Afternoon"

    route_plan = models.ForeignKey(RoutePlan, on_delete=models.CASCADE, related_name="routes")
    name = models.CharField(max_length=120)
    route_code = models.CharField(max_length=40)
    school = models.ForeignKey("districts.School", on_delete=models.CASCADE, related_name="routes")
    depot = models.ForeignKey("districts.Depot", null=True, on_delete=models.SET_NULL, related_name="routes")
    assigned_vehicle = models.ForeignKey(
        "transportation.Vehicle", null=True, blank=True, on_delete=models.SET_NULL, related_name="routes"
    )
    assigned_driver = models.ForeignKey(
        "transportation.DriverProfile", null=True, blank=True, on_delete=models.SET_NULL, related_name="routes"
    )
    direction = models.CharField(max_length=8, choices=Direction.choices, default=Direction.AM)
    scheduled_start = models.TimeField(null=True, blank=True)
    scheduled_school_arrival = models.TimeField(null=True, blank=True)
    total_distance_km = models.FloatField(default=0)
    p50_duration_seconds = models.PositiveIntegerField(default=0)
    p90_duration_seconds = models.PositiveIntegerField(default=0)
    on_time_probability = models.FloatField(default=0)
    risk_score = models.FloatField(default=0)
    capacity_utilization = models.FloatField(default=0)
    risk_factors = models.JSONField(default=list, blank=True)
    student_count = models.PositiveIntegerField(default=0)
    wheelchair_count = models.PositiveIntegerField(default=0)
    safety_context = models.JSONField(
        default=dict,
        blank=True,
        help_text="High-injury corridor overlap, active construction, signal crossings, snow-route coverage "
        "from the real Louisville Metro / LOJIC open-data layers (apps.geodata).",
    )

    class Meta:
        ordering = ["route_code"]


class RouteStop(TimeStampedUUIDModel):
    route = models.ForeignKey(Route, on_delete=models.CASCADE, related_name="stops")
    bus_stop = models.ForeignKey("transportation.BusStop", null=True, blank=True, on_delete=models.SET_NULL)
    sequence = models.PositiveIntegerField()
    kind = models.CharField(max_length=16, default="stop")  # depot, stop, school
    name = models.CharField(max_length=200)
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    scheduled_arrival = models.TimeField(null=True, blank=True)
    scheduled_departure = models.TimeField(null=True, blank=True)
    predicted_p50_arrival = models.TimeField(null=True, blank=True)
    predicted_p90_arrival = models.TimeField(null=True, blank=True)
    student_count = models.PositiveIntegerField(default=0)
    cumulative_load = models.PositiveIntegerField(default=0)
    distance_from_previous_km = models.FloatField(default=0)
    expected_seconds_from_previous = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["sequence"]
        unique_together = ("route", "sequence")


class RouteStopStudent(TimeStampedUUIDModel):
    class Action(models.TextChoices):
        BOARD = "board", "Board"
        ALIGHT = "alight", "Alight"

    route_stop = models.ForeignKey(RouteStop, on_delete=models.CASCADE, related_name="students")
    student = models.ForeignKey("transportation.Student", on_delete=models.CASCADE, related_name="route_assignments")
    action = models.CharField(max_length=12, choices=Action.choices, default=Action.BOARD)


class RouteTransfer(TimeStampedUUIDModel):
    """Links a feeder route (ends at a transfer hub) to the trunk route that continues from there.

    Both routes are produced by the same generate_plan() call: the feeder
    tier is solved first, targeting an arrival deadline at the hub; its
    result then becomes a hard lower time-window bound on the hub stop in
    the trunk tier, so the trunk vehicle can't be scheduled to leave before
    the transfer is physically possible.
    """

    depot = models.ForeignKey("districts.Depot", on_delete=models.CASCADE, related_name="transfers")
    feeder_route = models.ForeignKey(Route, on_delete=models.CASCADE, related_name="transfers_out")
    trunk_route = models.ForeignKey(Route, on_delete=models.CASCADE, related_name="transfers_in")
    planned_arrival = models.TimeField(help_text="Feeder route's predicted arrival at the hub.")
    planned_departure = models.TimeField(help_text="Trunk route's scheduled time at the hub stop.")
    buffer_minutes = models.PositiveIntegerField(default=5)
    student_count = models.PositiveIntegerField(default=0)
    wheelchair_count = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = ("feeder_route", "trunk_route")
        ordering = ["planned_arrival"]


class TravelMatrixCache(TenantModel):
    cache_key = models.CharField(max_length=128)
    provider = models.CharField(max_length=40)
    payload = models.JSONField(default=dict)
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ("district", "cache_key")


class BackgroundJob(TenantModel):
    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        RUNNING = "running", "Running"
        SUCCEEDED = "succeeded", "Succeeded"
        FAILED = "failed", "Failed"

    job_type = models.CharField(max_length=40)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.QUEUED)
    progress = models.PositiveIntegerField(default=0)
    message = models.CharField(max_length=400, blank=True)
    result = models.JSONField(default=dict, blank=True)
    error = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    related_id = models.UUIDField(null=True, blank=True)
