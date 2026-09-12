"""Server-driven live route simulation for the demo.

A single "Start live demo" click animates a set of trips along their real
street geometry. Each tick persists a GPS position and broadcasts it over the
Channels layer so every connected client (parent, planner, dispatcher, admin)
updates simultaneously — no per-client driver loop required.

The loop runs in a daemon thread *inside the ASGI (daphne) process*, which is the
same process that serves the websocket consumers. That keeps it working with the
in-memory channel layer as well as Redis, and makes it immune to browser
background-tab timer throttling (which would break a client-driven loop).
"""

from __future__ import annotations

import logging
import threading
import time

from django.db import connection
from django.utils import timezone

logger = logging.getLogger(__name__)

# Seconds of wall-clock time to traverse the full route in the demo.
DURATION_SECONDS = 110.0
# How often we push a position update.
TICK_SECONDS = 1.5
# When the "hero" trip crosses this progress point, inject a one-time delay so
# the "one disruption, everyone informed" story fires live.
DISRUPTION_AT = 0.42
DISRUPTION_SECONDS = 360

_controllers: dict[str, "DemoController"] = {}
_lock = threading.Lock()


class DemoController:
    def __init__(self, district_id: str, trip_ids: list[str], hero_id: str | None):
        self.district_id = str(district_id)
        self.trip_ids = [str(t) for t in trip_ids]
        self.hero_id = str(hero_id) if hero_id else (self.trip_ids[0] if self.trip_ids else None)
        self.running = False
        self.started_at = 0.0
        self.progress = 0.0
        self._thread: threading.Thread | None = None
        self._disrupted = False

    # ---- public API -----------------------------------------------------
    def start(self):
        if self.running:
            return
        self.running = True
        self.started_at = time.monotonic()
        self.progress = 0.0
        self._disrupted = False
        self._thread = threading.Thread(target=self._run, name=f"demo-{self.district_id}", daemon=True)
        self._thread.start()

    def stop(self):
        self.running = False

    def status(self) -> dict:
        return {
            "running": self.running,
            "progress": round(self.progress, 3),
            "trip_ids": self.trip_ids,
            "hero_id": self.hero_id,
        }

    # ---- internals ------------------------------------------------------
    def _run(self):
        from apps.operations.models import GPSPosition, Trip
        from apps.operations.services.lifecycle import broadcast_event, refresh_trip_eta
        from apps.routing.services.street_router import (
            interpolate_along,
            passed_stop_sequence,
            route_geometry,
        )

        try:
            geos: dict[str, dict] = {}
            stops_by_trip: dict[str, list] = {}
            for tid in list(self.trip_ids):
                try:
                    trip = Trip.objects.select_related("route").get(id=tid)
                except Trip.DoesNotExist:
                    continue
                geo = route_geometry(trip.route, fetch=True)
                if len((geo.get("coordinates") or [])) < 2:
                    continue
                geos[tid] = geo
                stops_by_trip[tid] = list(
                    trip.route.stops.order_by("sequence").values("sequence", "name", "kind")
                )
                # Reset trip to a clean starting state for the run.
                trip.status = Trip.Status.ACTIVE
                trip.actual_start = timezone.now()
                trip.actual_completion = None
                trip.current_stop_sequence = 0
                trip.current_delay_seconds = 0
                trip.is_simulated = True
                trip.save(
                    update_fields=[
                        "status",
                        "actual_start",
                        "actual_completion",
                        "current_stop_sequence",
                        "current_delay_seconds",
                        "is_simulated",
                    ]
                )
                broadcast_event(trip, "trip.status.updated", {"status": trip.status, "live_demo": True})

            self.trip_ids = list(geos.keys())
            if not self.trip_ids:
                self.running = False
                return
            if self.hero_id not in self.trip_ids:
                self.hero_id = self.trip_ids[0]

            while self.running:
                elapsed = time.monotonic() - self.started_at
                t = min(1.0, elapsed / DURATION_SECONDS)
                self.progress = t
                now = timezone.now()

                for tid in self.trip_ids:
                    geo = geos[tid]
                    coords = geo["coordinates"]
                    lat, lng, heading, along = interpolate_along(coords, t)
                    try:
                        trip = Trip.objects.select_related("route", "vehicle").get(id=tid)
                    except Trip.DoesNotExist:
                        continue

                    GPSPosition.objects.create(
                        trip=trip,
                        timestamp=now,
                        latitude=lat,
                        longitude=lng,
                        heading=heading,
                        speed_kmh=0 if t >= 1.0 else 34,
                        accuracy_m=6,
                        is_simulated=True,
                    )

                    prev_seq = trip.current_stop_sequence or 0
                    new_seq = passed_stop_sequence(trip.route, along, coords)
                    arrived_stop = None
                    if new_seq > prev_seq:
                        trip.current_stop_sequence = new_seq
                        arrived_stop = next(
                            (s for s in stops_by_trip.get(tid, []) if s["sequence"] == new_seq),
                            None,
                        )

                    # Scripted disruption on the hero trip → live delay + alert.
                    inject = 0
                    if (
                        tid == self.hero_id
                        and not self._disrupted
                        and t >= DISRUPTION_AT
                        and t < 1.0
                    ):
                        inject = DISRUPTION_SECONDS
                        self._disrupted = True

                    # Recompute ETA/risk on stop arrival, on the disruption, and
                    # periodically — refresh_trip_eta runs the ML model so we keep
                    # it off the every-tick hot path.
                    if arrived_stop is not None or inject or int(elapsed) % 6 == 0:
                        refresh_trip_eta(trip, extra_delay_s=inject)
                    else:
                        trip.save(update_fields=["current_stop_sequence"])

                    seq = int(trip.current_stop_sequence or 0)
                    trip_stops = stops_by_trip.get(tid, [])
                    upcoming = next(
                        (s for s in trip_stops if s["sequence"] > seq and s["kind"] != "depot"),
                        None,
                    )
                    if upcoming is None:
                        upcoming = next((s for s in trip_stops if s["kind"] == "school"), None)
                    broadcast_event(
                        trip,
                        "trip.position.updated",
                        {
                            "latitude": float(lat),
                            "longitude": float(lng),
                            "heading": float(heading),
                            "progress": round(t, 4),
                            "current_stop_sequence": seq,
                            "stop_count": len(trip_stops),
                            "delay_seconds": trip.current_delay_seconds,
                            "late_probability": trip.late_probability,
                            "p50_eta": trip.current_p50_eta.isoformat() if trip.current_p50_eta else None,
                            "is_simulated": True,
                            "route_code": trip.route.route_code if trip.route_id else "",
                            "next_stop_name": upcoming["name"] if upcoming else None,
                            "live_demo": True,
                        },
                    )

                    if arrived_stop is not None:
                        broadcast_event(
                            trip,
                            "trip.stop.arrived",
                            {
                                "sequence": arrived_stop["sequence"],
                                "stop_name": arrived_stop["name"],
                                "kind": arrived_stop["kind"],
                                "stop_count": len(stops_by_trip.get(tid, [])),
                            },
                        )

                if t >= 1.0:
                    for tid in self.trip_ids:
                        try:
                            trip = Trip.objects.select_related("route").get(id=tid)
                        except Trip.DoesNotExist:
                            continue
                        trip.status = Trip.Status.COMPLETED
                        trip.actual_completion = timezone.now()
                        trip.save(update_fields=["status", "actual_completion"])
                        broadcast_event(
                            trip, "trip.status.updated", {"status": trip.status, "live_demo": True}
                        )
                    self.running = False
                    break

                time.sleep(TICK_SECONDS)
        except Exception:  # pragma: no cover - defensive; demo must not crash server
            logger.exception("Live demo controller crashed for district %s", self.district_id)
            self.running = False
        finally:
            connection.close()


def _select_trips(district, hero_route_ids: list | None = None) -> tuple[list[str], str | None]:
    """Pick today's trips with a usable path; always include guardian/hero routes."""
    from apps.operations.models import Trip

    today = timezone.localdate()
    qs = (
        Trip.objects.filter(district=district, service_date=today)
        .select_related("route")
        .order_by("route__route_code")
    )
    heroes = {str(r) for r in (hero_route_ids or [])}
    with_path = []
    for trip in qs:
        if not trip.route_id or trip.route.stops.count() < 2:
            continue
        with_path.append(trip)
    hero = [t for t in with_path if str(t.route_id) in heroes]
    rest = [t for t in with_path if str(t.route_id) not in heroes]
    # Never drop a parent's bus just because the fleet cap is small.
    cap = max(12, len(hero))
    trips = (hero + rest)[:cap]
    hero_first = str(hero[0].id) if hero else (str(trips[0].id) if trips else None)
    return [str(t.id) for t in trips], hero_first


def start_demo(district, hero_route_ids: list | None = None) -> dict:
    from apps.operations.services.rider_routes import (
        attach_linked_riders,
        ensure_demo_geometry,
        ensure_today_trips,
        hero_route_ids_for_district,
    )
    from common.exceptions.errors import RouteWiseError

    # Real districts often have a generated plan and linked parents but no
    # published trips / RouteStopStudent rows yet. Build those first so the
    # parent phone lights up the moment staff clicks Start.
    ensure_demo_geometry(district)
    ensure_today_trips(district)
    attach_linked_riders(district)
    heroes = list(hero_route_ids or []) or hero_route_ids_for_district(district)
    trip_ids, hero_id = _select_trips(district, heroes)
    if hero_id:
        from django.conf import settings
        from apps.operations.models import Trip
        from apps.transportation.models import DriverProfile

        demo_driver = DriverProfile.objects.filter(
            user__email=settings.DEMO_DRIVER_EMAIL, district=district
        ).first()
        if demo_driver:
            Trip.objects.filter(id=hero_id).update(driver=demo_driver)
    if not trip_ids:
        raise RouteWiseError(
            "No routes are ready to simulate. Import a roster, generate or publish a route plan, "
            "link parents to riders, then try again.",
            code="NO_TRIPS",
            status_code=400,
        )
    with _lock:
        existing = _controllers.get(str(district.id))
        if existing and existing.running:
            existing.stop()
        controller = DemoController(str(district.id), trip_ids, hero_id)
        _controllers[str(district.id)] = controller
        controller.start()
        return controller.status()


def stop_demo(district) -> dict:
    with _lock:
        controller = _controllers.get(str(district.id))
        if controller:
            controller.stop()
            return controller.status()
    return {"running": False, "progress": 0.0, "trip_ids": [], "hero_id": None}


def demo_status(district) -> dict:
    with _lock:
        controller = _controllers.get(str(district.id))
        if controller:
            return controller.status()
    return {"running": False, "progress": 0.0, "trip_ids": [], "hero_id": None}


def running_trip_ids(district_id) -> list[str]:
    """Trip ids currently being animated by a running demo in this district.

    Lets a driver who has no assigned run follow along with the live demo.
    """
    if not district_id:
        return []
    with _lock:
        controller = _controllers.get(str(district_id))
        if controller and controller.running:
            return list(controller.trip_ids)
    return []
