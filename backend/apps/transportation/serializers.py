from rest_framework import serializers

from apps.accounts.models import GuardianStudentLink
from apps.transportation.models import BusStop, DriverProfile, Student, StudentStopAssignment, Vehicle


class VehicleSerializer(serializers.ModelSerializer):
    depot_name = serializers.CharField(source="depot.name", read_only=True, default=None)

    class Meta:
        model = Vehicle
        fields = (
            "id",
            "district",
            "internal_number",
            "license_plate",
            "capacity",
            "wheelchair_capacity",
            "vehicle_type",
            "status",
            "depot",
            "depot_name",
            "is_active",
        )
        read_only_fields = ("id", "district")


class DriverProfileSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(source="user.email", read_only=True)
    first_name = serializers.CharField(source="user.first_name", read_only=True)
    last_name = serializers.CharField(source="user.last_name", read_only=True)

    class Meta:
        model = DriverProfile
        fields = (
            "id",
            "district",
            "user",
            "email",
            "first_name",
            "last_name",
            "employee_id",
            "license_expiration",
            "endorsements",
            "availability",
            "is_active",
        )
        read_only_fields = ("id", "district")


class StudentSerializer(serializers.ModelSerializer):
    school_name = serializers.CharField(source="school.name", read_only=True)
    rider_code = serializers.SerializerMethodField()

    class Meta:
        model = Student
        fields = (
            "id",
            "district",
            "external_id",
            "first_name",
            "last_name",
            "grade",
            "school",
            "school_name",
            "home_address",
            "latitude",
            "longitude",
            "eligibility",
            "accessibility_notes",
            "requires_wheelchair",
            "max_ride_time_override_minutes",
            "is_active",
            "rider_code",
        )
        read_only_fields = ("id", "district", "rider_code")

    def get_rider_code(self, obj):
        from apps.operations.services.rider_routes import rider_claim_code

        return rider_claim_code(obj)


class GuardianChildSerializer(serializers.ModelSerializer):
    """Privacy-minimized student payload for guardians."""

    school_name = serializers.CharField(source="school.name", read_only=True)

    class Meta:
        model = Student
        fields = ("id", "first_name", "last_name", "grade", "school", "school_name", "requires_wheelchair")


class BusStopSerializer(serializers.ModelSerializer):
    transfer_hub_name = serializers.CharField(source="transfer_hub.name", read_only=True, default=None)

    class Meta:
        model = BusStop
        fields = (
            "id",
            "district",
            "name",
            "stop_code",
            "address",
            "latitude",
            "longitude",
            "is_approved",
            "accessibility",
            "safety_notes",
            "safety_flags",
            "transfer_hub",
            "transfer_hub_name",
        )
        read_only_fields = ("id", "district", "safety_flags")


class StudentStopAssignmentSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    stop_name = serializers.CharField(source="bus_stop.name", read_only=True)

    class Meta:
        model = StudentStopAssignment
        fields = (
            "id",
            "student",
            "student_name",
            "bus_stop",
            "stop_name",
            "direction",
            "walking_distance_m",
            "is_active",
        )


class GuardianStudentLinkSerializer(serializers.ModelSerializer):
    student_name = serializers.CharField(source="student.full_name", read_only=True)
    guardian_email = serializers.EmailField(source="guardian.email", read_only=True)

    class Meta:
        model = GuardianStudentLink
        fields = (
            "id",
            "guardian",
            "guardian_email",
            "student",
            "student_name",
            "relationship",
            "is_verified",
            "notification_preferences",
        )
