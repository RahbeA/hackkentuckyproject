from django.contrib import admin

from apps.transportation.models import BusStop, DriverProfile, Student, StudentStopAssignment, Vehicle


@admin.register(BusStop)
class BusStopAdmin(admin.ModelAdmin):
    list_display = ("name", "stop_code", "district", "is_approved", "transfer_hub")
    list_filter = ("is_approved", "transfer_hub")
    search_fields = ("name", "stop_code", "address")
    autocomplete_fields = ("transfer_hub",)


@admin.register(Vehicle)
class VehicleAdmin(admin.ModelAdmin):
    list_display = ("internal_number", "district", "vehicle_type", "status", "capacity", "wheelchair_capacity")
    list_filter = ("status", "vehicle_type")
    search_fields = ("internal_number", "license_plate")


@admin.register(DriverProfile)
class DriverProfileAdmin(admin.ModelAdmin):
    list_display = ("employee_id", "user", "district", "is_active")
    search_fields = ("employee_id", "user__email")


@admin.register(Student)
class StudentAdmin(admin.ModelAdmin):
    list_display = ("full_name", "external_id", "school", "grade", "requires_wheelchair", "is_active")
    list_filter = ("school", "requires_wheelchair", "eligibility")
    search_fields = ("first_name", "last_name", "external_id")


@admin.register(StudentStopAssignment)
class StudentStopAssignmentAdmin(admin.ModelAdmin):
    list_display = ("student", "bus_stop", "direction", "is_active")
    list_filter = ("direction", "is_active")
    search_fields = ("student__first_name", "student__last_name", "bus_stop__name")
