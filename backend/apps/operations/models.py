from django.conf import settings
from django.db import models

from common.utilities.models import TenantModel, TimeStampedUUIDModel


class Trip(TenantModel):
    class Status(models.TextChoices):
        SCHEDULED = "scheduled", "Scheduled"
        ACTIVE = "active", "Active"
        PAUSED = "paused", "Paused"
        COMPLETED = "completed", "Completed"
        CANCELED = "canceled", "Canceled"

    route = models.ForeignKey("routing.Route", on_delete=models.CASCADE, related_name="trips")
    service_date = models.DateField()
    driver = models.ForeignKey(
        "transportation.DriverProfile", null=True, blank=True, on_delete=models.SET_NULL, related_name="trips"
    )
    vehicle = models.ForeignKey(
        "transportation.Vehicle", null=True, blank=True, on_delete=models.SET_NULL, related_name="trips"
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.SCHEDULED)
    actual_start = models.DateTimeField(null=True, blank=True)
    actual_completion = models.DateTimeField(null=True, blank=True)
    current_delay_seconds = models.IntegerField(default=0)
    current_p50_eta = models.DateTimeField(null=True, blank=True)
    current_p90_eta = models.DateTimeField(null=True, blank=True)
    late_probability = models.FloatField(default=0)
    current_stop_sequence = models.PositiveIntegerField(default=0)
    ml_explanation = models.TextField(blank=True)
    is_simulated = models.BooleanField(default=False)

    class Meta:
        unique_together = ("route", "service_date")
        ordering = ["-service_date", "route__route_code"]


class GPSPosition(TimeStampedUUIDModel):
    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="positions")
    timestamp = models.DateTimeField()
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    heading = models.FloatField(default=0)
    speed_kmh = models.FloatField(default=0)
    accuracy_m = models.FloatField(default=8)
    is_simulated = models.BooleanField(default=False)

    class Meta:
        ordering = ["timestamp"]
        indexes = [models.Index(fields=["trip", "timestamp"])]


class StopEvent(TimeStampedUUIDModel):
    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="stop_events")
    route_stop = models.ForeignKey("routing.RouteStop", on_delete=models.CASCADE, related_name="events")
    arrival_time = models.DateTimeField(null=True, blank=True)
    departure_time = models.DateTimeField(null=True, blank=True)
    boarded_count = models.PositiveIntegerField(default=0)
    absent_count = models.PositiveIntegerField(default=0)
    notes = models.TextField(blank=True)


class Incident(TimeStampedUUIDModel):
    class Type(models.TextChoices):
        ACCIDENT = "accident", "Accident"
        BREAKDOWN = "breakdown", "Breakdown"
        TRAFFIC = "traffic", "Traffic"
        WEATHER = "weather", "Weather"
        BEHAVIOR = "behavior", "Student behavior"
        MEDICAL = "medical", "Medical"
        OTHER = "other", "Other"

    class Severity(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"
        CRITICAL = "critical", "Critical"

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        ACKNOWLEDGED = "acknowledged", "Acknowledged"
        RESOLVED = "resolved", "Resolved"

    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name="incidents")
    type = models.CharField(max_length=20, choices=Type.choices)
    severity = models.CharField(max_length=16, choices=Severity.choices, default=Severity.MEDIUM)
    description = models.TextField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="incidents_created"
    )
    acknowledged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="incidents_acked"
    )
    resolution_notes = models.TextField(blank=True)


class OperationalAlert(TenantModel):
    class Severity(models.TextChoices):
        INFO = "info", "Info"
        WARNING = "warning", "Warning"
        CRITICAL = "critical", "Critical"

    trip = models.ForeignKey(Trip, null=True, blank=True, on_delete=models.CASCADE, related_name="alerts")
    alert_type = models.CharField(max_length=40)
    title = models.CharField(max_length=200)
    message = models.TextField()
    severity = models.CharField(max_length=16, choices=Severity.choices, default=Severity.WARNING)
    probability = models.FloatField(null=True, blank=True)
    is_acknowledged = models.BooleanField(default=False)
    acknowledged_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="alerts_acked"
    )
    acknowledged_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
