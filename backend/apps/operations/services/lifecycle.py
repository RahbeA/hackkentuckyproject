from __future__ import annotations

from datetime import datetime, timedelta

from django.db import models
from django.utils import timezone

from apps.operations.models import GPSPosition, OperationalAlert, Trip
from apps.routing.models import RoutePlan


def materialize_trips_for_plan(plan: RoutePlan, service_date=None) -> list[Trip]:
    service_date = service_date or timezone.localdate()
    created = []
    for route in plan.routes.select_related("assigned_driver", "assigned_vehicle"):
        trip, was = Trip.objects.get_or_create(
            district=plan.district,
            route=route,
            service_date=service_date,
            defaults={
                "driver": route.assigned_driver,
                "vehicle": route.assigned_vehicle,
                "status": Trip.Status.SCHEDULED,
            },
        )
        created.append(trip)
    return created


def _combine(service_date, t):
    if t is None:
        return None
    return timezone.make_aware(datetime.combine(service_date, t))


def _live_leg_features(trip: Trip, stops: list, wc_by_stop: dict, now) -> list[dict]:
    """Build model features for each remaining leg from persisted route data.

    road_category/urban_density/traffic_severity/rain/weather_severity use the
    real Louisville geodata + weather layers when loaded (apps.geodata,
    apps.machine_learning.services.weather); each falls back to the original
    heuristic when a lookup finds nothing, so this is a no-op until
    `import_louisville_open_data` has been run.
    """
    from apps.geodata import services as geo_services
    from apps.machine_learning.services import weather as weather_service

    total = len(stops)
    rush = 0.45 if now.hour in {7, 8, 15, 16} else 0.2
    wx = weather_service.current_conditions(float(stops[0].latitude), float(stops[0].longitude)) if stops else {}
    feats = []
    for pos, stop in enumerate(stops):
        dist = float(stop.distance_from_previous_km or 0)
        planned = float(stop.expected_seconds_from_previous or 0) or max(30, dist / 28 * 3600)
        road = geo_services.road_context_for(float(stop.latitude), float(stop.longitude))
        signals = geo_services.signal_count_near(float(stop.latitude), float(stop.longitude))
        feats.append(
            {
                "distance_km": dist,
                "planned_duration_s": planned,
                "departure_hour": now.hour,
                "day_of_week": min(now.weekday(), 4),  # models trained Mon-Fri only
                "road_category": road["road_category"] if road else (1 if dist > 2.5 else 0),
                "traffic_severity": min(1.0, rush + 0.05 * signals),
                "rain": wx.get("rain", 0),
                "weather_severity": wx.get("weather_severity", 0.15),
                "passenger_load": stop.cumulative_load or 0,
                "students_boarding": stop.student_count or 0,
                "wheelchair_boardings": wc_by_stop.get(str(stop.id), 0),
                "remaining_stops": max(0, total - pos - 1),
                "urban_density": road["urban_density"] if road else 0.6,
                "historical_delay_s": trip.current_delay_seconds,
                "segment_position": stop.sequence / max(total, 1),
            }
        )
    return feats


def refresh_trip_eta(trip: Trip, extra_delay_s: int = 0) -> Trip:
    from apps.machine_learning.services.predict import predict_segments

    trip.current_delay_seconds = max(0, trip.current_delay_seconds + extra_delay_s)
    now = timezone.now()
    stops = list(trip.route.stops.order_by("sequence"))
    remaining = [s for s in stops if s.kind != "depot" and s.sequence > (trip.current_stop_sequence or 0)]
    if not remaining:
        remaining = [s for s in stops if s.kind == "school"] or stops[-1:]

    if not remaining:
        # Bare route with no persisted stops: heuristic on route totals.
        p50_total = max(1, trip.route.p50_duration_seconds or 600)
        p90_total = max(p50_total, trip.route.p90_duration_seconds or int(p50_total * 1.2))
        model_risk, model_active, version = 0.15, False, None
    else:
        wc_by_stop: dict = {}
        from apps.routing.models import RouteStopStudent

        wc_rows = (
            RouteStopStudent.objects.filter(route_stop__in=remaining, student__requires_wheelchair=True)
            .values("route_stop_id")
            .annotate(n=models.Count("id"))
        )
        wc_by_stop = {str(r["route_stop_id"]): r["n"] for r in wc_rows}

        preds = predict_segments(_live_leg_features(trip, remaining, wc_by_stop, now))
        p50_total = sum(p["p50_s"] for p in preds) if preds else max(1, (trip.route.p50_duration_seconds or 600))
        p90_total = sum(p["p90_s"] for p in preds) if preds else int(p50_total * 1.2)
        model_risk = max([p["delay_risk"] for p in preds], default=0.15)
        model_active = bool(preds) and not preds[0].get("fallback", True)
        version = preds[0].get("model_version") if model_active else None

    trip.current_p50_eta = now + timedelta(seconds=p50_total + trip.current_delay_seconds)
    trip.current_p90_eta = now + timedelta(seconds=p90_total + trip.current_delay_seconds)
    # Late probability: worst remaining leg per the classifier, never below the
    # delay-driven heuristic so large observed delays still alert on fallback.
    delay_component = min(0.99, trip.current_delay_seconds / max(8 * 60, 1) * 0.55 + 0.05)
    trip.late_probability = round(min(0.99, max(model_risk, delay_component)), 3)
    if model_active:
        trip.ml_explanation = (
            f"Live ETA from quantile travel models (v{version}): "
            f"{len(remaining)} stops left, worst-leg late risk {model_risk:.0%}. "
            "Trained on synthetic segments — not a production prediction."
        )
    elif trip.current_delay_seconds > 4 * 60:
        trip.ml_explanation = (
            "No trained models available — heuristic ETA. This bus is behind the "
            "planned P50 pace. Remaining stops and dwell time make a late school "
            "arrival more likely."
        )
    else:
        trip.ml_explanation = (
            "No trained models available — heuristic ETA. The bus is near its "
            "planned pace. Remaining risk is mainly boarding variation."
        )
    trip.save()
    maybe_raise_delay_alert(trip)
    return trip


def maybe_raise_delay_alert(trip: Trip) -> OperationalAlert | None:
    if trip.late_probability < 0.45 or trip.current_delay_seconds < 180:
        return None
    existing = trip.alerts.filter(alert_type="predicted_delay", is_acknowledged=False).first()
    if existing:
        existing.probability = trip.late_probability
        existing.message = (
            f"{trip.route.route_code} is {trip.current_delay_seconds // 60} min behind. "
            f"Late probability {trip.late_probability:.0%} (synthetic model)."
        )
        existing.save()
        broadcast_event(trip, "alert.created", {"alert_id": str(existing.id)})
        return existing
    alert = OperationalAlert.objects.create(
        district=trip.district,
        trip=trip,
        alert_type="predicted_delay",
        title=f"Predicted delay on {trip.route.route_code}",
        message=(
            f"Bus {trip.vehicle.internal_number if trip.vehicle else ''} is "
            f"{trip.current_delay_seconds // 60} minutes behind schedule. "
            f"P90 school ETA may miss the bell. Synthetic ML — not a production prediction."
        ),
        severity=OperationalAlert.Severity.WARNING if trip.late_probability < 0.7 else OperationalAlert.Severity.CRITICAL,
        probability=trip.late_probability,
    )
    from apps.notifications.services import notify_roles

    notify_roles(
        trip.district,
        ["dispatcher", "district_admin"],
        "Predicted delay",
        alert.message,
        "alert.created",
        {"alert_id": str(alert.id), "trip_id": str(trip.id)},
    )
    notify_guardians_for_trip(
        trip,
        title="Bus running behind",
        body="Your child's bus is running behind the scheduled pickup. This is a synthetic demo alert.",
        event_type="alert.created",
        payload={"trip_id": str(trip.id), "alert_id": str(alert.id)},
        preference_key="delay",
    )
    broadcast_event(trip, "alert.created", {"alert_id": str(alert.id), "title": alert.title})
    return alert


def notify_guardians_for_trip(
    trip: Trip,
    title: str,
    body: str,
    event_type: str,
    payload: dict | None = None,
    bypass_preferences: bool = False,
    preference_key: str = "emergency",
) -> int:
    """Notifies every verified guardian of a student on this trip's route.

    Gated on `link.notification_preferences[preference_key]` (default True)
    unless bypass_preferences — used for accident/breakdown alerts, which are
    safety-critical enough that a muted preference shouldn't silence them.
    Returns the number of guardians notified.
    """
    from apps.accounts.models import GuardianStudentLink
    from apps.notifications.models import Notification
    from apps.routing.models import RouteStopStudent

    student_ids = RouteStopStudent.objects.filter(route_stop__route=trip.route).values_list("student_id", flat=True)
    links = GuardianStudentLink.objects.filter(student_id__in=student_ids, is_verified=True).select_related("guardian")
    count = 0
    for link in links:
        prefs = link.notification_preferences or {}
        if not bypass_preferences and prefs.get(preference_key, True) is False:
            continue
        Notification.objects.create(
            district=trip.district,
            user=link.guardian,
            title=title,
            body=body,
            event_type=event_type,
            payload={**(payload or {}), "student_id": str(link.student_id)},
        )
        count += 1
    return count


def ingest_gps(trip: Trip, lat, lng, heading=0, speed=0, accuracy=8, is_simulated=False, timestamp=None) -> GPSPosition:
    pos = GPSPosition.objects.create(
        trip=trip,
        timestamp=timestamp or timezone.now(),
        latitude=lat,
        longitude=lng,
        heading=heading,
        speed_kmh=speed,
        accuracy_m=accuracy,
        is_simulated=is_simulated,
    )
    trip.is_simulated = trip.is_simulated or is_simulated
    # Crude delay: if simulated speed is low, add delay
    extra = 15 if is_simulated and speed < 8 else 8 if is_simulated else 0
    refresh_trip_eta(trip, extra_delay_s=extra)
    broadcast_event(
        trip,
        "trip.position.updated",
        {
            "latitude": float(lat),
            "longitude": float(lng),
            "is_simulated": is_simulated,
            "delay_seconds": trip.current_delay_seconds,
            "late_probability": trip.late_probability,
            "p50_eta": trip.current_p50_eta.isoformat() if trip.current_p50_eta else None,
            "p90_eta": trip.current_p90_eta.isoformat() if trip.current_p90_eta else None,
        },
    )
    broadcast_event(trip, "trip.eta.updated", {"late_probability": trip.late_probability})
    return pos


def broadcast_event(trip: Trip, event: str, payload: dict):
    try:
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer

        layer = get_channel_layer()
        if layer is None:
            return
        body = {"event": event, "trip_id": str(trip.id), "payload": payload}
        async_to_sync(layer.group_send)(f"trip_{trip.id}", {"type": "ops.message", "body": body})
        async_to_sync(layer.group_send)(
            f"district_{trip.district_id}", {"type": "ops.message", "body": body}
        )
    except Exception:
        # Polling fallback remains available
        pass


def interpolate(a: tuple[float, float], b: tuple[float, float], t: float) -> tuple[float, float]:
    t = min(1.0, max(0.0, t))
    return a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
