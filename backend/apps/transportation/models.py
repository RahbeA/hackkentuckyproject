from django.conf import settings
from django.db import models

from common.utilities.models import TenantModel, TimeStampedUUIDModel


class Vehicle(TenantModel):
    class VehicleType(models.TextChoices):
        STANDARD = "standard", "Standard"
        ACCESSIBLE = "accessible", "Accessible"
        ACTIVITY = "activity", "Activity"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        SPARE = "spare", "Spare"
        MAINTENANCE = "maintenance", "Maintenance"
        RETIRED = "retired", "Retired"

    internal_number = models.CharField(max_length=40)
    license_plate = models.CharField(max_length=20)
    capacity = models.PositiveIntegerField()
    wheelchair_capacity = models.PositiveIntegerField(default=0)
    vehicle_type = models.CharField(max_length=20, choices=VehicleType.choices, default=VehicleType.STANDARD)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    depot = models.ForeignKey("districts.Depot", null=True, blank=True, on_delete=models.SET_NULL, related_name="vehicles")
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ("district", "internal_number")
        ordering = ["internal_number"]


class DriverProfile(TenantModel):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="driver_profile")
    employee_id = models.CharField(max_length=40)
    license_expiration = models.DateField(null=True, blank=True)
    endorsements = models.JSONField(default=list, blank=True)
    availability = models.CharField(max_length=40, default="weekday_am")
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ("district", "employee_id")


class Student(TenantModel):
    class Eligibility(models.TextChoices):
        ELIGIBLE = "eligible", "Eligible"
        INELIGIBLE = "ineligible", "Ineligible"
        CONDITIONAL = "conditional", "Conditional"

    external_id = models.CharField(max_length=40)
    first_name = models.CharField(max_length=120)
    last_name = models.CharField(max_length=120)
    grade = models.CharField(max_length=8)
    school = models.ForeignKey("districts.School", on_delete=models.CASCADE, related_name="students")
    home_address = models.CharField(max_length=300)
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    eligibility = models.CharField(max_length=20, choices=Eligibility.choices, default=Eligibility.ELIGIBLE)
    accessibility_notes = models.TextField(blank=True)
    requires_wheelchair = models.BooleanField(default=False)
    max_ride_time_override_minutes = models.PositiveIntegerField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ("district", "external_id")
        ordering = ["last_name", "first_name"]

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}"


class BusStop(TenantModel):
    name = models.CharField(max_length=200)
    stop_code = models.CharField(max_length=40)
    address = models.CharField(max_length=300)
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    is_approved = models.BooleanField(default=True)
    accessibility = models.CharField(max_length=80, blank=True)
    safety_notes = models.TextField(blank=True)
    safety_flags = models.JSONField(
        default=dict,
        blank=True,
        help_text="Auto-computed from Louisville Metro/LOJIC open data (apps.geodata): high-injury-corridor "
        "proximity and whether a marked crossing or signal is nearby. Recomputed on every save.",
    )
    transfer_hub = models.ForeignKey(
        "districts.Depot",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="feeder_stops",
        help_text="If set, students at this stop ride a feeder route to this hub and transfer to a "
        "second bus for the rest of the trip, instead of riding straight to school.",
    )

    class Meta:
        unique_together = ("district", "stop_code")
        ordering = ["name"]

    def save(self, *args, **kwargs):
        from apps.geodata.services import stop_safety_flags

        self.safety_flags = stop_safety_flags(float(self.latitude), float(self.longitude))
        super().save(*args, **kwargs)


class StudentStopAssignment(TimeStampedUUIDModel):
    class Direction(models.TextChoices):
        AM = "am", "Morning"
        PM = "pm", "Afternoon"
        BOTH = "both", "Both"

    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="stop_assignments")
    bus_stop = models.ForeignKey(BusStop, on_delete=models.CASCADE, related_name="student_assignments")
    direction = models.CharField(max_length=8, choices=Direction.choices, default=Direction.AM)
    walking_distance_m = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ("student", "bus_stop", "direction")
