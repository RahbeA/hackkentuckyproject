import uuid

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils.text import slugify
from rest_framework import serializers
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView as SimpleJWTRefreshView

from apps.accounts.models import User, UserRole
from apps.districts.models import Depot, District, DistrictPolicy
from common.exceptions.errors import RouteWiseError
from common.permissions.roles import HasRole


class UserSerializer(serializers.ModelSerializer):
    district_name = serializers.CharField(source="district.name", read_only=True, default=None)
    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "phone",
            "role",
            "district",
            "district_name",
            "is_active",
            "last_login",
        )
        read_only_fields = ("id", "last_login", "full_name", "district_name")


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate_email(self, value):
        return value.strip().lower()


def _tokens_for(user: User) -> dict:
    refresh = RefreshToken.for_user(user)
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        ser = LoginSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        email = ser.validated_data["email"]
        password = ser.validated_data["password"]
        user = authenticate(request, username=email, password=password)
        if user is None:
            candidate = User.objects.filter(email__iexact=email).first()
            if candidate and candidate.is_active and candidate.check_password(password):
                user = candidate
        if user is None or not user.is_active:
            raise RouteWiseError("Invalid email or password.", code="INVALID_CREDENTIALS", status_code=401)
        return Response({"user": UserSerializer(user).data, "tokens": _tokens_for(user)})


login_view = LoginView.as_view()


# Roles a user may self-assign when joining an existing district. Platform
# admin is intentionally excluded — it is provisioned out of band only.
JOINABLE_ROLES = (
    UserRole.DISTRICT_ADMIN,
    UserRole.PLANNER,
    UserRole.DISPATCHER,
    UserRole.DRIVER,
    UserRole.GUARDIAN,
)


class RegisterSerializer(serializers.Serializer):
    """Self-service signup for both flows.

    ``mode="create"`` (default) spins up a brand-new district and makes the
    caller its administrator. ``mode="join"`` attaches the caller to an
    existing district (looked up by ``join_code`` or ``district`` id) with the
    ``role`` they select.
    """

    mode = serializers.ChoiceField(choices=("create", "join"), default="create")
    first_name = serializers.CharField(max_length=120)
    last_name = serializers.CharField(max_length=120)
    email = serializers.EmailField()
    phone = serializers.CharField(max_length=40, required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, min_length=8)

    # create mode
    district_name = serializers.CharField(max_length=200, required=False, allow_blank=True)

    # join mode
    join_code = serializers.CharField(max_length=12, required=False, allow_blank=True)
    district = serializers.UUIDField(required=False)
    role = serializers.ChoiceField(choices=[r.value for r in JOINABLE_ROLES], required=False)

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("An account with this email already exists.")
        return value

    def validate_password(self, value):
        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages))
        return value

    def validate(self, attrs):
        mode = attrs.get("mode", "create")
        if mode == "create":
            if not (attrs.get("district_name") or "").strip():
                raise serializers.ValidationError({"district_name": "District or organization name is required."})
        else:  # join
            if not attrs.get("role"):
                raise serializers.ValidationError({"role": "Choose the role you are joining as."})
            district = _resolve_join_district(attrs.get("join_code"), attrs.get("district"))
            if district is None:
                raise serializers.ValidationError(
                    {"join_code": "No active district matches that code or selection."}
                )
            attrs["_district"] = district
        return attrs


def _resolve_join_district(join_code: str | None, district_id) -> District | None:
    qs = District.objects.filter(is_active=True)
    if join_code:
        return qs.filter(join_code__iexact=join_code.strip()).first()
    if district_id:
        return qs.filter(id=district_id).first()
    return None


def _driver_employee_id(district) -> str:
    """A unique-per-district employee id for a self-service driver signup."""
    from apps.transportation.models import DriverProfile

    for _ in range(10):
        candidate = f"SD-{uuid.uuid4().hex[:6].upper()}"
        if not DriverProfile.objects.filter(district=district, employee_id=candidate).exists():
            return candidate
    return f"SD-{uuid.uuid4().hex[:10].upper()}"


def _unique_slug(name: str) -> str:
    base = slugify(name) or "district"
    slug = base
    while District.objects.filter(slug=slug).exists():
        slug = f"{base}-{uuid.uuid4().hex[:6]}"
    return slug


class RegisterView(APIView):
    """Self-service signup.

    Create mode provisions a district, its default policy, and a starter depot
    so the new admin can import a roster and generate routes right away. Join
    mode attaches the caller to an existing district in the role they pick.
    """

    permission_classes = [AllowAny]
    authentication_classes = []

    @transaction.atomic
    def post(self, request):
        ser = RegisterSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        data = ser.validated_data

        if data.get("mode", "create") == "join":
            district = data["_district"]
            role = data["role"]
        else:
            district = District.objects.create(
                name=data["district_name"].strip(),
                slug=_unique_slug(data["district_name"]),
                contact_email=data["email"],
                contact_phone=data.get("phone", ""),
            )
            DistrictPolicy.objects.get_or_create(district=district)
            # Default depot so vehicles and the optimizer have a start/anchor point.
            Depot.objects.create(
                district=district,
                name="Main Bus Depot",
                address="1200 Depot Rd, Summit Valley",
                latitude=40.0155,
                longitude=-83.0300,
                is_active=True,
            )
            role = UserRole.DISTRICT_ADMIN

        user = User.objects.create_user(
            email=data["email"],
            password=data["password"],
            first_name=data["first_name"].strip(),
            last_name=data["last_name"].strip(),
            phone=data.get("phone", ""),
            role=role,
            district=district,
            is_active=True,
        )
        # A self-service driver needs a DriverProfile, otherwise they never show
        # up in the district's Drivers roster and can't be assigned to a trip.
        if role == UserRole.DRIVER:
            from apps.transportation.models import DriverProfile

            DriverProfile.objects.get_or_create(
                user=user,
                defaults={"district": district, "employee_id": _driver_employee_id(district)},
            )
        return Response({"user": UserSerializer(user).data, "tokens": _tokens_for(user)}, status=201)


register_view = RegisterView.as_view()


class PublicDistrictSerializer(serializers.ModelSerializer):
    class Meta:
        model = District
        fields = ("id", "name", "state")


class PublicDistrictListView(APIView):
    """Unauthenticated list of joinable districts for the sign-up picker."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        qs = District.objects.filter(is_active=True).order_by("name")
        search = (request.query_params.get("search") or "").strip()
        if search:
            qs = qs.filter(name__icontains=search)
        return Response(PublicDistrictSerializer(qs[:100], many=True).data)


public_districts_view = PublicDistrictListView.as_view()


class DistrictLookupView(APIView):
    """Resolve a join code to a district name so the UI can confirm before signup."""

    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        code = (request.data.get("join_code") or "").strip()
        if not code:
            raise RouteWiseError("Enter a join code.", code="MISSING_CODE", status_code=400)
        district = District.objects.filter(is_active=True, join_code__iexact=code).first()
        if district is None:
            raise RouteWiseError("No district matches that join code.", code="INVALID_JOIN_CODE", status_code=404)
        return Response(PublicDistrictSerializer(district).data)


district_lookup_view = DistrictLookupView.as_view()


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        token = request.data.get("refresh")
        if token:
            try:
                RefreshToken(token).blacklist()
            except Exception:
                pass
        return Response({"detail": "Logged out."})


logout_view = LogoutView.as_view()


class TokenRefreshView(SimpleJWTRefreshView):
    permission_classes = [AllowAny]


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)

    def patch(self, request):
        ser = UserSerializer(request.user, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        # Guardians/drivers cannot change role or district
        forbidden = {"role", "district", "is_active"}
        if request.user.role not in {UserRole.PLATFORM_ADMIN, UserRole.DISTRICT_ADMIN}:
            for key in forbidden:
                ser.validated_data.pop(key, None)
        ser.save()
        return Response(ser.data)


class DemoCredentialsView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        if not settings.DEMO_MODE:
            return Response({"demo_mode": False, "accounts": []})
        return Response(
            {
                "demo_mode": True,
                "password": settings.DEMO_PASSWORD,
                "accounts": [
                    {"role": "platform_admin", "email": settings.DEMO_PLATFORM_EMAIL, "label": "Platform admin"},
                    {"role": "district_admin", "email": settings.DEMO_DISTRICT_ADMIN_EMAIL, "label": "District admin"},
                    {"role": "planner", "email": settings.DEMO_PLANNER_EMAIL, "label": "Planner"},
                    {"role": "dispatcher", "email": settings.DEMO_DISPATCHER_EMAIL, "label": "Dispatcher"},
                    {"role": "driver", "email": settings.DEMO_DRIVER_EMAIL, "label": "Driver"},
                    {"role": "guardian", "email": settings.DEMO_GUARDIAN_EMAIL, "label": "Guardian"},
                    {"role": "guardian", "email": settings.DEMO_STUDENT_EMAIL, "label": "Student"},
                ],
            }
        )


class UserAdminViewSet:
    """Imported from views_users to keep accounts.views focused on auth."""
