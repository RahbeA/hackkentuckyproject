from django.contrib import admin

from apps.districts.models import Depot, District, DistrictPolicy, School

admin.site.register(District)
admin.site.register(DistrictPolicy)


@admin.register(School)
class SchoolAdmin(admin.ModelAdmin):
    list_display = ("name", "school_code", "school_type", "district", "is_active")
    list_filter = ("school_type", "is_active")
    search_fields = ("name", "school_code")


@admin.register(Depot)
class DepotAdmin(admin.ModelAdmin):
    list_display = ("name", "district", "is_transfer_hub", "is_active")
    list_filter = ("is_transfer_hub", "is_active")
    search_fields = ("name", "address")
