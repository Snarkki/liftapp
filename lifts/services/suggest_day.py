import json
import os
from dataclasses import dataclass
from typing import Any
from urllib import error, request


OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_SUGGEST_MODEL", "gemma4")
OLLAMA_TIMEOUT_SECONDS = float(os.getenv("OLLAMA_TIMEOUT_SECONDS", "60"))

VALID_INTENSITIES = {"minor", "medium", "high", "non-relevant"}


class SuggestDayError(Exception):
    pass


@dataclass(frozen=True)
class SuggestDayAvailability:
    available: bool
    model_name: str | None
    reason: str | None


def _ollama_json_request(path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    req = request.Request(
        f"{OLLAMA_BASE_URL}{path}",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST" if payload is not None else "GET",
    )

    try:
        with request.urlopen(req, timeout=OLLAMA_TIMEOUT_SECONDS) as response:
            return json.loads(response.read().decode("utf-8"))
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore").strip()
        raise SuggestDayError(detail or f"Ollama returned HTTP {exc.code}.") from exc
    except error.URLError as exc:
        raise SuggestDayError("Ollama is not reachable on this server.") from exc


def get_suggest_day_availability() -> SuggestDayAvailability:
    try:
        payload = _ollama_json_request("/api/tags")
    except SuggestDayError as exc:
        return SuggestDayAvailability(available=False, model_name=None, reason=str(exc))

    models = payload.get("models", [])
    if not isinstance(models, list):
        return SuggestDayAvailability(
            available=False,
            model_name=None,
            reason="Ollama returned an unexpected model list.",
        )

    for model in models:
        if not isinstance(model, dict):
            continue
        model_name = str(model.get("model") or model.get("name") or "").strip()
        if model_name == OLLAMA_MODEL or model_name.startswith(f"{OLLAMA_MODEL}:"):
            return SuggestDayAvailability(available=True, model_name=model_name, reason=None)

    return SuggestDayAvailability(
        available=False,
        model_name=None,
        reason=f"{OLLAMA_MODEL} is not installed in Ollama.",
    )


def _build_prompt(
    *,
    target_date: str,
    wanted_day_type: str,
    history_window_label: str,
    profile: dict[str, Any],
    saved_lifts_by_tag: dict[str, list[dict[str, Any]]],
    preset_days: list[dict[str, Any]],
    history_days: list[dict[str, Any]],
) -> str:
    return (
        "You are planning a training day for a lifting app.\n"
        "Return ONLY valid JSON with no markdown fences, prose, or extra keys.\n\n"
        "Output format:\n"
        "{\n"
        '  "name": "string",\n'
        '  "status": "planned",\n'
        '  "intensity": "minor" | "medium" | "high" | "non-relevant",\n'
        '  "summary": "short explanation",\n'
        '  "lifts": [\n'
        "    {\n"
        '      "saved_lift_name": "exact saved lift name from allowed list",\n'
        '      "sets": integer or null,\n'
        '      "reps": integer or null,\n'
        '      "weight": number or null,\n'
        '      "notes": "short optional note or empty string"\n'
        "    }\n"
        "  ]\n"
        "}\n\n"
        "Rules:\n"
        '- Use only saved lifts from the allowed list and copy each "saved_lift_name" exactly.\n'
        '- Keep status as "planned".\n'
        '- Include 3 to 6 lifts.\n'
        '- Use set/rep/weight suggestions only when they make sense; null is allowed.\n'
        '- Keep notes short and practical.\n'
        '- Use the requested day type as the main theme.\n'
        '- Use the user profile and history to keep the suggestion realistic.\n\n'
        f"Target date: {target_date}\n"
        f"Requested day type: {wanted_day_type}\n"
        f"History window chosen by user: {history_window_label}\n"
        f"User profile: {json.dumps(profile, ensure_ascii=True)}\n"
        f"Allowed saved lifts grouped by tag: {json.dumps(saved_lifts_by_tag, ensure_ascii=True)}\n"
        f"Saved preset days: {json.dumps(preset_days, ensure_ascii=True)}\n"
        f"Recent completed history to consider: {json.dumps(history_days, ensure_ascii=True)}\n"
    )


def _parse_optional_generated_int(value: Any, field_name: str) -> int | None:
    if value in (None, ""):
        return None

    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise SuggestDayError(f"Suggested day field '{field_name}' must be an integer or null.") from exc

    if parsed < 1:
        raise SuggestDayError(f"Suggested day field '{field_name}' must be at least 1.")

    return parsed


def _parse_optional_generated_weight(value: Any) -> float | None:
    if value in (None, ""):
        return None

    try:
        parsed = float(value)
    except (TypeError, ValueError) as exc:
        raise SuggestDayError("Suggested day weight must be a number or null.") from exc

    if parsed < 0:
        raise SuggestDayError("Suggested day weight must be 0 or greater.")

    return parsed


def suggest_day_from_ollama(
    *,
    target_date: str,
    wanted_day_type: str,
    history_window_label: str,
    profile: dict[str, Any],
    saved_lifts_by_tag: dict[str, list[dict[str, Any]]],
    preset_days: list[dict[str, Any]],
    history_days: list[dict[str, Any]],
    saved_lifts_by_name: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    availability = get_suggest_day_availability()
    if not availability.available:
        raise SuggestDayError(availability.reason or "Ollama suggestion model is unavailable.")

    prompt = _build_prompt(
        target_date=target_date,
        wanted_day_type=wanted_day_type,
        history_window_label=history_window_label,
        profile=profile,
        saved_lifts_by_tag=saved_lifts_by_tag,
        preset_days=preset_days,
        history_days=history_days,
    )

    payload = _ollama_json_request(
        "/api/generate",
        {
            "model": availability.model_name or OLLAMA_MODEL,
            "prompt": prompt,
            "format": "json",
            "stream": False,
            "options": {"temperature": 0.2},
        },
    )

    raw_response = payload.get("response")
    if not isinstance(raw_response, str) or not raw_response.strip():
        raise SuggestDayError("Ollama did not return a suggestion payload.")

    try:
        parsed = json.loads(raw_response)
    except json.JSONDecodeError as exc:
        raise SuggestDayError("Ollama returned invalid JSON for the suggested day.") from exc

    name = str(parsed.get("name", "")).strip()
    if not name:
        raise SuggestDayError("Suggested day name was missing.")

    intensity = str(parsed.get("intensity", "")).strip().lower()
    if intensity not in VALID_INTENSITIES:
        raise SuggestDayError("Suggested day intensity was invalid.")

    summary = str(parsed.get("summary", "")).strip()
    raw_lifts = parsed.get("lifts")
    if not isinstance(raw_lifts, list) or len(raw_lifts) == 0:
        raise SuggestDayError("Suggested day did not include any lifts.")

    normalized_lifts: list[dict[str, Any]] = []
    for index, lift in enumerate(raw_lifts):
        if not isinstance(lift, dict):
            raise SuggestDayError(f"Suggested lift #{index + 1} was not an object.")

        saved_lift_name = str(lift.get("saved_lift_name", "")).strip()
        if not saved_lift_name:
            raise SuggestDayError(f"Suggested lift #{index + 1} did not include saved_lift_name.")

        matching_lift = saved_lifts_by_name.get(saved_lift_name.lower())
        if matching_lift is None:
            raise SuggestDayError(f"Suggested lift '{saved_lift_name}' is not in the saved lift library.")

        sets = _parse_optional_generated_int(lift.get("sets"), "sets")
        reps = _parse_optional_generated_int(lift.get("reps"), "reps")
        weight = _parse_optional_generated_weight(lift.get("weight"))
        notes = lift.get("notes", "")

        normalized_lifts.append(
            {
                "saved_lift_id": matching_lift["id"],
                "name": matching_lift["name"],
                "sets": sets,
                "reps": reps,
                "weight": weight,
                "notes": str(notes).strip() if notes is not None else "",
            }
        )

    return {
        "name": name,
        "status": "planned",
        "intensity": intensity,
        "summary": summary,
        "lifts": normalized_lifts,
    }
