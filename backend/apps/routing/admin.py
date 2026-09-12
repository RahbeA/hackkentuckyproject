from django.contrib import admin

from apps.routing.models import Route, RoutePlan, RouteTransfer

admin.site.register(RoutePlan)
admin.site.register(Route)


@admin.register(RouteTransfer)
class RouteTransferAdmin(admin.ModelAdmin):
    list_display = ("depot", "feeder_route", "trunk_route", "planned_arrival", "planned_departure", "student_count")
    list_filter = ("depot",)
    search_fields = ("feeder_route__route_code", "trunk_route__route_code")
