from django.core.management.base import BaseCommand
from django.db import transaction

from lifts.models import LiftCategory, LiftTemplate, SavedLift, TemplateLift


TAGGED_LIFTS = {
    "Deadlifts": [
        "Deadlift",
        "Raised Deadlift",
        "Trapbar Deadlift",
        "Deadlift From Blocks",
    ],
    "Squats": [
        "Hack Squat",
        "Vertical Squat",
        "Backsquat",
        "Belt Squat",
    ],
    "Bench": [
        "Bench",
        "Inch Bench",
        "DB Bench",
        "Smith Bench",
    ],
    "Rows": [
        "T-row",
        "Cable pulls",
        "Pulldown",
    ],
    "Accessories": [
        "Romanian Deadlift",
        "Hyperextension",
        "Reverse Hyper",
        "Farmers walk",
        "Arms",
        "Delts",
        "Grip",
        "Leg curl/ext/abdt",
        "Seated dips",
        "Abs",
    ],
}

PRESET_DAYS = [
    {
        "name": "Push&Pull Var1",
        "lifts": [
            "Smith Bench",
            "Pulldown",
            "Seated Dips",
            "Arms",
            "Delts",
        ],
    },
    {
        "name": "Push&Pull Var2",
        "lifts": [
            "DB Bench",
            "T-row",
            "Seated Dips",
            "Cable pulls",
        ],
    },
    {
        "name": "Core",
        "lifts": [
            "Romanian Deadlift",
            "Farmers walk",
            "reverse hyper",
            "Grip",
            "Abs",
        ],
    },
    {
        "name": "Pull",
        "lifts": [
            "Deadlift",
            "Belt Squat",
            "Arms",
            "Delts",
        ],
    },
    {
        "name": "Legs",
        "lifts": [
            "Hack Squat",
            "Trapbar Deadlift",
            "Vertical Squat",
            "Leg curl/ext/abdt",
        ],
    },
]


class Command(BaseCommand):
    help = "Replace all saved lifts and preset days with the current tagged default library."

    @transaction.atomic
    def handle(self, *args, **options):
        LiftTemplate.objects.all().delete()
        SavedLift.objects.all().delete()
        LiftCategory.objects.all().delete()

        saved_lifts_by_name: dict[str, SavedLift] = {}
        tag_count = 0

        for tag_name, lift_names in TAGGED_LIFTS.items():
            tag = LiftCategory.objects.create(name=tag_name)
            tag_count += 1

            for lift_name in lift_names:
                saved_lift = SavedLift.objects.create(name=lift_name, category=tag)
                saved_lifts_by_name[lift_name.strip().lower()] = saved_lift

        for preset_day in PRESET_DAYS:
            template = LiftTemplate.objects.create(name=preset_day["name"])
            for sort_order, lift_name in enumerate(preset_day["lifts"]):
                saved_lift = saved_lifts_by_name[lift_name.strip().lower()]
                TemplateLift.objects.create(
                    template=template,
                    saved_lift=saved_lift,
                    name=saved_lift.name,
                    sort_order=sort_order,
                )

        self.stdout.write(
            self.style.SUCCESS(
                f"Reset library with {len(saved_lifts_by_name)} lifts, {tag_count} tags, and {len(PRESET_DAYS)} preset days."
            )
        )
