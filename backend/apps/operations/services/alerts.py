from __future__ import annotations

from dataclasses import dataclass

from apps.operations.models import Incident, OperationalAlert, Trip
from apps.operations.services.lifecycle import broadcast_event, notify_guardians_for_trip
from common.exceptions.errors import RouteWiseError

# Accident/breakdown also log an Incident (a real operational event);
# running-late is communication-only — being behind schedule isn't itself
# an incident, and the automatic ML delay alert already covers that case.
# Accident/breakdown bypass guardian preference muting (safety-critical).
GUARDIAN_ALERT_TYPES = {
    "accident": {
        "incident_type": Incident.Type.ACCIDENT,
        "default_severity": "critical",
        "title": "Accident reported",
        "bypass_preferences": True,
    },
    "breakdown": {
        "incident_type": Incident.Type.BREAKDOWN,
        "default_severity": "critical",
        "title": "Bus breakdown",
        "bypass_preferences": True,
    },
    "running_late": {
        "incident_type": None,
        "default_severity": "warning",
        "title": "Running significantly late",
        "bypass_preferences": False,
    },
    "other": {
        "incident_type": Incident.Type.OTHER,
        "default_severity": "warning",
        "title": "Bus update",
        "bypass_preferences": False,
    },
}


@dataclass
class GuardianTripAlertResult:
    alert: OperationalAlert
    incident: Incident | None
    guardians_notified: int


def send_guardian_trip_alert(
    trip: Trip,
    *,
    alert_type: str,
    message: str = "",
    severity: str | None = None,
    created_by=None,
) -> GuardianTripAlertResult:
    spec = GUARDIAN_ALERT_TYPES.get(alert_type)
    if not spec:
        raise RouteWiseError(
            f"alert_type must be one of: {', '.join(GUARDIAN_ALERT_TYPES)}.",
            code="INVALID_REQUEST",
        )
    resolved_severity = severity or spec["default_severity"]
    if resolved_severity not in {"warning", "critical"}:
        raise RouteWiseError("severity must be 'warning' or 'critical'.", code="INVALID_REQUEST")

    title = f"{spec['title']} — {trip.route.route_code}"
    body = (message or "").strip() or (
        f"There is an update on your child's bus ({trip.route.route_code}). "
        "Please check the app for details."
    )

    incident = None
    if spec["incident_type"] is not None:
        incident = Incident.objects.create(
            trip=trip,
            type=spec["incident_type"],
            severity=Incident.Severity.CRITICAL if resolved_severity == "critical" else Incident.Severity.HIGH,
            description=body,
            created_by=created_by,
        )

    alert = OperationalAlert.objects.create(
        district=trip.district,
        trip=trip,
        alert_type=f"manual_{alert_type}",
        title=title,
        message=body,
        severity=(
            OperationalAlert.Severity.CRITICAL if resolved_severity == "critical" else OperationalAlert.Severity.WARNING
        ),
    )

    guardians_notified = notify_guardians_for_trip(
        trip,
        title=title,
        body=body,
        event_type="alert.guardian",
        payload={"alert_id": str(alert.id), "trip_id": str(trip.id), "alert_type": alert_type},
        bypass_preferences=spec["bypass_preferences"],
    )

    from apps.notifications.services import notify_roles

    notify_roles(
        trip.district,
        ["dispatcher", "planner", "district_admin"],
        title,
        body,
        "alert.created",
        {"alert_id": str(alert.id), "trip_id": str(trip.id)},
    )
    broadcast_event(trip, "alert.created", {"alert_id": str(alert.id), "title": title})

    return GuardianTripAlertResult(alert=alert, incident=incident, guardians_notified=guardians_notified)
