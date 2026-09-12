from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.contrib.auth.base_user import BaseUserManager
from django.db import models

from common.utilities.models import TimeStampedUUIDModel


class UserRole(models.TextChoices):
    PLATFORM_ADMIN = "platform_admin", "Platform administrator"
    DISTRICT_ADMIN = "district_admin", "District administrator"
    PLANNER = "planner", "Transportation planner"
    DISPATCHER = "dispatcher", "Dispatcher"
    DRIVER = "driver", "Driver"
    GUARDIAN = "guardian", "Guardian"


class UserManager(BaseUserManager):
    def get_by_natural_key(self, username):
        return self.get(email__iexact=username)

    def create_user(self, email, password=None, **extra):
        if not email:
            raise ValueError("Email is required")
        email = self.normalize_email(email).strip().lower()
        user = self.model(email=email, **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra):
        extra.setdefault("role", UserRole.PLATFORM_ADMIN)
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        extra.setdefault("is_active", True)
        return self.create_user(email, password, **extra)


class User(AbstractBaseUser, PermissionsMixin, TimeStampedUUIDModel):
    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=120)
    last_name = models.CharField(max_length=120)
    phone = models.CharField(max_length=40, blank=True)
    role = models.CharField(max_length=32, choices=UserRole.choices)
    district = models.ForeignKey(
        "districts.District",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="users",
    )
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["first_name", "last_name", "role"]

    objects = UserManager()

    class Meta:
        ordering = ["email"]

    def __str__(self) -> str:
        return f"{self.email} ({self.role})"

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()


class GuardianStudentLink(TimeStampedUUIDModel):
    guardian = models.ForeignKey(User, on_delete=models.CASCADE, related_name="student_links")
    student = models.ForeignKey(
        "transportation.Student",
        on_delete=models.CASCADE,
        related_name="guardian_links",
    )
    relationship = models.CharField(max_length=40, default="parent")
    is_verified = models.BooleanField(default=True)
    notification_preferences = models.JSONField(
        default=dict,
        blank=True,
        help_text="Keys: eta, delay, incident, absence",
    )

    class Meta:
        unique_together = ("guardian", "student")
