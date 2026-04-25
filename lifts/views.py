import json
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_http_methods

from .models import (
    LiftCategory,
    LiftTemplate,
    SavedLift,
    TemplateLift,
    TrainingDay,
    TrainingDayLift,
    UserProfile,
)


@ensure_csrf_cookie
def index(request):
    return render(request, "lifts/index.html")


def _current_user_profile() -> UserProfile:
    profile, _ = UserProfile.objects.get_or_create(pk=1)
    return profile


def _serialize_user_profile(profile: UserProfile) -> dict:
    return {
        "id": profile.id,
        "weight_unit": profile.weight_unit,
        "height_unit": profile.height_unit,
        "height": float(profile.height) if profile.height is not None else None,
        "weight": float(profile.weight) if profile.weight is not None else None,
        "gender": profile.gender,
        "created_at": profile.created_at.isoformat(),
        "updated_at": profile.updated_at.isoformat(),
    }


@require_http_methods(["GET", "POST"])
def user_profile(request):
    if request.method == "GET":
        profile = _current_user_profile()
        return JsonResponse(_serialize_user_profile(profile), status=200)

    try:
        payload = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON body."}, status=400)

    weight_unit = str(payload.get("weight_unit", UserProfile.WEIGHT_UNIT_KG)).strip().lower()
    valid_weight_units = {choice[0] for choice in UserProfile.WEIGHT_UNIT_CHOICES}
    if weight_unit not in valid_weight_units:
        return JsonResponse({"error": f"weight_unit must be one of {sorted(valid_weight_units)}."}, status=400)

    height_unit = str(payload.get("height_unit", UserProfile.HEIGHT_UNIT_CM)).strip().lower()
    valid_height_units = {choice[0] for choice in UserProfile.HEIGHT_UNIT_CHOICES}
    if height_unit not in valid_height_units:
        return JsonResponse({"error": f"height_unit must be one of {sorted(valid_height_units)}."}, status=400)

    gender = str(payload.get("gender", UserProfile.GENDER_UNSPECIFIED)).strip().lower()
    valid_genders = {choice[0] for choice in UserProfile.GENDER_CHOICES}
    if gender not in valid_genders:
        return JsonResponse({"error": f"gender must be one of {sorted(valid_genders)}."}, status=400)

    try:
        height = _parse_non_negative_decimal(payload.get("height"), "height")
        weight = _parse_non_negative_decimal(payload.get("weight"), "weight")
    except ValueError as error:
        return JsonResponse({"error": str(error)}, status=400)

    profile = _current_user_profile()
    profile.weight_unit = weight_unit
    profile.height_unit = height_unit
    profile.height = height
    profile.weight = weight
    profile.gender = gender
    profile.save()

    return JsonResponse(_serialize_user_profile(profile), status=200)


def _serialize_saved_lift(lift: SavedLift) -> dict:
    return {
        "id": lift.id,
        "name": lift.name,
        "category": (
            {"id": lift.category.id, "name": lift.category.name}
            if lift.category
            else None
        ),
        "variation_of": (
            {"id": lift.variation_of.id, "name": lift.variation_of.name}
            if lift.variation_of
            else None
        ),
        "created_at": lift.created_at.isoformat(),
    }


@require_http_methods(["GET", "POST"])
def lift_category_collection(request):
    if request.method == "GET":
        categories = LiftCategory.objects.order_by("name", "id")
        return JsonResponse(
            {
                "categories": [
                    {
                        "id": category.id,
                        "name": category.name,
                        "created_at": category.created_at.isoformat(),
                    }
                    for category in categories
                ]
            },
            status=200,
        )

    try:
        payload = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON body."}, status=400)

    category_name = str(payload.get("name", "")).strip()
    if not category_name:
        return JsonResponse({"error": "Category name is required."}, status=400)

    category, _ = LiftCategory.objects.get_or_create(name=category_name)
    return JsonResponse(
        {
            "id": category.id,
            "name": category.name,
            "created_at": category.created_at.isoformat(),
        },
        status=201,
    )


@require_http_methods(["GET", "POST"])
def saved_lift_collection(request):
    if request.method == "GET":
        saved_lifts = SavedLift.objects.select_related("category", "variation_of").order_by("name", "id")
        return JsonResponse(
            {
                "lifts": [_serialize_saved_lift(lift) for lift in saved_lifts]
            },
            status=200,
        )

    try:
        payload = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON body."}, status=400)

    lift_name = str(payload.get("name", "")).strip()
    if not lift_name:
        return JsonResponse({"error": "Lift name is required."}, status=400)

    category_id = payload.get("category_id")
    category = None
    if category_id not in (None, ""):
        try:
            category = LiftCategory.objects.get(pk=int(category_id))
        except (LiftCategory.DoesNotExist, TypeError, ValueError):
            return JsonResponse({"error": "Invalid category_id."}, status=400)

    variation_of_id = payload.get("variation_of_id")
    variation_of = None
    if variation_of_id not in (None, ""):
        try:
            variation_of = SavedLift.objects.get(pk=int(variation_of_id))
        except (SavedLift.DoesNotExist, TypeError, ValueError):
            return JsonResponse({"error": "Invalid variation_of_id."}, status=400)

    if category is None and variation_of is not None:
        category = variation_of.category

    saved_lift = SavedLift.objects.create(name=lift_name, category=category, variation_of=variation_of)
    return JsonResponse(_serialize_saved_lift(saved_lift), status=201)


@require_http_methods(["DELETE"])
def saved_lift_detail(request, lift_id):
    lift = get_object_or_404(SavedLift, pk=lift_id)
    lift.delete()
    return JsonResponse({}, status=204)


def _serialize_template_day(day: LiftTemplate) -> dict:
    return {
        "id": day.id,
        "name": day.name,
        "lifts": [
            {
                "id": lift.id,
                "name": lift.name,
                "sort_order": lift.sort_order,
            }
            for lift in day.lifts.all()
        ],
        "created_at": day.created_at.isoformat(),
    }


def _current_template_days() -> list[LiftTemplate]:
    days = LiftTemplate.objects.prefetch_related("lifts").order_by("name", "-created_at", "-id")
    unique_by_name: dict[str, LiftTemplate] = {}
    for day in days:
        normalized_name = day.name.strip().lower()
        if normalized_name not in unique_by_name:
            unique_by_name[normalized_name] = day
    return sorted(unique_by_name.values(), key=lambda day: day.name.lower())


@require_http_methods(["GET", "POST"])
def lift_template_collection(request):
    if request.method == "GET":
        current_days = _current_template_days()
        return JsonResponse({"days": [_serialize_template_day(day) for day in current_days]}, status=200)

    try:
        payload = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON body."}, status=400)

    day_payloads = payload.get("days")
    if isinstance(day_payloads, list):
        normalized_days = day_payloads
    elif "name" in payload and "lift_ids" in payload:
        normalized_days = [payload]
    else:
        return JsonResponse({"error": "Payload must include 'days' or ('name' and 'lift_ids')."}, status=400)

    validated_days: list[tuple[str, list[int], dict[int, SavedLift]]] = []
    for day_data in normalized_days:
        day_name = str(day_data.get("name", "")).strip()
        if not day_name:
            return JsonResponse({"error": "Each day requires a non-empty 'name'."}, status=400)

        lift_ids_raw = day_data.get("lift_ids")
        if not isinstance(lift_ids_raw, list):
            return JsonResponse({"error": "Each day requires a 'lift_ids' array."}, status=400)

        try:
            lift_ids = [int(lift_id) for lift_id in lift_ids_raw]
        except (TypeError, ValueError):
            return JsonResponse({"error": "lift_ids must contain integers."}, status=400)

        saved_lifts = SavedLift.objects.filter(id__in=lift_ids)
        saved_lifts_by_id = {lift.id: lift for lift in saved_lifts}
        missing_ids = [lift_id for lift_id in lift_ids if lift_id not in saved_lifts_by_id]
        if missing_ids:
            return JsonResponse({"error": f"Unknown lift ids: {missing_ids}"}, status=400)

        validated_days.append((day_name, lift_ids, saved_lifts_by_id))

    with transaction.atomic():
        for day_name, lift_ids, saved_lifts_by_id in validated_days:
            day_queryset = LiftTemplate.objects.filter(name__iexact=day_name).order_by("-created_at", "-id")
            day = day_queryset.first()
            if day is None:
                day = LiftTemplate.objects.create(name=day_name)
            else:
                if day.name != day_name:
                    day.name = day_name
                    day.save(update_fields=["name"])
                day_queryset.exclude(pk=day.pk).delete()

            day.lifts.all().delete()
            for sort_order, lift_id in enumerate(lift_ids):
                TemplateLift.objects.create(
                    template=day,
                    name=saved_lifts_by_id[lift_id].name,
                    sort_order=sort_order,
                )

    current_days = _current_template_days()
    return JsonResponse({"days": [_serialize_template_day(day) for day in current_days]}, status=200)


@require_http_methods(["DELETE"])
def lift_template_detail(request, day_id):
    day = get_object_or_404(LiftTemplate, pk=day_id)
    day.delete()
    return JsonResponse({}, status=204)


def _serialize_training_day_lift(lift: TrainingDayLift) -> dict:
    return {
        "id": lift.id,
        "name": lift.name,
        "sets": lift.sets,
        "reps": lift.reps,
        "weight": float(lift.weight) if lift.weight is not None else None,
        "is_pr": lift.is_pr,
        "notes": lift.notes,
        "sort_order": lift.sort_order,
    }


def _serialize_training_day(day: TrainingDay) -> dict:
    return {
        "id": day.id,
        "date": day.date.isoformat(),
        "name": day.name,
        "intensity": day.intensity,
        "lifts": [_serialize_training_day_lift(lift) for lift in day.lifts.all()],
        "created_at": day.created_at.isoformat(),
        "updated_at": day.updated_at.isoformat(),
    }


def _parse_training_month(month_value: str | None) -> date:
    if not month_value:
        today = date.today()
        return date(today.year, today.month, 1)

    try:
        parsed = datetime.strptime(month_value, "%Y-%m")
    except ValueError:
        raise ValueError("Month must be in YYYY-MM format.")
    return date(parsed.year, parsed.month, 1)


def _next_month_start(current_month: date) -> date:
    if current_month.month == 12:
        return date(current_month.year + 1, 1, 1)
    return date(current_month.year, current_month.month + 1, 1)


def _parse_positive_int(value, field_name: str) -> int | None:
    if value in (None, ""):
        return None
    try:
        parsed_value = int(value)
    except (TypeError, ValueError):
        raise ValueError(f"{field_name} must be an integer.")
    if parsed_value < 1:
        raise ValueError(f"{field_name} must be >= 1.")
    return parsed_value


def _parse_non_negative_decimal(value, field_name: str) -> Decimal | None:
    if value in (None, ""):
        return None
    try:
        parsed_value = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError(f"{field_name} must be a number.")
    if parsed_value < 0:
        raise ValueError(f"{field_name} must be >= 0.")
    return parsed_value


@require_http_methods(["GET", "POST"])
def training_day_collection(request):
    if request.method == "GET":
        try:
            month_start = _parse_training_month(request.GET.get("month"))
        except ValueError as error:
            return JsonResponse({"error": str(error)}, status=400)

        month_end = _next_month_start(month_start)
        training_days = (
            TrainingDay.objects
            .prefetch_related("lifts")
            .filter(date__gte=month_start, date__lt=month_end)
            .order_by("date")
        )
        return JsonResponse(
            {"days": [_serialize_training_day(training_day) for training_day in training_days]},
            status=200,
        )

    try:
        payload = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON body."}, status=400)

    raw_date = str(payload.get("date", "")).strip()
    if not raw_date:
        return JsonResponse({"error": "Training day date is required."}, status=400)

    try:
        training_date = date.fromisoformat(raw_date)
    except ValueError:
        return JsonResponse({"error": "date must be in YYYY-MM-DD format."}, status=400)

    day_name = str(payload.get("name", "")).strip()
    if not day_name:
        return JsonResponse({"error": "Training day name is required."}, status=400)

    intensity = str(payload.get("intensity", TrainingDay.INTENSITY_NON_RELEVANT)).strip().lower()
    valid_intensities = {choice[0] for choice in TrainingDay.INTENSITY_CHOICES}
    if intensity not in valid_intensities:
        return JsonResponse(
            {"error": f"intensity must be one of {sorted(valid_intensities)}."},
            status=400,
        )

    lift_payloads = payload.get("lifts", [])
    if not isinstance(lift_payloads, list):
        return JsonResponse({"error": "lifts must be an array."}, status=400)

    validated_lifts: list[dict] = []
    for index, lift_data in enumerate(lift_payloads):
        if not isinstance(lift_data, dict):
            return JsonResponse({"error": f"Lift at index {index} must be an object."}, status=400)

        lift_name = str(lift_data.get("name", "")).strip()
        if not lift_name:
            return JsonResponse({"error": f"Lift at index {index} requires a name."}, status=400)

        try:
            sets = _parse_positive_int(lift_data.get("sets"), "sets")
            reps = _parse_positive_int(lift_data.get("reps"), "reps")
            weight = _parse_non_negative_decimal(lift_data.get("weight"), "weight")
        except ValueError as error:
            return JsonResponse({"error": f"Lift '{lift_name}': {error}"}, status=400)

        is_pr = lift_data.get("is_pr", False)
        if not isinstance(is_pr, bool):
            return JsonResponse(
                {"error": f"Lift '{lift_name}': is_pr must be true or false."},
                status=400,
            )

        raw_notes = lift_data.get("notes", "")
        if raw_notes is None:
            notes = ""
        elif isinstance(raw_notes, str):
            notes = raw_notes.strip()
        else:
            return JsonResponse(
                {"error": f"Lift '{lift_name}': notes must be a string."},
                status=400,
            )

        validated_lifts.append(
            {
                "name": lift_name,
                "sets": sets,
                "reps": reps,
                "weight": weight,
                "is_pr": is_pr,
                "notes": notes,
            }
        )

    with transaction.atomic():
        training_day, created = TrainingDay.objects.update_or_create(
            date=training_date,
            defaults={
                "name": day_name,
                "intensity": intensity,
            },
        )
        training_day.lifts.all().delete()
        for sort_order, lift_data in enumerate(validated_lifts):
            TrainingDayLift.objects.create(
                training_day=training_day,
                name=lift_data["name"],
                sets=lift_data["sets"],
                reps=lift_data["reps"],
                weight=lift_data["weight"],
                is_pr=lift_data["is_pr"],
                notes=lift_data["notes"],
                sort_order=sort_order,
            )

    training_day = TrainingDay.objects.prefetch_related("lifts").get(pk=training_day.pk)
    return JsonResponse(
        _serialize_training_day(training_day),
        status=201 if created else 200,
    )
