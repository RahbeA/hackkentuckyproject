from apps.districts.models import DistrictPolicy
from apps.transportation.models import BusStop, Student, StudentStopAssignment
from apps.transportation.services.stop_optimizer import commit_suggested_stops, suggest_stops


def _student(district, school, external_id, lat, lng, wheelchair=False):
    return Student.objects.create(
        district=district,
        external_id=external_id,
        first_name="Kid",
        last_name=external_id,
        grade="2",
        school=school,
        home_address="x",
        latitude=lat,
        longitude=lng,
        requires_wheelchair=wheelchair,
    )


def test_nearby_students_share_one_stop(district, school):
    DistrictPolicy.objects.update_or_create(district=district, defaults={"max_walking_distance_m": {"elementary": 400}})
    # Three homes within ~100m of each other.
    _student(district, school, "A", 38.2470, -85.7310)
    _student(district, school, "B", 38.2471, -85.7311)
    _student(district, school, "C", 38.2469, -85.7309)

    result = suggest_stops(school, direction="am")
    assert result["students_considered"] == 3
    assert len(result["suggested_stops"]) == 1
    stop = result["suggested_stops"][0]
    assert stop["student_count"] == 3
    assert stop["max_walk_distance_m"] <= 400


def test_far_apart_students_get_separate_stops(district, school):
    DistrictPolicy.objects.update_or_create(district=district, defaults={"max_walking_distance_m": {"elementary": 400}})
    _student(district, school, "A", 38.2470, -85.7310)
    _student(district, school, "B", 38.30, -85.60)  # miles away

    result = suggest_stops(school, direction="am")
    assert len(result["suggested_stops"]) == 2
    for stop in result["suggested_stops"]:
        assert stop["student_count"] == 1
        assert stop["max_walk_distance_m"] == 0


def test_no_cluster_exceeds_walk_policy(district, school):
    DistrictPolicy.objects.update_or_create(district=district, defaults={"max_walking_distance_m": {"elementary": 250}})
    # A loose scatter: some pairs within 250m, some just outside.
    coords = [
        (38.2470, -85.7310),
        (38.2472, -85.7312),
        (38.2480, -85.7320),
        (38.2490, -85.7330),
        (38.2530, -85.7370),
    ]
    for i, (lat, lng) in enumerate(coords):
        _student(district, school, f"S{i}", lat, lng)

    result = suggest_stops(school, direction="am")
    for stop in result["suggested_stops"]:
        assert stop["max_walk_distance_m"] <= 250


def test_wheelchair_students_clustered_separately_and_tighter(district, school):
    DistrictPolicy.objects.update_or_create(district=district, defaults={"max_walking_distance_m": {"elementary": 400}})
    # A wheelchair student and a walking student ~300m apart: far enough to
    # exceed the tighter wheelchair radius but within the normal one.
    _student(district, school, "WC", 38.2470, -85.7310, wheelchair=True)
    _student(district, school, "Walker", 38.2495, -85.7310)

    result = suggest_stops(school, direction="am")
    assert len(result["suggested_stops"]) == 2
    wc_stops = [s for s in result["suggested_stops"] if s["wheelchair_count"] > 0]
    assert len(wc_stops) == 1
    assert wc_stops[0]["student_count"] == 1


def test_only_unassigned_excludes_students_with_active_stop(district, school):
    stop = BusStop.objects.create(
        district=district, name="Existing", stop_code="EX1", address="a", latitude=38.24, longitude=-85.73
    )
    assigned = _student(district, school, "Assigned", 38.2470, -85.7310)
    StudentStopAssignment.objects.create(student=assigned, bus_stop=stop, direction="am")
    _student(district, school, "Unassigned", 38.2600, -85.7500)

    result = suggest_stops(school, direction="am", only_unassigned=True)
    assert result["students_considered"] == 1
    all_result = suggest_stops(school, direction="am", only_unassigned=False)
    assert all_result["students_considered"] == 2


def test_commit_creates_stops_and_assignments(district, school):
    DistrictPolicy.objects.update_or_create(district=district, defaults={"max_walking_distance_m": {"elementary": 400}})
    _student(district, school, "A", 38.2470, -85.7310)
    _student(district, school, "B", 38.2471, -85.7311)

    result = suggest_stops(school, direction="am")
    created = commit_suggested_stops(school, result["suggested_stops"], direction="am")

    assert len(created) == len(result["suggested_stops"])
    for stop in created:
        assert stop.district_id == district.id
        assert stop.is_approved is True
        assert StudentStopAssignment.objects.filter(bus_stop=stop, direction="am").exists()


def test_default_only_unassigned_prevents_double_assignment_on_rerun(district, school):
    """Running suggest+commit twice with the safe default (only_unassigned=True)
    must never double-assign a student, since round 2 sees nobody left to place."""
    DistrictPolicy.objects.update_or_create(district=district, defaults={"max_walking_distance_m": {"elementary": 400}})
    _student(district, school, "A", 38.2470, -85.7310)

    first = suggest_stops(school, direction="am")
    commit_suggested_stops(school, first["suggested_stops"], direction="am")
    count_after_first = StudentStopAssignment.objects.count()

    second = suggest_stops(school, direction="am")  # only_unassigned defaults True
    assert second["students_considered"] == 0
    commit_suggested_stops(school, second["suggested_stops"], direction="am")
    assert StudentStopAssignment.objects.count() == count_after_first
