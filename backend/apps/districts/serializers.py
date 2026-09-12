from rest_framework import serializers

from apps.districts.models import Depot, District, DistrictPolicy, School


class DistrictSerializer(serializers.ModelSerializer):
    class Meta:
        model = District
        fields = (
            "id",
            "name",
            "slug",
            "state",
            "timezone",
            "contact_email",
            "contact_phone",
            "join_code",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "join_code", "created_at", "updated_at")


class DistrictPolicySerializer(serializers.ModelSerializer):
    class Meta:
        model = DistrictPolicy
        fields = (
            "id",
            "district",
            "max_walking_distance_m",
            "max_student_ride_minutes",
            "min_arrival_buffer_minutes",
            "default_boarding_seconds",
            "wheelchair_boarding_seconds",
            "allowable_early_minutes",
            "allowable_late_minutes",
            "reliability_target",
            "extra_constraints",
        )


class SchoolSerializer(serializers.ModelSerializer):
    student_count = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = School
        fields = (
            "id",
            "district",
            "name",
            "school_code",
            "school_type",
            "address",
            "latitude",
            "longitude",
            "morning_bell_time",
            "dismissal_time",
            "is_active",
            "student_count",
        )
        read_only_fields = ("id", "district", "student_count")


class DepotSerializer(serializers.ModelSerializer):
    class Meta:
        model = Depot
        fields = (
            "id",
            "district",
            "name",
            "address",
            "latitude",
            "longitude",
            "opens_at",
            "closes_at",
            "is_active",
            "is_transfer_hub",
        )
        read_only_fields = ("id", "district")
