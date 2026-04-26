import json
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Prefetch
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_http_methods

from .services.suggest_day import SuggestDayError, get_suggest_day_availability, suggest_day_from_ollama
from .models import (
    LiftCategory,
    LiftTemplate,
    SavedLift,
    TemplateLift,
    TrainingDay,
    TrainingDayLift,
    UserProfile,
)


SUGGEST_DAY_HISTORY_OPTIONS = {
    "none": {"days": 0, "label": "none"},
    "1w": {"days": 7, "label": "1 week"},
    "4w": {"days": 28, "label": "4 weeks"},
    "12w": {"days": 84, "label": "12 weeks"},
}


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
        "default_sets": lift.default_sets,
        "default_reps": lift.default_reps,
        "default_weight": float(lift.default_weight) if lift.default_weight is not None else None,
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


@require_http_methods(["DELETE"])
def lift_category_detail(request, category_id):
    category = get_object_or_404(LiftCategory, pk=category_id)
    category.delete()
    return JsonResponse({}, status=204)


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

    try:
        default_sets = _parse_positive_int(payload.get("default_sets"), "default_sets")
        default_reps = _parse_positive_int(payload.get("default_reps"), "default_reps")
        default_weight = _parse_non_negative_decimal(payload.get("default_weight"), "default_weight")
    except ValueError as error:
        return JsonResponse({"error": str(error)}, status=400)

    saved_lift = SavedLift.objects.create(
        name=lift_name,
        category=category,
        variation_of=variation_of,
        default_sets=default_sets,
        default_reps=default_reps,
        default_weight=default_weight,
    )
    return JsonResponse(_serialize_saved_lift(saved_lift), status=201)


@require_http_methods(["DELETE"])
def saved_lift_detail(request, lift_id):
    lift = get_object_or_404(SavedLift, pk=lift_id)
    lift.delete()
    return JsonResponse({}, status=204)


def _serialize_template_lift(lift: TemplateLift) -> dict:
    return {
        "id": lift.id,
        "saved_lift_id": lift.saved_lift_id,
        "name": lift.saved_lift.name if lift.saved_lift else lift.name,
        "sets": lift.sets,
        "reps": lift.reps,
        "weight": float(lift.weight) if lift.weight is not None else None,
        "sort_order": lift.sort_order,
    }


def _serialize_template_day(day: LiftTemplate) -> dict:
    return {
        "id": day.id,
        "name": day.name,
        "lifts": [_serialize_template_lift(lift) for lift in day.lifts.all()],
        "created_at": day.created_at.isoformat(),
    }


def _current_template_days() -> list[LiftTemplate]:
    return list(
        LiftTemplate.objects.prefetch_related(
            Prefetch(
                "lifts",
                queryset=TemplateLift.objects.select_related("saved_lift").order_by("sort_order", "id"),
            )
        ).order_by("name", "id")
    )


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

    validated_days: list[dict] = []
    for day_data in normalized_days:
        if not isinstance(day_data, dict):
            return JsonResponse({"error": "Each day must be an object."}, status=400)

        raw_day_id = day_data.get("id")
        day_id = None
        if raw_day_id not in (None, ""):
            try:
                day_id = int(raw_day_id)
            except (TypeError, ValueError):
                return JsonResponse({"error": "Day id must be an integer."}, status=400)

        day_name = str(day_data.get("name", "")).strip()
        if not day_name:
            return JsonResponse({"error": "Each day requires a non-empty 'name'."}, status=400)

        raw_lifts = day_data.get("lifts")
        if raw_lifts is None and isinstance(day_data.get("lift_ids"), list):
            raw_lifts = [{"saved_lift_id": lift_id} for lift_id in day_data["lift_ids"]]
        if not isinstance(raw_lifts, list):
            return JsonResponse({"error": "Each day requires a 'lifts' array."}, status=400)

        validated_lifts: list[dict] = []
        for index, lift_data in enumerate(raw_lifts):
            if not isinstance(lift_data, dict):
                return JsonResponse({"error": f"Lift at index {index} must be an object."}, status=400)

            raw_saved_lift_id = lift_data.get("saved_lift_id", lift_data.get("id"))
            try:
                saved_lift_id = int(raw_saved_lift_id)
                saved_lift = SavedLift.objects.get(pk=saved_lift_id)
            except (TypeError, ValueError):
                return JsonResponse({"error": f"Lift at index {index} requires a saved_lift_id."}, status=400)
            except SavedLift.DoesNotExist:
                return JsonResponse({"error": f"Unknown saved lift id: {raw_saved_lift_id}"}, status=400)

            try:
                sets = _parse_positive_int(lift_data.get("sets"), "sets")
                reps = _parse_positive_int(lift_data.get("reps"), "reps")
                weight = _parse_non_negative_decimal(lift_data.get("weight"), "weight")
            except ValueError as error:
                return JsonResponse(
                    {"error": f"Preset '{day_name}' lift '{saved_lift.name}': {error}"},
                    status=400,
                )

            validated_lifts.append(
                {
                    "saved_lift": saved_lift,
                    "name": saved_lift.name,
                    "sets": sets,
                    "reps": reps,
                    "weight": weight,
                }
            )

        validated_days.append({"id": day_id, "name": day_name, "lifts": validated_lifts})

    with transaction.atomic():
        for validated_day in validated_days:
            day_id = validated_day["id"]
            day_name = validated_day["name"]
            validated_lifts = validated_day["lifts"]

            if day_id is not None:
                day = LiftTemplate.objects.filter(pk=day_id).first()
                if day is None:
                    return JsonResponse({"error": f"Unknown preset day id: {day_id}"}, status=400)
            else:
                day = LiftTemplate.objects.filter(name__iexact=day_name).order_by("id").first()
                if day is None:
                    day = LiftTemplate.objects.create(name=day_name)

            if day.name != day_name:
                day.name = day_name
                day.save(update_fields=["name"])

            LiftTemplate.objects.filter(name__iexact=day_name).exclude(pk=day.pk).delete()
            day.lifts.all().delete()
            for sort_order, lift_data in enumerate(validated_lifts):
                TemplateLift.objects.create(
                    template=day,
                    saved_lift=lift_data["saved_lift"],
                    name=lift_data["name"],
                    sets=lift_data["sets"],
                    reps=lift_data["reps"],
                    weight=lift_data["weight"],
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
        "saved_lift_id": lift.saved_lift_id,
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
        "status": day.status,
        "intensity": day.intensity,
        "lifts": [_serialize_training_day_lift(lift) for lift in day.lifts.all()],
        "created_at": day.created_at.isoformat(),
        "updated_at": day.updated_at.isoformat(),
    }


def _profile_has_suggestion_inputs(profile: UserProfile) -> bool:
    return profile.height is not None and profile.weight is not None and profile.gender != UserProfile.GENDER_UNSPECIFIED


def _serialize_saved_lifts_grouped_by_tag() -> tuple[dict[str, list[dict]], dict[str, dict]]:
    saved_lifts = SavedLift.objects.select_related("category").order_by("category__name", "name", "id")
    grouped: dict[str, list[dict]] = {}
    by_name: dict[str, dict] = {}

    for lift in saved_lifts:
        tag_name = lift.category.name if lift.category else "Untagged"
        payload = {
            "id": lift.id,
            "name": lift.name,
            "default_sets": lift.default_sets,
            "default_reps": lift.default_reps,
            "default_weight": float(lift.default_weight) if lift.default_weight is not None else None,
        }
        grouped.setdefault(tag_name, []).append(payload)
        by_name[lift.name.strip().lower()] = {"id": lift.id, "name": lift.name}

    return grouped, by_name


def _serialize_preset_days_for_prompt() -> list[dict]:
    return [
        {
            "name": day.name,
            "lifts": [lift.saved_lift.name if lift.saved_lift else lift.name for lift in day.lifts.all()],
        }
        for day in _current_template_days()
    ]


def _serialize_history_for_prompt(target_date: date, history_days_back: int) -> list[dict]:
    if history_days_back <= 0:
        return []

    history_start = target_date - timedelta(days=history_days_back)
    days = (
        TrainingDay.objects
        .prefetch_related("lifts")
        .filter(
            date__lt=target_date,
            date__gte=history_start,
            status=TrainingDay.STATUS_COMPLETED,
        )
        .order_by("-date")
    )

    return [
        {
            "date": day.date.isoformat(),
            "name": day.name,
            "intensity": day.intensity,
            "lifts": [
                {
                    "name": lift.name,
                    "sets": lift.sets,
                    "reps": lift.reps,
                    "weight": float(lift.weight) if lift.weight is not None else None,
                    "notes": lift.notes,
                }
                for lift in day.lifts.all()
            ],
        }
        for day in days
    ]


def _serialize_suggested_day_lift(lift: dict) -> dict:
    return {
        "saved_lift_id": lift["saved_lift_id"],
        "name": lift["name"],
        "sets": lift["sets"],
        "reps": lift["reps"],
        "weight": lift["weight"],
        "notes": lift["notes"],
        "is_pr": False,
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


@require_http_methods(["GET"])
def suggest_day_status(request):
    profile = _current_user_profile()
    availability = get_suggest_day_availability()
    return JsonResponse(
        {
            "available": availability.available,
            "model_name": availability.model_name,
            "reason": availability.reason,
            "profile_complete": _profile_has_suggestion_inputs(profile),
        },
        status=200,
    )


@require_http_methods(["POST"])
def suggest_day(request):
    try:
        payload = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON body."}, status=400)

    raw_date = str(payload.get("date", "")).strip()
    if not raw_date:
        return JsonResponse({"error": "Suggested day date is required."}, status=400)

    try:
        target_date = date.fromisoformat(raw_date)
    except ValueError:
        return JsonResponse({"error": "date must be in YYYY-MM-DD format."}, status=400)

    history_window = str(payload.get("history_window", "4w")).strip().lower()
    history_config = SUGGEST_DAY_HISTORY_OPTIONS.get(history_window)
    if history_config is None:
        return JsonResponse(
            {"error": f"history_window must be one of {sorted(SUGGEST_DAY_HISTORY_OPTIONS.keys())}."},
            status=400,
        )

    wanted_day_type = str(payload.get("wanted_day_type", "")).strip()
    if not wanted_day_type:
        return JsonResponse({"error": "wanted_day_type is required."}, status=400)

    profile = _current_user_profile()
    if not _profile_has_suggestion_inputs(profile):
        return JsonResponse(
            {"error": "Save weight, height, and gender in Settings before using Suggest day."},
            status=400,
        )

    saved_lifts_by_tag, saved_lifts_by_name = _serialize_saved_lifts_grouped_by_tag()
    if not saved_lifts_by_name:
        return JsonResponse({"error": "Save at least one lift before using Suggest day."}, status=400)

    prompt_profile = {
        "weight_unit": profile.weight_unit,
        "height_unit": profile.height_unit,
        "height": float(profile.height) if profile.height is not None else None,
        "weight": float(profile.weight) if profile.weight is not None else None,
        "gender": profile.gender,
    }

    prompt_history = _serialize_history_for_prompt(target_date, history_config["days"])
    prompt_presets = _serialize_preset_days_for_prompt()

    try:
        suggestion = suggest_day_from_ollama(
            target_date=target_date.isoformat(),
            wanted_day_type=wanted_day_type,
            history_window_label=history_config["label"],
            profile=prompt_profile,
            saved_lifts_by_tag=saved_lifts_by_tag,
            preset_days=prompt_presets,
            history_days=prompt_history,
            saved_lifts_by_name=saved_lifts_by_name,
        )
    except SuggestDayError as error:
        return JsonResponse({"error": str(error)}, status=400)

    return JsonResponse(
        {
            "name": suggestion["name"],
            "status": suggestion["status"],
            "intensity": suggestion["intensity"],
            "summary": suggestion["summary"],
            "lifts": [_serialize_suggested_day_lift(lift) for lift in suggestion["lifts"]],
        },
        status=200,
    )


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

    status = str(payload.get("status", TrainingDay.STATUS_COMPLETED)).strip().lower()
    valid_statuses = {choice[0] for choice in TrainingDay.STATUS_CHOICES}
    if status not in valid_statuses:
        return JsonResponse(
            {"error": f"status must be one of {sorted(valid_statuses)}."},
            status=400,
        )

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

        saved_lift = None
        raw_saved_lift_id = lift_data.get("saved_lift_id")
        if raw_saved_lift_id not in (None, ""):
            try:
                saved_lift = SavedLift.objects.get(pk=int(raw_saved_lift_id))
            except (TypeError, ValueError):
                return JsonResponse({"error": f"Lift at index {index}: saved_lift_id must be an integer."}, status=400)
            except SavedLift.DoesNotExist:
                return JsonResponse({"error": f"Lift at index {index}: unknown saved_lift_id {raw_saved_lift_id}."}, status=400)

        lift_name = str(lift_data.get("name", saved_lift.name if saved_lift else "")).strip()
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
                "saved_lift": saved_lift,
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
                "status": status,
                "intensity": intensity,
            },
        )
        training_day.lifts.all().delete()
        for sort_order, lift_data in enumerate(validated_lifts):
            TrainingDayLift.objects.create(
                training_day=training_day,
                saved_lift=lift_data["saved_lift"],
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


@require_http_methods(["DELETE"])
def training_day_detail(request, day_id):
    training_day = get_object_or_404(TrainingDay, pk=day_id)
    training_day.delete()
    return JsonResponse({}, status=204)
