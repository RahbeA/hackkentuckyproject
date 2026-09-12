from apps.accounts.models import UserRole
from apps.transportation.models import DriverProfile
from tests.conftest import api


def _register(client, district, role):
    return client.post(
        "/api/v1/auth/register/",
        {
            "mode": "join",
            "join_code": district.join_code,
            "role": role,
            "email": f"{role}.new@jefferson.demo",
            "password": "DemoPass123!",
            "first_name": "New",
            "last_name": role.title(),
        },
        format="json",
    )


def test_driver_join_creates_profile_visible_to_admin(district, district_admin):
    res = _register(api(), district, UserRole.DRIVER.value)
    assert res.status_code == 201, res.data

    profile = DriverProfile.objects.filter(user__email="driver.new@jefferson.demo").first()
    assert profile is not None
    assert profile.district_id == district.id
    assert profile.employee_id

    # The new driver now appears in the district admin's Drivers roster.
    listing = api(district_admin).get("/api/v1/drivers/")
    emails = {row["email"] for row in listing.data["results"]}
    assert "driver.new@jefferson.demo" in emails


def test_guardian_join_does_not_create_driver_profile(district):
    res = _register(api(), district, UserRole.GUARDIAN.value)
    assert res.status_code == 201, res.data
    assert not DriverProfile.objects.filter(user__email="guardian.new@jefferson.demo").exists()
