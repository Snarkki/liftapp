from django.core.management.base import BaseCommand
from django.db import transaction

from lifts.models import LiftTemplate, SavedLift, TemplateLift


LIFT_LIBRARY = [
    {"name": "Bench Press", "default_sets": 4, "default_reps": 6},
    {"name": "Incline Dumbbell Press", "default_sets": 3, "default_reps": 8},
    {"name": "Overhead Press", "default_sets": 3, "default_reps": 6},
    {"name": "Dumbbell Lateral Raise", "default_sets": 3, "default_reps": 15},
    {"name": "Cable Triceps Pushdown", "default_sets": 3, "default_reps": 12},
    {"name": "Chest Fly", "default_sets": 3, "default_reps": 12},
    {"name": "Deadlift", "default_sets": 4, "default_reps": 5},
    {"name": "Pull-Up", "default_sets": 4, "default_reps": 8},
    {"name": "Barbell Row", "default_sets": 4, "default_reps": 8},
    {"name": "Seated Cable Row", "default_sets": 3, "default_reps": 10},
    {"name": "Face Pull", "default_sets": 3, "default_reps": 15},
    {"name": "Dumbbell Curl", "default_sets": 3, "default_reps": 12},
    {"name": "Hyperextensions"},
    {"name": "Back Squat", "default_sets": 4, "default_reps": 6},
    {"name": "Romanian Deadlift", "default_sets": 4, "default_reps": 8},
    {"name": "Leg Press", "default_sets": 3, "default_reps": 10},
    {"name": "Leg Curl", "default_sets": 3, "default_reps": 12},
    {"name": "Leg Extension", "default_sets": 3, "default_reps": 12},
    {"name": "Standing Calf Raise", "default_sets": 4, "default_reps": 15},
]

PRESET_DAYS = [
    {
        "name": "Push Day",
        "lifts": [
            {"name": "Bench Press", "sets": 4, "reps": 6},
            {"name": "Incline Dumbbell Press", "sets": 3, "reps": 8},
            {"name": "Overhead Press", "sets": 3, "reps": 6},
            {"name": "Dumbbell Lateral Raise", "sets": 3, "reps": 15},
            {"name": "Cable Triceps Pushdown", "sets": 3, "reps": 12},
        ],
    },
    {
        "name": "Pull Day",
        "lifts": [
            {"name": "Deadlift", "sets": 4, "reps": 5},
            {"name": "Pull-Up", "sets": 4, "reps": 8},
            {"name": "Barbell Row", "sets": 4, "reps": 8},
            {"name": "Seated Cable Row", "sets": 3, "reps": 10},
            {"name": "Face Pull", "sets": 3, "reps": 15},
            {"name": "Dumbbell Curl", "sets": 3, "reps": 12},
            {"name": "Hyperextensions"},
        ],
    },
    {
        "name": "Leg Day",
        "lifts": [
            {"name": "Back Squat", "sets": 4, "reps": 6},
            {"name": "Romanian Deadlift", "sets": 4, "reps": 8},
            {"name": "Leg Press", "sets": 3, "reps": 10},
            {"name": "Leg Curl", "sets": 3, "reps": 12},
            {"name": "Leg Extension", "sets": 3, "reps": 12},
            {"name": "Standing Calf Raise", "sets": 4, "reps": 15},
        ],
    },
]


class Command(BaseCommand):
    help = "Seed a typical lift library and Push/Pull/Legs preset days."

    @transaction.atomic
    def handle(self, *args, **options):
        saved_lifts_by_name: dict[str, SavedLift] = {}
        created_lift_count = 0

        for lift_data in LIFT_LIBRARY:
            lift, created = SavedLift.objects.update_or_create(
                name=lift_data["name"],
                defaults={
                    "default_sets": lift_data.get("default_sets"),
                    "default_reps": lift_data.get("default_reps"),
                    "default_weight": lift_data.get("default_weight"),
                },
            )
            saved_lifts_by_name[lift.name] = lift
            if created:
                created_lift_count += 1

        created_template_count = 0
        updated_template_count = 0

        for preset_day in PRESET_DAYS:
            template, created = LiftTemplate.objects.get_or_create(name=preset_day["name"])
            if created:
                created_template_count += 1
            else:
                updated_template_count += 1

            template.lifts.all().delete()
            for sort_order, lift_data in enumerate(preset_day["lifts"]):
                saved_lift = saved_lifts_by_name[lift_data["name"]]
                TemplateLift.objects.create(
                    template=template,
                    saved_lift=saved_lift,
                    name=saved_lift.name,
                    sets=lift_data.get("sets"),
                    reps=lift_data.get("reps"),
                    weight=lift_data.get("weight"),
                    sort_order=sort_order,
                )

        self.stdout.write(
            self.style.SUCCESS(
                "Seeded lift library and preset days: "
                f"{len(saved_lifts_by_name)} total lifts, "
                f"{created_lift_count} newly created lifts, "
                f"{created_template_count} created preset days, "
                f"{updated_template_count} refreshed preset days."
            )
        )
