from __future__ import annotations

import csv
import io
from datetime import datetime
from pathlib import Path

from django.conf import settings
from django.db import transaction
from django.utils.text import slugify

from apps.accounts.models import User, UserRole
from apps.districts.models import Depot, School
from apps.imports.models import ImportJob, ImportRowError
from apps.imports.services.mapper import REQUIRED, get_column_mapper, read_csv_bytes
from apps.transportation.models import (
    BusStop,
    DriverProfile,
    Student,
    StudentStopAssignment,
    Vehicle,
)
from common.exceptions.errors import RouteWiseError
from common.utilities.geo import haversine_km, safe_filename


def store_upload(job: ImportJob, uploaded) -> None:
    media = Path(settings.MEDIA_ROOT) / "imports" / str(job.district_id)
    media.mkdir(parents=True, exist_ok=True)
    name = safe_filename(uploaded.name)
    path = media / f"{job.id}_{name}"
    data = uploaded.read()
    if len(data) > settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024:
        raise RouteWiseError("File exceeds upload size limit.", code="UPLOAD_TOO_LARGE", status_code=413)
    path.write_bytes(data)
    job.stored_path = str(path)
    job.original_filename = uploaded.name
    headers, rows = read_csv_bytes(data)
    job.headers = headers
    job.total_rows = len(rows)
    job.preview_rows = rows[:8]
    proposal = get_column_mapper().propose(job.import_type, headers, rows[:8])
    job.proposed_column_mapping = proposal
    job.status = ImportJob.Status.UPLOADED
    job.save()


def confirm_mapping(job: ImportJob, mapping: dict) -> ImportJob:
    job.confirmed_column_mapping = mapping
    job.status = ImportJob.Status.MAPPED
    job.save(update_fields=["confirmed_column_mapping", "status", "updated_at"])
    return validate_job(job)


def _cell(row: dict, mapping: dict, field: str) -> str:
    header = (mapping.get(field) or {}).get("header") if isinstance(mapping.get(field), dict) else mapping.get(field)
    if not header:
        return ""
    return str(row.get(header, "") or "").strip()


def _truthy(value: str) -> bool:
    return value.lower() in {"1", "true", "yes", "y", "active", "eligible"}


def _coord(value: str, field: str, errors: list, row_n: int):
    if not value:
        errors.append((row_n, field, "MISSING", f"{field} is required"))
        return None
    try:
        num = float(value)
    except ValueError:
        errors.append((row_n, field, "MALFORMED_COORDINATE", f"{field} is not a number: {value}"))
        return None
    if field == "latitude" and not -90 <= num <= 90:
        errors.append((row_n, field, "MALFORMED_COORDINATE", "Latitude out of range"))
        return None
    if field == "longitude" and not -180 <= num <= 180:
        errors.append((row_n, field, "MALFORMED_COORDINATE", "Longitude out of range"))
        return None
    return num


def validate_job(job: ImportJob) -> ImportJob:
    path = Path(job.stored_path)
    headers, rows = read_csv_bytes(path.read_bytes())
    mapping = job.confirmed_column_mapping or {
        k: v for k, v in (job.proposed_column_mapping.get("mapping") or {}).items()
    }
    missing = [f for f in REQUIRED[job.import_type] if not _mapped(mapping, f)]
    errors: list[tuple] = []
    seen_ids: dict[str, int] = {}
    valid = 0
    id_field = {
        "schools": "school_id",
        "students": "student_id",
        "drivers": "employee_id",
        "vehicles": "vehicle_number",
        "stops": "stop_id",
    }[job.import_type]

    if missing:
        job.status = ImportJob.Status.FAILED
        job.validation_results = {"missing_required": missing}
        job.save()
        raise RouteWiseError(
            "Required columns are not mapped.",
            code="MAPPING_INCOMPLETE",
            details={"missing_required": missing},
        )

    for i, row in enumerate(rows, start=2):
        row_errors_before = len(errors)
        ident = _cell(row, mapping, id_field)
        if not ident:
            errors.append((i, id_field, "MISSING", f"{id_field} is required"))
        elif ident in seen_ids:
            errors.append((i, id_field, "DUPLICATE_ID", f"Duplicate {id_field} {ident} (also row {seen_ids[ident]})"))
        else:
            seen_ids[ident] = i
        if job.import_type in {"schools", "students", "stops"}:
            _coord(_cell(row, mapping, "latitude"), "latitude", errors, i)
            _coord(_cell(row, mapping, "longitude"), "longitude", errors, i)
        if job.import_type == "students":
            school_id = _cell(row, mapping, "school_id")
            known = set(job.district.schools.values_list("school_code", flat=True))
            if school_id and known and school_id not in known:
                errors.append(
                    (
                        i,
                        "school_id",
                        "UNKNOWN_SCHOOL",
                        f"school_id {school_id} is not in this district. Import schools.csv first.",
                    )
                )
        if job.import_type == "vehicles":
            cap = _cell(row, mapping, "capacity")
            try:
                if int(cap) <= 0:
                    errors.append((i, "capacity", "INVALID_CAPACITY", "Capacity must be positive"))
            except ValueError:
                errors.append((i, "capacity", "INVALID_CAPACITY", "Capacity must be an integer"))
        if len(errors) == row_errors_before:
            valid += 1

    ImportRowError.objects.filter(import_job=job).delete()
    ImportRowError.objects.bulk_create(
        [
            ImportRowError(
                import_job=job,
                row_number=n,
                field=field,
                error_code=code,
                message=msg,
                raw_row=rows[n - 2] if 0 <= n - 2 < len(rows) else {},
            )
            for n, field, code, msg in errors
        ]
    )
    job.valid_rows = valid
    job.invalid_rows = len(rows) - valid
    job.total_rows = len(rows)
    job.validation_results = {
        "valid_rows": valid,
        "invalid_rows": job.invalid_rows,
        "error_count": len(errors),
        "can_commit": job.invalid_rows == 0 and valid > 0,
    }
    job.status = ImportJob.Status.VALIDATED if job.invalid_rows == 0 else ImportJob.Status.MAPPED
    job.save()
    return job


def _mapped(mapping: dict, field: str) -> bool:
    val = mapping.get(field)
    if isinstance(val, dict):
        return bool(val.get("header"))
    return bool(val)


@transaction.atomic
def commit_job(job: ImportJob) -> ImportJob:
    job = validate_job(job)
    if job.invalid_rows:
        raise RouteWiseError(
            "Fix row errors before committing this import.",
            code="IMPORT_HAS_ERRORS",
            details=job.validation_results,
        )
    path = Path(job.stored_path)
    _, rows = read_csv_bytes(path.read_bytes())
    mapping = job.confirmed_column_mapping or job.proposed_column_mapping.get("mapping") or {}
    district = job.district
    if job.import_type == "schools":
        _commit_schools(district, rows, mapping)
    elif job.import_type == "students":
        _commit_students(district, rows, mapping)
    elif job.import_type == "drivers":
        _commit_drivers(district, rows, mapping)
    elif job.import_type == "vehicles":
        _commit_vehicles(district, rows, mapping)
    elif job.import_type == "stops":
        _commit_stops(district, rows, mapping)
    job.status = ImportJob.Status.COMMITTED
    job.save(update_fields=["status", "updated_at"])
    return job


def errors_csv(job: ImportJob) -> str:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["row_number", "field", "error_code", "message"])
    for err in job.row_errors.all():
        writer.writerow([err.row_number, err.field, err.error_code, err.message])
    return output.getvalue()


def _commit_schools(district, rows, mapping):
    for row in rows:
        code = _cell(row, mapping, "school_id")
        stype = (_cell(row, mapping, "school_type") or "elementary").lower()
        if stype not in School.SchoolType.values:
            stype = School.SchoolType.ELEMENTARY
        bell = _parse_time(_cell(row, mapping, "morning_bell") or "08:00")
        dismissal = _parse_time(_cell(row, mapping, "dismissal") or "15:00")
        School.objects.update_or_create(
            district=district,
            school_code=code,
            defaults={
                "name": _cell(row, mapping, "name") or code,
                "school_type": stype,
                "address": _cell(row, mapping, "address") or "Unknown",
                "latitude": float(_cell(row, mapping, "latitude")),
                "longitude": float(_cell(row, mapping, "longitude")),
                "morning_bell_time": bell,
                "dismissal_time": dismissal,
                "is_active": _truthy(_cell(row, mapping, "is_active") or "true"),
            },
        )


def _commit_students(district, rows, mapping):
    schools = {s.school_code: s for s in district.schools.all()}
    # Approved stops for automatic nearest-stop assignment so imported
    # rosters are immediately routable (the CSV has no stop column).
    approved_stops = list(district.busstops.filter(is_approved=True))
    for row in rows:
        sid = _cell(row, mapping, "student_id")
        school = schools.get(_cell(row, mapping, "school_id"))
        if not school:
            continue
        elig = Student.Eligibility.ELIGIBLE if _truthy(_cell(row, mapping, "eligible") or "true") else Student.Eligibility.INELIGIBLE
        ride = _cell(row, mapping, "max_ride_minutes")
        student, _ = Student.objects.update_or_create(
            district=district,
            external_id=sid,
            defaults={
                "first_name": _cell(row, mapping, "first_name"),
                "last_name": _cell(row, mapping, "last_name"),
                "grade": _cell(row, mapping, "grade") or "K",
                "school": school,
                "home_address": _cell(row, mapping, "home_address") or "Unknown",
                "latitude": float(_cell(row, mapping, "latitude")),
                "longitude": float(_cell(row, mapping, "longitude")),
                "eligibility": elig,
                "requires_wheelchair": _truthy(_cell(row, mapping, "wheelchair")),
                "max_ride_time_override_minutes": int(ride) if ride else None,
                "is_active": True,
            },
        )
        _assign_nearest_stop(student, approved_stops)


def ensure_boarding_stops(district, students=None) -> list:
    """Give every student an AM stop so generate does not fail on import order.

    Uses approved stops if any exist. Otherwise creates an approved stop at
    each student's home.
    """
    students = list(
        students
        if students is not None
        else Student.objects.filter(district=district, is_active=True)
    )
    approved = list(district.busstops.filter(is_approved=True))
    if not approved:
        for student in students:
            if student.latitude is None or student.longitude is None:
                continue
            code = f"HOME-{(student.external_id or str(student.id))[:28]}"
            stop, _ = BusStop.objects.update_or_create(
                district=district,
                stop_code=code,
                defaults={
                    "name": student.home_address or f"{student.first_name}'s stop",
                    "address": student.home_address or "Home",
                    "latitude": student.latitude,
                    "longitude": student.longitude,
                    "is_approved": True,
                },
            )
            approved.append(stop)
    for student in students:
        _assign_nearest_stop(student, approved)
    return students


def _assign_nearest_stop(student, approved_stops) -> None:
    """Attach the student to their nearest approved stop for the morning run.

    Skips students who already have an active AM/both assignment so re-imports
    and manual assignments are preserved.
    """
    if not approved_stops:
        return
    if student.stop_assignments.filter(is_active=True, direction__in=("am", "both")).exists():
        return
    nearest = min(
        approved_stops,
        key=lambda s: haversine_km(student.latitude, student.longitude, s.latitude, s.longitude),
    )
    dist_km = haversine_km(student.latitude, student.longitude, nearest.latitude, nearest.longitude)
    StudentStopAssignment.objects.get_or_create(
        student=student,
        bus_stop=nearest,
        direction=StudentStopAssignment.Direction.AM,
        defaults={"walking_distance_m": int(dist_km * 1000), "is_active": True},
    )


def _commit_drivers(district, rows, mapping):
    for row in rows:
        email = _cell(row, mapping, "email").lower()
        user, _ = User.objects.get_or_create(
            email=email,
            defaults={
                "first_name": _cell(row, mapping, "first_name"),
                "last_name": _cell(row, mapping, "last_name"),
                "phone": _cell(row, mapping, "phone"),
                "role": UserRole.DRIVER,
                "district": district,
            },
        )
        if not user.has_usable_password():
            user.set_password(settings.DEMO_PASSWORD)
            user.save()
        exp = _cell(row, mapping, "license_expiration")
        endorsements = [p.strip() for p in _cell(row, mapping, "endorsements").replace("|", ",").split(",") if p.strip()]
        DriverProfile.objects.update_or_create(
            district=district,
            employee_id=_cell(row, mapping, "employee_id"),
            defaults={
                "user": user,
                "license_expiration": datetime.strptime(exp, "%Y-%m-%d").date() if exp else None,
                "endorsements": endorsements,
                "availability": _cell(row, mapping, "availability") or "weekday_am",
                "is_active": True,
            },
        )


def _commit_vehicles(district, rows, mapping):
    depots = {d.name.lower(): d for d in district.depots.all()}
    for row in rows:
        depot = depots.get(_cell(row, mapping, "depot_name").lower())
        wc = _cell(row, mapping, "wheelchair_capacity") or "0"
        Vehicle.objects.update_or_create(
            district=district,
            internal_number=_cell(row, mapping, "vehicle_number"),
            defaults={
                "license_plate": _cell(row, mapping, "license_plate") or slugify(_cell(row, mapping, "vehicle_number")),
                "capacity": int(_cell(row, mapping, "capacity")),
                "wheelchair_capacity": int(wc),
                "vehicle_type": "accessible" if int(wc) > 0 else (_cell(row, mapping, "vehicle_type") or "standard"),
                "status": _cell(row, mapping, "status") or "active",
                "depot": depot,
                "is_active": True,
            },
        )


def _commit_stops(district, rows, mapping):
    for row in rows:
        BusStop.objects.update_or_create(
            district=district,
            stop_code=_cell(row, mapping, "stop_id"),
            defaults={
                "name": _cell(row, mapping, "name"),
                "address": _cell(row, mapping, "address") or "Unknown",
                "latitude": float(_cell(row, mapping, "latitude")),
                "longitude": float(_cell(row, mapping, "longitude")),
                "is_approved": _truthy(_cell(row, mapping, "approved") or "true"),
                "accessibility": _cell(row, mapping, "accessibility"),
                "safety_notes": _cell(row, mapping, "safety_notes"),
            },
        )
    approved = list(district.busstops.filter(is_approved=True))
    for student in Student.objects.filter(district=district, is_active=True):
        _assign_nearest_stop(student, approved)


def _parse_time(value: str):
    from datetime import time

    for fmt in ("%H:%M", "%H:%M:%S", "%I:%M %p"):
        try:
            return datetime.strptime(value, fmt).time()
        except ValueError:
            continue
    return time(8, 0)
