"""Capacitated VRP with time windows for morning school bus routes.

Supports an optional hub-and-spoke tier: a BusStop can be flagged with
`transfer_hub` (a Depot with `is_transfer_hub=True`). Students at such stops
are solved as their own smaller "feeder" VRP first (yard -> feeder stops ->
hub), and the feeder's predicted hub-arrival time becomes a hard lower bound
on the hub stop in the main "trunk" VRP that continues to school — so the
trunk vehicle can never be scheduled to leave before the transfer is
physically possible. See generate_plan() and RouteTransfer.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, time
from typing import Any

from django.db import transaction
from django.utils import timezone
from ortools.constraint_solver import pywrapcp, routing_enums_pb2

from apps.districts.models import Depot, DistrictPolicy, School
from apps.routing.models import Route, RoutePlan, RouteStop, RouteStopStudent, RouteTransfer
from apps.routing.services.matrix import street_matrix
from apps.transportation.models import BusStop, DriverProfile, Student, StudentStopAssignment, Vehicle
from common.exceptions.errors import InfeasibleRouteError
from common.utilities.geo import haversine_km

SECONDS_PER_DAY = 24 * 3600


def _t2s(t) -> int:
    if t is None:
        return 0
    if isinstance(t, str):
        parts = t.split(":")
        h, m = int(parts[0]), int(parts[1]) if len(parts) > 1 else 0
        s = int(parts[2]) if len(parts) > 2 else 0
        return h * 3600 + m * 60 + s
    return t.hour * 3600 + t.minute * 60 + t.second


def _s2t(seconds: int) -> time:
    seconds = int(seconds) % SECONDS_PER_DAY
    return time(seconds // 3600, (seconds % 3600) // 60, seconds % 60)


def _policy(district) -> DistrictPolicy:
    policy, _ = DistrictPolicy.objects.get_or_create(district=district)
    return policy


def _hub_code(hub) -> str:
    code = "".join(ch for ch in hub.name.upper() if ch.isalnum())[:4]
    return code or "HUB"


def diagnose_infeasibility(school: School, students, stops_by_id, vehicles, drivers, policy) -> list[str]:
    reasons = []
    if not students:
        reasons.append("No eligible students were found for this school.")
    missing_coords = [s.external_id for s in students if s.latitude is None or s.longitude is None]
    if missing_coords:
        reasons.append("Missing coordinates for one or more students.")
    if school.latitude is None:
        reasons.append("The school is missing coordinates.")
    unassigned = []
    unapproved = []
    for student in students:
        asg = next((a for a in student.stop_assignments.all() if a.is_active and a.direction in ("am", "both")), None)
        if asg is None:
            unassigned.append(student.external_id)
        elif not asg.bus_stop.is_approved:
            unapproved.append(student.external_id)
    if unassigned:
        reasons.append("No approved stop assignment for one or more eligible students.")
    if unapproved:
        reasons.append("Some assigned stops are not approved.")
    seats = sum(v.capacity for v in vehicles)
    wc_seats = sum(v.wheelchair_capacity for v in vehicles)
    wc_students = sum(1 for s in students if s.requires_wheelchair)
    if seats < len(students):
        reasons.append("Insufficient capacity")
    if wc_seats < wc_students:
        reasons.append("Insufficient wheelchair capacity")
    if not drivers:
        reasons.append("No available driver")
    if not vehicles:
        reasons.append("No available vehicles.")
    # Ride-time vs distance
    if students and school.latitude is not None:
        max_km = 0
        for s in students:
            max_km = max(max_km, haversine_km(s.latitude, s.longitude, school.latitude, school.longitude))
        est_min = (max_km * 1.38 / 28) * 60
        if max_km > 40:
            reasons.append(
                f"Students live about {int(max_km)} km from this school. "
                "Pick the school that matches the roster, or drop a schools.csv "
                "with the same school_id as the students, then generate again."
            )
        elif est_min > policy.max_student_ride_minutes + 5:
            reasons.append(
                f"Maximum ride time is {policy.max_student_ride_minutes} minutes, "
                f"but the farthest student needs about {int(est_min)} minutes. "
                "Raise Max ride minutes in Administration, then generate again."
            )
        # Tight bell window
        window = policy.allowable_early_minutes - policy.min_arrival_buffer_minutes
        if window < 5 and est_min > 20:
            reasons.append("Impossible school arrival window")
    return reasons


def generate_plan(plan: RoutePlan, vehicle_ids=None, driver_ids=None, weights=None) -> RoutePlan:
    district = plan.district
    policy = _policy(district)
    school = plan.school
    if school is None:
        raise InfeasibleRouteError(
            "Select a school before generating routes.",
            details={"reasons": ["A school is required for morning route generation."]},
        )
    depot = Depot.objects.filter(district=district, is_active=True).order_by("name").first()
    if depot is None:
        raise InfeasibleRouteError("No depot is configured.", details={"reasons": ["No depot is configured."]})

    students = list(
        Student.objects.filter(
            district=district,
            school=school,
            is_active=True,
            eligibility=Student.Eligibility.ELIGIBLE,
        ).prefetch_related("stop_assignments__bus_stop")
    )
    vehicles_qs = Vehicle.objects.filter(district=district, is_active=True, status__in=["active", "spare"])
    if vehicle_ids:
        vehicles_qs = vehicles_qs.filter(id__in=vehicle_ids)
    vehicles = list(vehicles_qs.order_by("-wheelchair_capacity", "-capacity"))
    drivers_qs = DriverProfile.objects.filter(district=district, is_active=True)
    if driver_ids:
        drivers_qs = drivers_qs.filter(id__in=driver_ids)
    drivers = list(drivers_qs)

    reasons = diagnose_infeasibility(school, students, None, vehicles, drivers, policy)
    # Keep hard failures
    hard = [
        r
        for r in reasons
        if r
        in {
            "Insufficient capacity",
            "Insufficient wheelchair capacity",
            "No available driver",
            "No approved stop assignment for one or more eligible students.",
            "Missing coordinates for one or more students.",
            "The school is missing coordinates.",
            "No eligible students were found for this school.",
            "No available vehicles.",
        }
        or r.startswith("No approved")
        or r.startswith("Missing")
        or r.startswith("Students live about")
        or r.startswith("Maximum ride time")
    ]
    if hard:
        plan.status = RoutePlan.Status.FAILED
        plan.infeasibility = {"reasons": reasons}
        plan.save()
        raise InfeasibleRouteError(details={"reasons": reasons})

    direct_assignments: list[tuple] = []
    hub_assignments: dict[str, list] = defaultdict(list)
    for student in students:
        asg = next((a for a in student.stop_assignments.all() if a.is_active and a.direction in ("am", "both")), None)
        if asg is None or not asg.bus_stop.is_approved:
            continue
        stop = asg.bus_stop
        if stop.transfer_hub_id:
            hub_assignments[str(stop.transfer_hub_id)].append((student, stop))
        else:
            direct_assignments.append((student, stop))

    if not direct_assignments and not hub_assignments:
        reasons = ["No approved stop assignment"]
        plan.status = RoutePlan.Status.FAILED
        plan.infeasibility = {"reasons": reasons}
        plan.save()
        raise InfeasibleRouteError(details={"reasons": reasons})

    with transaction.atomic():
        # Clear any previous generation's routes (feeder + trunk) up front,
        # before either tier writes anything new, so a mid-generation failure
        # can never leave orphaned feeder routes behind.
        plan.routes.all().delete()

        # Feeder tier: stops flagged with a transfer hub are solved as their
        # own smaller VRP first (yard -> feeder stops -> hub). Whatever
        # vehicles/drivers they consume come out of the shared pool before
        # the main/trunk tier below gets the rest.
        remaining_vehicles = list(vehicles)
        remaining_drivers = list(drivers)
        used_driver_ids: set = set()
        feeder_by_hub: dict[str, dict] = {}
        bell = _t2s(school.morning_bell_time)
        for hub_id, pairs in hub_assignments.items():
            hub = Depot.objects.filter(id=hub_id, district=district).first()
            if hub is None:
                continue
            hub_school_km = haversine_km(hub.latitude, hub.longitude, school.latitude, school.longitude)
            est_hub_to_school_s = (hub_school_km * 1.38 / 28) * 3600
            buffer_s = 5 * 60
            feeder_deadline = int(bell - policy.min_arrival_buffer_minutes * 60 - est_hub_to_school_s - buffer_s)
            try:
                result = _generate_feeder_routes(
                    plan=plan,
                    district=district,
                    yard=depot,
                    hub=hub,
                    hub_students=pairs,
                    policy=policy,
                    vehicles=remaining_vehicles,
                    drivers=remaining_drivers,
                    used_driver_ids=used_driver_ids,
                    mode=plan.optimization_mode,
                    deadline_seconds=feeder_deadline,
                    route_prefix=f"{school.school_code}-FEED-{_hub_code(hub)}",
                )
            except InfeasibleRouteError as exc:
                reasons = (exc.details or {}).get("reasons") or [f"Could not build a feeder route into {hub.name}."]
                plan.status = RoutePlan.Status.FAILED
                plan.infeasibility = {"reasons": reasons}
                plan.save()
                raise
            consumed_vehicle_ids = {r.assigned_vehicle_id for r in result["routes"]}
            remaining_vehicles = [v for v in remaining_vehicles if v.id not in consumed_vehicle_ids]
            feeder_by_hub[hub_id] = {**result, "hub": hub, "buffer_s": buffer_s}

        vehicles = remaining_vehicles
        drivers = [d for d in drivers if d.id not in used_driver_ids]

        groups: dict[str, dict[str, Any]] = {}
        for student, stop in direct_assignments:
            g = groups.setdefault(
                str(stop.id),
                {"stop": stop, "students": [], "demand": 0, "wc": 0, "is_transfer": False},
            )
            g["students"].append(student)
            g["demand"] += 1
            g["wc"] += 1 if student.requires_wheelchair else 0

        stop_list = list(groups.values())
        for hub_id, info in feeder_by_hub.items():
            stop_list.append(
                {
                    "stop": None,
                    "hub": info["hub"],
                    "students": info["students"],
                    "demand": info["demand"],
                    "wc": info["wc"],
                    "is_transfer": True,
                    "earliest_arrival": info["arrival_seconds"] + info["buffer_s"],
                    "feeder_route_ids": [r.id for r in info["routes"]],
                }
            )

        if not stop_list:
            reasons = ["No approved stop assignment"]
            plan.status = RoutePlan.Status.FAILED
            plan.infeasibility = {"reasons": reasons}
            plan.save()
            raise InfeasibleRouteError(details={"reasons": reasons})

        def _node_point(g):
            if g.get("is_transfer"):
                return (float(g["hub"].latitude), float(g["hub"].longitude))
            return (float(g["stop"].latitude), float(g["stop"].longitude))

        points = [
            (float(depot.latitude), float(depot.longitude)),
            *[_node_point(g) for g in stop_list],
            (float(school.latitude), float(school.longitude)),
        ]
        hour = max(0, bell // 3600 - 1)
        raw = street_matrix(district, points, departure_hour=hour)
        from apps.machine_learning.services.predict import overlay_ml_matrix

        # Per-node boarding demand so the ML overlay sees real segment features
        # instead of neutral placeholders. Load is the fleet-average proxy since
        # assignment happens in the solver below.
        total_demand = sum(g["demand"] for g in stop_list)
        avg_load = total_demand / max(1, min(len(vehicles), max(1, len(stop_list))))
        node_meta = [{"boarding": 0, "wheelchair": 0, "load": 0}]
        node_meta += [
            {"boarding": g["demand"], "wheelchair": g["wc"], "load": avg_load} for g in stop_list
        ]
        node_meta.append({"boarding": 0, "wheelchair": 0, "load": avg_load})
        matrix = overlay_ml_matrix(raw, points, hour=hour, mode=plan.optimization_mode, node_meta=node_meta)

        mode = plan.optimization_mode
        if mode == RoutePlan.Mode.FASTEST:
            time_m = matrix["p50_s"]
        elif mode == RoutePlan.Mode.RELIABILITY:
            time_m = matrix["p90_s"]
        else:
            time_m = [
                [int(0.55 * a + 0.45 * b) for a, b in zip(r1, r2)]
                for r1, r2 in zip(matrix["p50_s"], matrix["p90_s"])
            ]

        n_stops = len(stop_list)
        n_nodes = n_stops + 2
        depot_i, school_i = 0, n_nodes - 1
        num_vehicles = min(len(vehicles), max(1, n_stops))
        # Wheelchair students may need accessible buses first
        vehicles = vehicles[:num_vehicles]
        caps = [v.capacity for v in vehicles]
        wc_caps = [v.wheelchair_capacity for v in vehicles]

        demands = [0] + [g["demand"] for g in stop_list] + [0]
        wc_demands = [0] + [g["wc"] for g in stop_list] + [0]
        from apps.routing.services.dwell import estimate_boarding_params

        dwell = estimate_boarding_params(district)
        service = [0] + [
            dwell["boarding_seconds"] * g["demand"] + dwell["wheelchair_seconds"] * g["wc"]
            for g in stop_list
        ] + [60]

        latest_school = bell - policy.min_arrival_buffer_minutes * 60 + policy.allowable_late_minutes * 60
        earliest_school = bell - policy.allowable_early_minutes * 60
        max_ride = policy.max_student_ride_minutes * 60
        horizon = bell + 3600

        windows = [(0, horizon)]
        for i in range(n_stops):
            g = stop_list[i]
            # Must leave enough time to reach school
            travel_to_school = time_m[i + 1][school_i]
            latest = latest_school - travel_to_school - service[i + 1]
            earliest = max(0, earliest_school - max_ride)
            if g.get("is_transfer"):
                # Can't depart the hub before the feeder physically arrives.
                earliest = max(earliest, g["earliest_arrival"])
            if latest < earliest:
                latest = earliest + 300
            windows.append((int(earliest), int(max(latest, earliest + 60))))
        windows.append((int(earliest_school), int(max(latest_school, earliest_school + 60))))

        manager = pywrapcp.RoutingIndexManager(n_nodes, num_vehicles, [depot_i] * num_vehicles, [school_i] * num_vehicles)
        routing = pywrapcp.RoutingModel(manager)

        weights = weights or plan.objective_weights or {}
        time_w = float(weights.get("time", 8 if mode == RoutePlan.Mode.FASTEST else 5))
        dist_w = float(weights.get("distance", 3))
        veh_w = float(weights.get("vehicles", 20 if mode != RoutePlan.Mode.FASTEST else 6))
        ride_w = float(weights.get("ride_time", 4 if mode == RoutePlan.Mode.BALANCED else 2))
        risk_w = float(weights.get("reliability", 12 if mode == RoutePlan.Mode.RELIABILITY else 3))

        def time_cb(from_index, to_index):
            i, j = manager.IndexToNode(from_index), manager.IndexToNode(to_index)
            return int(time_m[i][j] + service[i])

        def dist_cb(from_index, to_index):
            i, j = manager.IndexToNode(from_index), manager.IndexToNode(to_index)
            return int(matrix["distance_km"][i][j] * 1000)

        time_idx = routing.RegisterTransitCallback(time_cb)
        dist_idx = routing.RegisterTransitCallback(dist_cb)
        routing.SetArcCostEvaluatorOfAllVehicles(time_idx)

        routing.AddDimension(time_idx, 30 * 60, horizon, False, "Time")
        time_dim = routing.GetDimensionOrDie("Time")
        for node, (lo, hi) in enumerate(windows):
            index = manager.NodeToIndex(node)
            if node == depot_i:
                for v in range(num_vehicles):
                    time_dim.CumulVar(routing.Start(v)).SetRange(lo, hi)
                continue
            if index < 0 or routing.IsEnd(index):
                continue
            time_dim.CumulVar(index).SetRange(lo, hi)
        for v in range(num_vehicles):
            time_dim.CumulVar(routing.End(v)).SetRange(windows[school_i][0], windows[school_i][1])
            routing.AddVariableMinimizedByFinalizer(time_dim.CumulVar(routing.Start(v)))
            routing.AddVariableMinimizedByFinalizer(time_dim.CumulVar(routing.End(v)))

        def demand_cb(from_index):
            return demands[manager.IndexToNode(from_index)]

        def wc_cb(from_index):
            return wc_demands[manager.IndexToNode(from_index)]

        routing.AddDimensionWithVehicleCapacity(routing.RegisterUnaryTransitCallback(demand_cb), 0, caps, True, "Cap")
        routing.AddDimensionWithVehicleCapacity(routing.RegisterUnaryTransitCallback(wc_cb), 0, wc_caps, True, "WC")

        # Discourage unused vehicles via a large start-end cost if they only go depot->school with no stops.
        for v in range(num_vehicles):
            routing.SetFixedCostOfVehicle(int(veh_w * 400), v)

        search = pywrapcp.DefaultRoutingSearchParameters()
        try:
            first = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
            meta = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
        except AttributeError:
            first = routing_enums_pb2.FirstSolutionStrategy.Value.PATH_CHEAPEST_ARC
            meta = routing_enums_pb2.LocalSearchMetaheuristic.Value.GUIDED_LOCAL_SEARCH
        search.first_solution_strategy = first
        search.local_search_metaheuristic = meta
        search.time_limit.FromSeconds(12)

        solution = routing.SolveWithParameters(search)
        if solution is None:
            extra = reasons or [
                "The solver could not satisfy capacity, wheelchair, and bell-time windows together."
            ]
            if any(wc_demands) and sum(1 for v in vehicles if v.wheelchair_capacity == 0) == len(vehicles):
                extra.append("Wheelchair capacity is insufficient.")
            plan.status = RoutePlan.Status.FAILED
            plan.infeasibility = {"reasons": extra}
            plan.solver_metadata = {"status": routing.status(), "mode": mode}
            plan.save()
            raise InfeasibleRouteError(details={"reasons": extra})

        plan, transfer_links = persist_solution(
            plan=plan,
            school=school,
            depot=depot,
            stop_list=stop_list,
            vehicles=vehicles,
            drivers=drivers,
            manager=manager,
            routing=routing,
            solution=solution,
            matrix=matrix,
            time_m=time_m,
            time_dim=time_dim,
            policy=policy,
            service=service,
            mode=mode,
            dwell=dwell,
        )

        for link in transfer_links:
            info = feeder_by_hub.get(link["hub_id"])
            if not info:
                continue
            for feeder_route in info["routes"]:
                RouteTransfer.objects.update_or_create(
                    feeder_route=feeder_route,
                    trunk_route=link["trunk_route"],
                    defaults={
                        "depot": info["hub"],
                        "planned_arrival": feeder_route.scheduled_school_arrival,
                        "planned_departure": link["arrival_time"],
                        "buffer_minutes": info["buffer_s"] // 60,
                        "student_count": info["demand"],
                        "wheelchair_count": info["wc"],
                    },
                )
        return plan


@transaction.atomic
def persist_solution(**kwargs) -> tuple[RoutePlan, list[dict]]:
    plan: RoutePlan = kwargs["plan"]
    school = kwargs["school"]
    depot = kwargs["depot"]
    stop_list = kwargs["stop_list"]
    vehicles = kwargs["vehicles"]
    drivers = kwargs["drivers"]
    manager = kwargs["manager"]
    routing = kwargs["routing"]
    solution = kwargs["solution"]
    matrix = kwargs["matrix"]
    time_m = kwargs["time_m"]
    time_dim = kwargs["time_dim"]
    policy = kwargs["policy"]
    service = kwargs["service"]
    mode = kwargs["mode"]
    dwell = kwargs.get("dwell") or {}
    risk_m = matrix.get("delay_risk") or []

    used_driver_ids = set()
    route_metrics = []
    route_n = 0
    n_stops = len(stop_list)
    school_i = n_stops + 1
    transfer_links: list[dict] = []

    for v in range(len(vehicles)):
        index = routing.Start(v)
        seq_nodes = []
        if routing.IsEnd(solution.Value(routing.NextVar(index))) and manager.IndexToNode(index) == 0:
            # unused vehicle: start immediately followed by end with no pickups
            nxt = solution.Value(routing.NextVar(index))
            if routing.IsEnd(nxt):
                continue
        while not routing.IsEnd(index):
            node = manager.IndexToNode(index)
            t = solution.Value(time_dim.CumulVar(index))
            seq_nodes.append((node, t))
            index = solution.Value(routing.NextVar(index))
        end_t = solution.Value(time_dim.CumulVar(index))
        seq_nodes.append((school_i, end_t))
        pickup_nodes = [n for n, _ in seq_nodes if 1 <= n <= n_stops]
        if not pickup_nodes:
            continue
        route_n += 1
        vehicle = vehicles[v]
        driver = None
        for d in drivers:
            if d.id not in used_driver_ids:
                # Prefer wheelchair endorsement if needed
                driver = d
                used_driver_ids.add(d.id)
                break
        students = []
        for n in pickup_nodes:
            students.extend(stop_list[n - 1]["students"])
        wc = sum(1 for s in students if s.requires_wheelchair)
        dist = 0.0
        p50 = 0
        p90 = 0
        route_risk = 0.0
        prev = 0
        for n, _ in seq_nodes[1:]:
            dist += matrix["distance_km"][prev][n]
            p50 += matrix["p50_s"][prev][n] + service[n]
            p90 += matrix["p90_s"][prev][n] + service[n]
            if risk_m:
                route_risk = max(route_risk, float(risk_m[prev][n]))
            prev = n
        start_t = seq_nodes[0][1]
        arrive_t = seq_nodes[-1][1]
        ride = arrive_t - seq_nodes[1][1] if len(seq_nodes) > 1 else 0
        slack = max(0, _t2s(school.morning_bell_time) - policy.min_arrival_buffer_minutes * 60 - arrive_t)
        # On-time: deadline bucket from P50/P90 vs bell, blended with the late
        # classifier's worst-leg risk so learned risk moves the headline number.
        latest = _t2s(school.morning_bell_time) - policy.min_arrival_buffer_minutes * 60
        # Approximate on-time probability from p50/p90 vs deadline
        if p90 <= 0:
            bucket = 0.95
        else:
            # assume arrival ~ mix of p50/p90 from start
            p50_arr = start_t + p50
            p90_arr = start_t + p90
            if p90_arr <= latest:
                bucket = 0.93
            elif p50_arr <= latest:
                bucket = 0.62
            else:
                bucket = 0.28
        on_time = round(0.5 * bucket + 0.5 * (1 - route_risk), 3)
        path_points = [
            _node_latlng(n, depot, school, stop_list, school_i) for n, _ in seq_nodes
        ]
        safety = route_safety_context(path_points)
        risk = round(
            min(
                100,
                (1 - on_time) * 80
                + (15 if wc else 0)
                + max(0, ride - policy.max_student_ride_minutes * 60) / 60
                + min(15, safety["high_injury_km"] * 6)
                + min(16, 8 * len(safety["active_construction"])),
            ),
            1,
        )
        factors = explain_risk(mode, on_time, ride, policy, slack, wc, dist, model_risk=route_risk, safety=safety)
        route = Route.objects.create(
            route_plan=plan,
            name=f"{school.school_code}-AM-{route_n:02d}",
            route_code=f"{school.school_code}-AM-{route_n:02d}",
            school=school,
            depot=depot,
            assigned_vehicle=vehicle,
            assigned_driver=driver,
            direction=Route.Direction.AM,
            scheduled_start=_s2t(start_t),
            scheduled_school_arrival=_s2t(arrive_t),
            total_distance_km=round(dist, 2),
            p50_duration_seconds=int(p50),
            p90_duration_seconds=int(p90),
            on_time_probability=round(on_time, 3),
            risk_score=risk,
            capacity_utilization=round(len(students) / max(vehicle.capacity, 1), 3),
            risk_factors=factors,
            student_count=len(students),
            wheelchair_count=wc,
            safety_context=safety,
        )
        # persist stops
        load = 0
        prev_node, prev_t = seq_nodes[0]
        # depot
        RouteStop.objects.create(
            route=route,
            bus_stop=None,
            sequence=0,
            kind="depot",
            name=depot.name,
            latitude=depot.latitude,
            longitude=depot.longitude,
            scheduled_departure=_s2t(start_t),
            scheduled_arrival=_s2t(start_t),
        )
        seq = 1
        for node, t in seq_nodes[1:]:
            if node == school_i:
                RouteStop.objects.create(
                    route=route,
                    sequence=seq,
                    kind="school",
                    name=school.name,
                    latitude=school.latitude,
                    longitude=school.longitude,
                    scheduled_arrival=_s2t(t),
                    predicted_p50_arrival=_s2t(prev_t + matrix["p50_s"][prev_node][node]),
                    predicted_p90_arrival=_s2t(prev_t + matrix["p90_s"][prev_node][node]),
                    cumulative_load=load,
                    student_count=0,
                    distance_from_previous_km=matrix["distance_km"][prev_node][node],
                    expected_seconds_from_previous=time_m[prev_node][node],
                )
            else:
                g = stop_list[node - 1]
                load += g["demand"]
                if g.get("is_transfer"):
                    rs = RouteStop.objects.create(
                        route=route,
                        bus_stop=None,
                        sequence=seq,
                        kind="transfer",
                        name=f"Transfer at {g['hub'].name}",
                        latitude=g["hub"].latitude,
                        longitude=g["hub"].longitude,
                        scheduled_arrival=_s2t(t),
                        scheduled_departure=_s2t(t + service[node]),
                        predicted_p50_arrival=_s2t(prev_t + matrix["p50_s"][prev_node][node]),
                        predicted_p90_arrival=_s2t(prev_t + matrix["p90_s"][prev_node][node]),
                        student_count=g["demand"],
                        cumulative_load=load,
                        distance_from_previous_km=matrix["distance_km"][prev_node][node],
                        expected_seconds_from_previous=time_m[prev_node][node],
                    )
                    transfer_links.append(
                        {"hub_id": str(g["hub"].id), "trunk_route": route, "arrival_time": _s2t(t)}
                    )
                else:
                    rs = RouteStop.objects.create(
                        route=route,
                        bus_stop=g["stop"],
                        sequence=seq,
                        kind="stop",
                        name=g["stop"].name,
                        latitude=g["stop"].latitude,
                        longitude=g["stop"].longitude,
                        scheduled_arrival=_s2t(t),
                        scheduled_departure=_s2t(t + service[node]),
                        predicted_p50_arrival=_s2t(prev_t + matrix["p50_s"][prev_node][node]),
                        predicted_p90_arrival=_s2t(prev_t + matrix["p90_s"][prev_node][node]),
                        student_count=g["demand"],
                        cumulative_load=load,
                        distance_from_previous_km=matrix["distance_km"][prev_node][node],
                        expected_seconds_from_previous=time_m[prev_node][node],
                    )
                RouteStopStudent.objects.bulk_create(
                    [RouteStopStudent(route_stop=rs, student=st, action="board") for st in g["students"]]
                )
            prev_node, prev_t = node, t
            seq += 1
        route_metrics.append(
            {
                "route_code": route.route_code,
                "students": route.student_count,
                "distance_km": route.total_distance_km,
                "p50": route.p50_duration_seconds,
                "p90": route.p90_duration_seconds,
                "on_time": route.on_time_probability,
                "risk": route.risk_score,
            }
        )

    if route_n == 0:
        plan.status = RoutePlan.Status.FAILED
        plan.infeasibility = {"reasons": ["The solver returned unused vehicles only."]}
        plan.save()
        raise InfeasibleRouteError(details=plan.infeasibility)

    rides = [m["p50"] for m in route_metrics]
    plan.status = RoutePlan.Status.GENERATED
    plan.infeasibility = {}
    plan.aggregate_metrics = {
        "routes": route_n,
        "vehicles_used": route_n,
        "students": sum(m["students"] for m in route_metrics),
        "total_distance_km": round(sum(m["distance_km"] for m in route_metrics), 2),
        "average_ride_seconds": int(sum(rides) / len(rides)),
        "longest_ride_seconds": max(rides),
        "average_p50": int(sum(m["p50"] for m in route_metrics) / len(route_metrics)),
        "average_p90": int(sum(m["p90"] for m in route_metrics) / len(route_metrics)),
        "average_on_time": round(sum(m["on_time"] for m in route_metrics) / len(route_metrics), 3),
        "capacity_violations": 0,
        "policy_violations": 0,
        "synthetic_ml": True,
    }
    plan.solver_metadata = {
        "engine": "OR-Tools CVRPTW",
        "mode": mode,
        "matrix_provider": matrix.get("provider"),
        "ml_overlay": matrix.get("ml_overlay", False),
        "dwell": dwell,
        "generated_at": timezone.now().isoformat(),
    }
    plan.save()
    return plan, transfer_links


def _generate_feeder_routes(
    plan: RoutePlan,
    district,
    yard: Depot,
    hub: Depot,
    hub_students: list,
    policy: DistrictPolicy,
    vehicles: list,
    drivers: list,
    used_driver_ids: set,
    mode: str,
    deadline_seconds: int,
    route_prefix: str,
) -> dict:
    """Solves a feeder-tier VRP: yard -> feeder stops -> hub (a transfer point, not the school).

    Mirrors generate_plan's VRP structure but targets a hub-arrival deadline
    instead of the school bell time. Returns {"routes": [Route,...],
    "arrival_seconds": latest feeder arrival at the hub, "demand", "wc",
    "students"} so the caller can inject the aggregated transfer group into
    the main/trunk tier with a lower time-window bound.
    """
    groups: dict[str, dict[str, Any]] = {}
    for student, stop in hub_students:
        g = groups.setdefault(str(stop.id), {"stop": stop, "students": [], "demand": 0, "wc": 0})
        g["students"].append(student)
        g["demand"] += 1
        g["wc"] += 1 if student.requires_wheelchair else 0
    stop_list = list(groups.values())

    points = [
        (float(yard.latitude), float(yard.longitude)),
        *[(float(g["stop"].latitude), float(g["stop"].longitude)) for g in stop_list],
        (float(hub.latitude), float(hub.longitude)),
    ]
    hour = max(0, deadline_seconds // 3600 - 1)
    raw = street_matrix(district, points, departure_hour=hour)
    from apps.machine_learning.services.predict import overlay_ml_matrix

    total_demand = sum(g["demand"] for g in stop_list)
    avg_load = total_demand / max(1, min(len(vehicles), max(1, len(stop_list))))
    node_meta = [{"boarding": 0, "wheelchair": 0, "load": 0}]
    node_meta += [{"boarding": g["demand"], "wheelchair": g["wc"], "load": avg_load} for g in stop_list]
    node_meta.append({"boarding": 0, "wheelchair": 0, "load": avg_load})
    matrix = overlay_ml_matrix(raw, points, hour=hour, mode=mode, node_meta=node_meta)

    if mode == RoutePlan.Mode.FASTEST:
        time_m = matrix["p50_s"]
    elif mode == RoutePlan.Mode.RELIABILITY:
        time_m = matrix["p90_s"]
    else:
        time_m = [
            [int(0.55 * a + 0.45 * b) for a, b in zip(r1, r2)]
            for r1, r2 in zip(matrix["p50_s"], matrix["p90_s"])
        ]

    n_stops = len(stop_list)
    n_nodes = n_stops + 2
    yard_i, hub_i = 0, n_nodes - 1
    num_vehicles = min(len(vehicles), max(1, n_stops))
    vehicles = vehicles[:num_vehicles]
    if not vehicles:
        raise InfeasibleRouteError(
            details={"reasons": [f"No vehicles available for the feeder route into {hub.name}."]}
        )
    caps = [v.capacity for v in vehicles]
    wc_caps = [v.wheelchair_capacity for v in vehicles]

    demands = [0] + [g["demand"] for g in stop_list] + [0]
    wc_demands = [0] + [g["wc"] for g in stop_list] + [0]
    from apps.routing.services.dwell import estimate_boarding_params

    dwell = estimate_boarding_params(district)
    service = [0] + [
        dwell["boarding_seconds"] * g["demand"] + dwell["wheelchair_seconds"] * g["wc"] for g in stop_list
    ] + [60]

    latest_hub = deadline_seconds
    earliest_hub = max(0, deadline_seconds - 40 * 60)
    max_ride = policy.max_student_ride_minutes * 60
    horizon = deadline_seconds + 1800

    windows = [(0, horizon)]
    for i in range(n_stops):
        travel_to_hub = time_m[i + 1][hub_i]
        latest = latest_hub - travel_to_hub - service[i + 1]
        earliest = max(0, earliest_hub - max_ride)
        if latest < earliest:
            latest = earliest + 300
        windows.append((int(earliest), int(max(latest, earliest + 60))))
    windows.append((int(earliest_hub), int(max(latest_hub, earliest_hub + 60))))

    manager = pywrapcp.RoutingIndexManager(n_nodes, num_vehicles, [yard_i] * num_vehicles, [hub_i] * num_vehicles)
    routing = pywrapcp.RoutingModel(manager)

    weights = plan.objective_weights or {}
    veh_w = float(weights.get("vehicles", 20 if mode != RoutePlan.Mode.FASTEST else 6))

    def time_cb(from_index, to_index):
        i, j = manager.IndexToNode(from_index), manager.IndexToNode(to_index)
        return int(time_m[i][j] + service[i])

    def dist_cb(from_index, to_index):
        i, j = manager.IndexToNode(from_index), manager.IndexToNode(to_index)
        return int(matrix["distance_km"][i][j] * 1000)

    time_idx = routing.RegisterTransitCallback(time_cb)
    routing.RegisterTransitCallback(dist_cb)
    routing.SetArcCostEvaluatorOfAllVehicles(time_idx)
    routing.AddDimension(time_idx, 30 * 60, horizon, False, "Time")
    time_dim = routing.GetDimensionOrDie("Time")
    for node, (lo, hi) in enumerate(windows):
        index = manager.NodeToIndex(node)
        if node == yard_i:
            for v in range(num_vehicles):
                time_dim.CumulVar(routing.Start(v)).SetRange(lo, hi)
            continue
        if index < 0 or routing.IsEnd(index):
            continue
        time_dim.CumulVar(index).SetRange(lo, hi)
    for v in range(num_vehicles):
        time_dim.CumulVar(routing.End(v)).SetRange(windows[hub_i][0], windows[hub_i][1])
        routing.AddVariableMinimizedByFinalizer(time_dim.CumulVar(routing.Start(v)))
        routing.AddVariableMinimizedByFinalizer(time_dim.CumulVar(routing.End(v)))

    def demand_cb(from_index):
        return demands[manager.IndexToNode(from_index)]

    def wc_cb(from_index):
        return wc_demands[manager.IndexToNode(from_index)]

    routing.AddDimensionWithVehicleCapacity(routing.RegisterUnaryTransitCallback(demand_cb), 0, caps, True, "Cap")
    routing.AddDimensionWithVehicleCapacity(routing.RegisterUnaryTransitCallback(wc_cb), 0, wc_caps, True, "WC")
    for v in range(num_vehicles):
        routing.SetFixedCostOfVehicle(int(veh_w * 400), v)

    search = pywrapcp.DefaultRoutingSearchParameters()
    try:
        first = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
        meta = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    except AttributeError:
        first = routing_enums_pb2.FirstSolutionStrategy.Value.PATH_CHEAPEST_ARC
        meta = routing_enums_pb2.LocalSearchMetaheuristic.Value.GUIDED_LOCAL_SEARCH
    search.first_solution_strategy = first
    search.local_search_metaheuristic = meta
    search.time_limit.FromSeconds(8)

    solution = routing.SolveWithParameters(search)
    if solution is None:
        raise InfeasibleRouteError(details={"reasons": [f"Could not build a feeder route into {hub.name} in time."]})

    return _persist_feeder_routes(
        plan=plan,
        hub=hub,
        yard=yard,
        stop_list=stop_list,
        vehicles=vehicles,
        drivers=drivers,
        used_driver_ids=used_driver_ids,
        manager=manager,
        routing=routing,
        solution=solution,
        matrix=matrix,
        time_m=time_m,
        time_dim=time_dim,
        service=service,
        mode=mode,
        policy=policy,
        deadline_seconds=deadline_seconds,
        route_prefix=route_prefix,
        hub_i=hub_i,
        n_stops=n_stops,
    )


def _persist_feeder_routes(
    plan,
    hub,
    yard,
    stop_list,
    vehicles,
    drivers,
    used_driver_ids,
    manager,
    routing,
    solution,
    matrix,
    time_m,
    time_dim,
    service,
    mode,
    policy,
    deadline_seconds,
    route_prefix,
    hub_i,
    n_stops,
) -> dict:
    routes_created = []
    arrival_seconds = 0
    total_demand = 0
    total_wc = 0
    all_students: list = []
    route_n = 0

    for v in range(len(vehicles)):
        index = routing.Start(v)
        seq_nodes = []
        while not routing.IsEnd(index):
            node = manager.IndexToNode(index)
            t = solution.Value(time_dim.CumulVar(index))
            seq_nodes.append((node, t))
            index = solution.Value(routing.NextVar(index))
        end_t = solution.Value(time_dim.CumulVar(index))
        seq_nodes.append((hub_i, end_t))
        pickup_nodes = [n for n, _ in seq_nodes if 1 <= n <= n_stops]
        if not pickup_nodes:
            continue
        route_n += 1
        vehicle = vehicles[v]
        driver = None
        for d in drivers:
            if d.id not in used_driver_ids:
                driver = d
                used_driver_ids.add(d.id)
                break
        students = []
        for n in pickup_nodes:
            students.extend(stop_list[n - 1]["students"])
        wc = sum(1 for s in students if s.requires_wheelchair)
        dist = 0.0
        p50 = 0
        p90 = 0
        route_risk = 0.0
        prev = 0
        for n, _ in seq_nodes[1:]:
            dist += matrix["distance_km"][prev][n]
            p50 += matrix["p50_s"][prev][n] + service[n]
            p90 += matrix["p90_s"][prev][n] + service[n]
            if matrix.get("delay_risk"):
                route_risk = max(route_risk, float(matrix["delay_risk"][prev][n]))
            prev = n
        start_t = seq_nodes[0][1]
        arrive_t = seq_nodes[-1][1]
        ride = arrive_t - seq_nodes[1][1] if len(seq_nodes) > 1 else 0
        slack = max(0, deadline_seconds - arrive_t)
        on_time = round(max(0.1, min(0.97, (1 - route_risk) * (0.95 if slack > 0 else 0.5))), 3)
        path_points = [_feeder_node_latlng(n, yard, hub, stop_list, hub_i) for n, _ in seq_nodes]
        safety = route_safety_context(path_points)
        risk = round(
            min(
                100,
                (1 - on_time) * 80
                + (15 if wc else 0)
                + min(15, safety["high_injury_km"] * 6)
                + min(16, 8 * len(safety["active_construction"])),
            ),
            1,
        )
        factors = explain_risk(mode, on_time, ride, policy, slack, wc, dist, model_risk=route_risk, safety=safety)
        route = Route.objects.create(
            route_plan=plan,
            name=f"{route_prefix}-{route_n:02d}",
            route_code=f"{route_prefix}-{route_n:02d}",
            school=plan.school,
            depot=yard,
            assigned_vehicle=vehicle,
            assigned_driver=driver,
            direction=Route.Direction.AM,
            scheduled_start=_s2t(start_t),
            scheduled_school_arrival=_s2t(arrive_t),
            total_distance_km=round(dist, 2),
            p50_duration_seconds=int(p50),
            p90_duration_seconds=int(p90),
            on_time_probability=on_time,
            risk_score=risk,
            capacity_utilization=round(len(students) / max(vehicle.capacity, 1), 3),
            risk_factors=factors,
            student_count=len(students),
            wheelchair_count=wc,
            safety_context=safety,
        )
        load = 0
        prev_node, prev_t = seq_nodes[0]
        RouteStop.objects.create(
            route=route,
            bus_stop=None,
            sequence=0,
            kind="depot",
            name=yard.name,
            latitude=yard.latitude,
            longitude=yard.longitude,
            scheduled_departure=_s2t(start_t),
            scheduled_arrival=_s2t(start_t),
        )
        seq = 1
        for node, t in seq_nodes[1:]:
            if node == hub_i:
                RouteStop.objects.create(
                    route=route,
                    sequence=seq,
                    kind="transfer",
                    name=f"Transfer at {hub.name}",
                    latitude=hub.latitude,
                    longitude=hub.longitude,
                    scheduled_arrival=_s2t(t),
                    predicted_p50_arrival=_s2t(prev_t + matrix["p50_s"][prev_node][node]),
                    predicted_p90_arrival=_s2t(prev_t + matrix["p90_s"][prev_node][node]),
                    cumulative_load=load,
                    student_count=0,
                    distance_from_previous_km=matrix["distance_km"][prev_node][node],
                    expected_seconds_from_previous=time_m[prev_node][node],
                )
            else:
                g = stop_list[node - 1]
                load += g["demand"]
                rs = RouteStop.objects.create(
                    route=route,
                    bus_stop=g["stop"],
                    sequence=seq,
                    kind="stop",
                    name=g["stop"].name,
                    latitude=g["stop"].latitude,
                    longitude=g["stop"].longitude,
                    scheduled_arrival=_s2t(t),
                    scheduled_departure=_s2t(t + service[node]),
                    predicted_p50_arrival=_s2t(prev_t + matrix["p50_s"][prev_node][node]),
                    predicted_p90_arrival=_s2t(prev_t + matrix["p90_s"][prev_node][node]),
                    student_count=g["demand"],
                    cumulative_load=load,
                    distance_from_previous_km=matrix["distance_km"][prev_node][node],
                    expected_seconds_from_previous=time_m[prev_node][node],
                )
                RouteStopStudent.objects.bulk_create(
                    [RouteStopStudent(route_stop=rs, student=st, action="board") for st in g["students"]]
                )
            prev_node, prev_t = node, t
            seq += 1

        arrival_seconds = max(arrival_seconds, arrive_t)
        total_demand += len(students)
        total_wc += wc
        all_students.extend(students)
        routes_created.append(route)

    if not routes_created:
        raise InfeasibleRouteError(
            details={"reasons": [f"The feeder solver into {hub.name} returned unused vehicles only."]}
        )

    return {
        "routes": routes_created,
        "arrival_seconds": arrival_seconds,
        "demand": total_demand,
        "wc": total_wc,
        "students": all_students,
    }


def _feeder_node_latlng(node, yard, hub, stop_list, hub_i) -> tuple[float, float]:
    if node == 0:
        return (float(yard.latitude), float(yard.longitude))
    if node == hub_i:
        return (float(hub.latitude), float(hub.longitude))
    stop = stop_list[node - 1]["stop"]
    return (float(stop.latitude), float(stop.longitude))


def _node_latlng(node, depot, school, stop_list, school_i) -> tuple[float, float]:
    if node == 0:
        return (float(depot.latitude), float(depot.longitude))
    if node == school_i:
        return (float(school.latitude), float(school.longitude))
    g = stop_list[node - 1]
    if g.get("is_transfer"):
        return (float(g["hub"].latitude), float(g["hub"].longitude))
    return (float(g["stop"].latitude), float(g["stop"].longitude))


def route_safety_context(path_points: list[tuple[float, float]]) -> dict:
    """Hazard overlap for a stop-to-stop path, from the real Louisville geodata layers.

    Uses straight-line legs between stops (consistent with the rest of this
    module's Haversine-based scoring) rather than the OSRM/Google street
    polyline, so it has no external-network dependency. Degrades to neutral
    values when `import_louisville_open_data` hasn't been run yet.
    """
    from django.utils import timezone

    from apps.geodata import services as geo_services

    hi = geo_services.high_injury_overlap(path_points)
    signal_crossings = sum(geo_services.signal_count_near(lat, lng, radius_m=90) for lat, lng in path_points)
    construction = geo_services.active_construction_near(path_points, timezone.now())
    return {
        "high_injury_km": hi["km"],
        "high_injury_corridors": hi["corridors"],
        "high_injury_worst_priority": hi["worst_priority"],
        "signal_crossings": signal_crossings,
        "active_construction": construction,
        "snow_route_coverage": geo_services.snow_route_coverage(path_points),
    }


def explain_risk(mode, on_time, ride, policy, slack, wc, dist, model_risk=None, safety=None) -> list[dict]:
    factors = []
    safety = safety or {}
    if safety.get("high_injury_km", 0) > 0.15:
        corridors = ", ".join(safety.get("high_injury_corridors") or [])
        factors.append(
            {
                "code": "HIGH_INJURY_CORRIDOR",
                "text": (
                    f"This route runs {safety['high_injury_km']:.1f} km along Louisville's Vision Zero "
                    f"high-injury network{' (' + corridors + ')' if corridors else ''}, where a "
                    "disproportionate share of serious crashes occur."
                ),
            }
        )
    if safety.get("active_construction"):
        sites = safety["active_construction"]
        first = sites[0]
        extra = f" and {len(sites) - 1} more" if len(sites) > 1 else ""
        factors.append(
            {
                "code": "ACTIVE_CONSTRUCTION",
                "text": (
                    f"An active right-of-way permit near {first.get('street_address') or 'this route'} "
                    f"({first.get('work_type') or 'construction'}){extra} may cause delays or detours."
                ),
            }
        )
    if safety.get("snow_route_coverage", 1.0) < 0.5:
        factors.append(
            {
                "code": "LOW_SNOW_PRIORITY",
                "text": (
                    "Most of this route is off Public Works' priority snow/salt routes, so winter "
                    "mornings are riskier than the dry-pavement ETA suggests."
                ),
            }
        )
    if model_risk is not None and model_risk > 0.4:
        factors.append(
            {
                "code": "MODEL_LATE_RISK",
                "text": f"The late classifier rates the riskiest leg at {model_risk:.0%} late (synthetic training data).",
            }
        )
    if on_time < 0.7:
        factors.append(
            {
                "code": "LATE_RISK",
                "text": "Predicted P90 travel time leaves little slack before the bell, so rain or traffic can make this bus late.",
            }
        )
    if slack < 4 * 60:
        factors.append(
            {
                "code": "TIGHT_BELL",
                "text": "The arrival buffer before the bell is thin. Reliability mode would add more slack.",
            }
        )
    if ride > policy.max_student_ride_minutes * 60 * 0.9:
        factors.append(
            {
                "code": "LONG_RIDE",
                "text": "Students toward the start of this route sit near the maximum allowed ride time.",
            }
        )
    if wc:
        factors.append(
            {
                "code": "WHEELCHAIR_DWELL",
                "text": "Wheelchair boardings add dwell time at stops, which increases schedule variance.",
            }
        )
    if dist > 18:
        factors.append(
            {
                "code": "LONG_SEGMENT",
                "text": "Longer mileage makes this route more sensitive to corridor traffic.",
            }
        )
    if not factors:
        factors.append({"code": "STABLE", "text": "This route has comfortable slack and moderate dwell time."})
    return factors


def compare_plans(plan_a: RoutePlan, plan_b: RoutePlan) -> dict:
    def snap(p: RoutePlan) -> dict:
        m = p.aggregate_metrics or {}
        return {
            "id": str(p.id),
            "name": p.name,
            "mode": p.optimization_mode,
            "status": p.status,
            "mileage_km": m.get("total_distance_km"),
            "vehicles_used": m.get("vehicles_used"),
            "average_ride_seconds": m.get("average_ride_seconds"),
            "longest_ride_seconds": m.get("longest_ride_seconds"),
            "p50_duration": m.get("average_p50"),
            "p90_duration": m.get("average_p90"),
            "on_time_probability": m.get("average_on_time"),
            "capacity_violations": m.get("capacity_violations", 0),
            "policy_violations": m.get("policy_violations", 0),
        }

    a, b = snap(plan_a), snap(plan_b)
    keys = [k for k in a if k not in {"id", "name", "mode", "status"}]
    delta = {}
    for k in keys:
        av, bv = a.get(k) or 0, b.get(k) or 0
        delta[k] = round((bv - av), 3) if isinstance(av, float) or isinstance(bv, float) else bv - av
    return {"plan_a": a, "plan_b": b, "delta_b_minus_a": delta}
