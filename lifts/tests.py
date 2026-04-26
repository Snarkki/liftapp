import json
from unittest.mock import patch

from django.core.management import call_command
from django.test import TestCase, override_settings
from django.urls import reverse

from .models import LiftCategory, LiftTemplate, SavedLift, TemplateLift, TrainingDay, UserProfile
from .services.suggest_day import SuggestDayAvailability


@override_settings(SECURE_SSL_REDIRECT=False, SESSION_COOKIE_SECURE=False, CSRF_COOKIE_SECURE=False)
class ApiTestCase(TestCase):
    pass


class LiftCategoryApiTests(ApiTestCase):
    def test_create_and_list_categories(self):
        create_response = self.client.post(
            reverse("lifts:lift-category-collection"),
            data=json.dumps({"name": "Compound"}),
            content_type="application/json",
        )

        self.assertEqual(create_response.status_code, 201)
        self.assertEqual(LiftCategory.objects.count(), 1)

        list_response = self.client.get(reverse("lifts:lift-category-collection"))
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(len(list_response.json()["categories"]), 1)

    def test_delete_category(self):
        category = LiftCategory.objects.create(name="Bench")
        lift = SavedLift.objects.create(name="Bench", category=category)

        response = self.client.delete(reverse("lifts:lift-category-detail", kwargs={"category_id": category.id}))

        self.assertEqual(response.status_code, 204)
        lift.refresh_from_db()
        self.assertIsNone(lift.category)


class SavedLiftApiTests(ApiTestCase):
    def test_create_lift_with_category_and_defaults(self):
        category = LiftCategory.objects.create(name="Pull")

        response = self.client.post(
            reverse("lifts:saved-lift-collection"),
            data=json.dumps(
                {
                    "name": "Deadlift",
                    "category_id": category.id,
                    "default_sets": 4,
                    "default_reps": 5,
                    "default_weight": 180,
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(SavedLift.objects.count(), 1)
        payload = response.json()
        self.assertEqual(payload["name"], "Deadlift")
        self.assertEqual(payload["category"]["name"], "Pull")
        self.assertEqual(payload["default_sets"], 4)
        self.assertEqual(payload["default_reps"], 5)
        self.assertEqual(payload["default_weight"], 180.0)

    def test_create_lift_rejects_invalid_category(self):
        response = self.client.post(
            reverse("lifts:saved-lift-collection"),
            data=json.dumps({"name": "Deadlift", "category_id": 9999}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)

    def test_create_lift_variation(self):
        base_lift = SavedLift.objects.create(name="Deadlift")

        response = self.client.post(
            reverse("lifts:saved-lift-collection"),
            data=json.dumps({"name": "Paused Deadlift", "variation_of_id": base_lift.id}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(payload["variation_of"]["id"], base_lift.id)
        self.assertEqual(payload["variation_of"]["name"], "Deadlift")

    def test_delete_saved_lift(self):
        lift = SavedLift.objects.create(name="Deadlift")

        response = self.client.delete(reverse("lifts:saved-lift-detail", kwargs={"lift_id": lift.id}))

        self.assertEqual(response.status_code, 204)
        self.assertEqual(SavedLift.objects.count(), 0)


class LiftTemplateApiTests(ApiTestCase):
    def test_save_and_get_template_days(self):
        deadlift = SavedLift.objects.create(name="Deadlift", default_sets=4, default_reps=5)
        row = SavedLift.objects.create(name="Barbell Row")

        save_response = self.client.post(
            reverse("lifts:lift-template-collection"),
            data=json.dumps(
                {
                    "days": [
                        {
                            "name": "Pull Day",
                            "lifts": [
                                {
                                    "saved_lift_id": deadlift.id,
                                    "sets": 4,
                                    "reps": 5,
                                    "weight": 180,
                                },
                                {"saved_lift_id": row.id},
                            ],
                        },
                        {"name": "Back Day", "lifts": [{"saved_lift_id": row.id, "sets": 3, "reps": 8}]},
                    ]
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(save_response.status_code, 200)
        self.assertEqual(LiftTemplate.objects.count(), 2)
        self.assertEqual(len(save_response.json()["days"]), 2)

        list_response = self.client.get(reverse("lifts:lift-template-collection"))
        self.assertEqual(list_response.status_code, 200)
        payload = list_response.json()
        self.assertEqual(len(payload["days"]), 2)

        pull_day = next(day for day in payload["days"] if day["name"] == "Pull Day")
        self.assertEqual(pull_day["lifts"][0]["saved_lift_id"], deadlift.id)
        self.assertEqual(pull_day["lifts"][0]["name"], "Deadlift")
        self.assertEqual(pull_day["lifts"][0]["sets"], 4)
        self.assertEqual(pull_day["lifts"][0]["weight"], 180.0)

    def test_template_rejects_unknown_lift_id(self):
        response = self.client.post(
            reverse("lifts:lift-template-collection"),
            data=json.dumps({"days": [{"name": "Pull Day", "lifts": [{"saved_lift_id": 12345}]}]}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)

    def test_delete_template_day(self):
        day = LiftTemplate.objects.create(name="Pull Day")

        response = self.client.delete(reverse("lifts:lift-template-detail", kwargs={"day_id": day.id}))

        self.assertEqual(response.status_code, 204)
        self.assertEqual(LiftTemplate.objects.count(), 0)


class TrainingDayApiTests(ApiTestCase):
    def test_create_and_list_training_day(self):
        deadlift = SavedLift.objects.create(name="Deadlift")
        row = SavedLift.objects.create(name="Barbell Row")

        save_response = self.client.post(
            reverse("lifts:training-day-collection"),
            data=json.dumps(
                {
                    "date": "2026-02-03",
                    "name": "Pull Day",
                    "status": "completed",
                    "intensity": "medium",
                    "lifts": [
                        {
                            "saved_lift_id": deadlift.id,
                            "name": "Deadlift",
                            "sets": 4,
                            "reps": 5,
                            "weight": 180,
                            "is_pr": True,
                            "notes": "Felt very strong today.",
                        },
                        {
                            "saved_lift_id": row.id,
                            "name": "Barbell Row",
                            "sets": 3,
                            "reps": 8,
                            "weight": 90,
                        },
                    ],
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(save_response.status_code, 201)
        self.assertEqual(TrainingDay.objects.count(), 1)
        created_payload = save_response.json()
        self.assertEqual(created_payload["name"], "Pull Day")
        self.assertEqual(created_payload["status"], "completed")
        self.assertEqual(created_payload["intensity"], "medium")
        self.assertEqual(created_payload["lifts"][0]["saved_lift_id"], deadlift.id)
        self.assertEqual(created_payload["lifts"][0]["is_pr"], True)
        self.assertEqual(created_payload["lifts"][0]["notes"], "Felt very strong today.")

        list_response = self.client.get(
            reverse("lifts:training-day-collection"),
            data={"month": "2026-02"},
        )
        self.assertEqual(list_response.status_code, 200)
        list_payload = list_response.json()
        self.assertEqual(len(list_payload["days"]), 1)
        self.assertEqual(list_payload["days"][0]["date"], "2026-02-03")
        self.assertEqual(list_payload["days"][0]["status"], "completed")
        self.assertEqual(list_payload["days"][0]["lifts"][0]["saved_lift_id"], deadlift.id)

    def test_update_training_day_by_date(self):
        first_save = self.client.post(
            reverse("lifts:training-day-collection"),
            data=json.dumps(
                {
                    "date": "2026-02-04",
                    "name": "Push Day",
                    "status": "planned",
                    "intensity": "minor",
                    "lifts": [{"name": "Bench Press", "sets": 5, "reps": 3, "weight": 100}],
                }
            ),
            content_type="application/json",
        )
        self.assertEqual(first_save.status_code, 201)

        second_save = self.client.post(
            reverse("lifts:training-day-collection"),
            data=json.dumps(
                {
                    "date": "2026-02-04",
                    "name": "Heavy Push",
                    "status": "completed",
                    "intensity": "high",
                    "lifts": [{"name": "Bench Press", "sets": 6, "reps": 2, "weight": 110}],
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(second_save.status_code, 200)
        self.assertEqual(TrainingDay.objects.count(), 1)
        updated_payload = second_save.json()
        self.assertEqual(updated_payload["name"], "Heavy Push")
        self.assertEqual(updated_payload["status"], "completed")
        self.assertEqual(updated_payload["intensity"], "high")
        self.assertEqual(updated_payload["lifts"][0]["sets"], 6)
        self.assertEqual(updated_payload["lifts"][0]["is_pr"], False)
        self.assertEqual(updated_payload["lifts"][0]["notes"], "")

    def test_save_planned_day_without_set_data(self):
        hyperextensions = SavedLift.objects.create(name="Hyperextensions")

        response = self.client.post(
            reverse("lifts:training-day-collection"),
            data=json.dumps(
                {
                    "date": "2026-02-10",
                    "name": "Accessories",
                    "status": "planned",
                    "intensity": "non-relevant",
                    "lifts": [{"saved_lift_id": hyperextensions.id, "name": "Hyperextensions"}],
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertEqual(payload["status"], "planned")
        self.assertEqual(payload["lifts"][0]["sets"], None)
        self.assertEqual(payload["lifts"][0]["reps"], None)
        self.assertEqual(payload["lifts"][0]["saved_lift_id"], hyperextensions.id)

    def test_delete_training_day(self):
        training_day = TrainingDay.objects.create(
            date="2026-02-05",
            name="Delete Me",
            status="planned",
            intensity="minor",
        )

        response = self.client.delete(reverse("lifts:training-day-detail", kwargs={"day_id": training_day.id}))

        self.assertEqual(response.status_code, 204)
        self.assertEqual(TrainingDay.objects.count(), 0)

    def test_reject_invalid_training_day_intensity(self):
        response = self.client.post(
            reverse("lifts:training-day-collection"),
            data=json.dumps(
                {
                    "date": "2026-02-03",
                    "name": "Pull Day",
                    "intensity": "super-hard",
                    "lifts": [],
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)

    def test_reject_invalid_training_day_status(self):
        response = self.client.post(
            reverse("lifts:training-day-collection"),
            data=json.dumps(
                {
                    "date": "2026-02-03",
                    "name": "Pull Day",
                    "status": "maybe",
                    "lifts": [],
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)

    def test_reject_invalid_lift_is_pr(self):
        response = self.client.post(
            reverse("lifts:training-day-collection"),
            data=json.dumps(
                {
                    "date": "2026-02-03",
                    "name": "Pull Day",
                    "status": "completed",
                    "intensity": "minor",
                    "lifts": [{"name": "Deadlift", "is_pr": "yes"}],
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)

    def test_reject_invalid_lift_notes(self):
        response = self.client.post(
            reverse("lifts:training-day-collection"),
            data=json.dumps(
                {
                    "date": "2026-02-03",
                    "name": "Pull Day",
                    "status": "completed",
                    "intensity": "minor",
                    "lifts": [{"name": "Deadlift", "notes": 42}],
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)


class UserProfileApiTests(ApiTestCase):
    def test_get_user_profile_creates_default(self):
        response = self.client.get(reverse("lifts:user-profile"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(UserProfile.objects.count(), 1)
        payload = response.json()
        self.assertEqual(payload["weight_unit"], "kg")
        self.assertEqual(payload["height_unit"], "cm")
        self.assertEqual(payload["gender"], "unspecified")

    def test_save_user_profile(self):
        response = self.client.post(
            reverse("lifts:user-profile"),
            data=json.dumps(
                {
                    "weight_unit": "lb",
                    "height_unit": "inch",
                    "height": 71,
                    "weight": 198.5,
                    "gender": "male",
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["weight_unit"], "lb")
        self.assertEqual(payload["height_unit"], "inch")
        self.assertEqual(payload["height"], 71.0)
        self.assertEqual(payload["weight"], 198.5)
        self.assertEqual(payload["gender"], "male")

    def test_reject_invalid_weight_unit(self):
        response = self.client.post(
            reverse("lifts:user-profile"),
            data=json.dumps({"weight_unit": "stone"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)


class SuggestDayApiTests(ApiTestCase):
    @patch("lifts.views.get_suggest_day_availability")
    def test_suggest_day_status_reports_availability_and_profile_completeness(self, mock_get_suggest_day_availability):
        UserProfile.objects.create(height=180, weight=92.5, gender="male")
        mock_get_suggest_day_availability.return_value = SuggestDayAvailability(
            available=True,
            model_name="gemma4:latest",
            reason=None,
        )

        response = self.client.get(reverse("lifts:suggest-day-status"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(),
            {
                "available": True,
                "model_name": "gemma4:latest",
                "reason": None,
                "profile_complete": True,
            },
        )

    def test_suggest_day_rejects_incomplete_profile(self):
        SavedLift.objects.create(name="Deadlift")

        response = self.client.post(
            reverse("lifts:suggest-day"),
            data=json.dumps(
                {
                    "date": "2026-02-15",
                    "history_window": "4w",
                    "wanted_day_type": "Pull",
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("Save weight, height, and gender", response.json()["error"])

    @patch("lifts.views.suggest_day_from_ollama")
    def test_suggest_day_returns_normalized_suggestion(self, mock_suggest_day_from_ollama):
        pull_tag = LiftCategory.objects.create(name="Rows")
        deadlift_tag = LiftCategory.objects.create(name="Deadlifts")
        UserProfile.objects.create(height=182, weight=96, gender="male")

        deadlift = SavedLift.objects.create(
            name="Deadlift",
            category=deadlift_tag,
            default_sets=4,
            default_reps=5,
            default_weight=200,
        )
        t_row = SavedLift.objects.create(name="T-row", category=pull_tag)

        training_day = TrainingDay.objects.create(
            date="2026-02-10",
            name="Pull",
            status="completed",
            intensity="medium",
        )
        training_day.lifts.create(
            saved_lift=deadlift,
            name="Deadlift",
            sets=4,
            reps=5,
            weight=190,
            notes="Moved well",
            sort_order=0,
        )
        TrainingDay.objects.create(
            date="2026-02-11",
            name="Planned Pull",
            status="planned",
            intensity="minor",
        )

        preset = LiftTemplate.objects.create(name="Pull Template")
        TemplateLift.objects.create(
            template=preset,
            saved_lift=t_row,
            name="T-row",
            sets=3,
            reps=8,
            sort_order=0,
        )

        mock_suggest_day_from_ollama.return_value = {
            "name": "Suggested Pull",
            "status": "planned",
            "intensity": "medium",
            "summary": "Bias toward pulling with one heavy hinge.",
            "lifts": [
                {
                    "saved_lift_id": deadlift.id,
                    "name": "Deadlift",
                    "sets": 3,
                    "reps": 5,
                    "weight": 180.0,
                    "notes": "Leave one rep in reserve",
                },
                {
                    "saved_lift_id": t_row.id,
                    "name": "T-row",
                    "sets": 3,
                    "reps": 8,
                    "weight": None,
                    "notes": "",
                },
            ],
        }

        response = self.client.post(
            reverse("lifts:suggest-day"),
            data=json.dumps(
                {
                    "date": "2026-02-15",
                    "history_window": "1w",
                    "wanted_day_type": "Pull",
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["name"], "Suggested Pull")
        self.assertEqual(payload["status"], "planned")
        self.assertEqual(payload["intensity"], "medium")
        self.assertEqual(payload["summary"], "Bias toward pulling with one heavy hinge.")
        self.assertEqual(len(payload["lifts"]), 2)
        self.assertEqual(payload["lifts"][0]["saved_lift_id"], deadlift.id)
        self.assertEqual(payload["lifts"][0]["is_pr"], False)
        self.assertEqual(payload["lifts"][0]["notes"], "Leave one rep in reserve")

        kwargs = mock_suggest_day_from_ollama.call_args.kwargs
        self.assertEqual(kwargs["target_date"], "2026-02-15")
        self.assertEqual(kwargs["history_window_label"], "1 week")
        self.assertEqual(kwargs["wanted_day_type"], "Pull")
        self.assertEqual(kwargs["profile"]["weight"], 96.0)
        self.assertEqual(list(kwargs["saved_lifts_by_tag"].keys()), ["Deadlifts", "Rows"])
        self.assertEqual(kwargs["saved_lifts_by_tag"]["Deadlifts"][0]["name"], "Deadlift")
        self.assertEqual(kwargs["preset_days"], [{"name": "Pull Template", "lifts": ["T-row"]}])
        self.assertEqual(len(kwargs["history_days"]), 1)
        self.assertEqual(kwargs["history_days"][0]["date"], "2026-02-10")
        self.assertEqual(kwargs["history_days"][0]["lifts"][0]["name"], "Deadlift")


class SeedPushPullLegsCommandTests(TestCase):
    def test_seed_push_pull_legs_creates_library_and_presets(self):
        call_command("seed_push_pull_legs")

        self.assertTrue(SavedLift.objects.filter(name="Bench Press", default_sets=4, default_reps=6).exists())
        self.assertTrue(SavedLift.objects.filter(name="Hyperextensions", default_sets__isnull=True, default_reps__isnull=True).exists())

        push_day = LiftTemplate.objects.get(name="Push Day")
        pull_day = LiftTemplate.objects.get(name="Pull Day")
        leg_day = LiftTemplate.objects.get(name="Leg Day")

        self.assertEqual(push_day.lifts.count(), 5)
        self.assertEqual(pull_day.lifts.count(), 7)
        self.assertEqual(leg_day.lifts.count(), 6)

        self.assertTrue(
            TemplateLift.objects.filter(
                template=push_day,
                name="Bench Press",
                sets=4,
                reps=6,
                saved_lift__name="Bench Press",
            ).exists()
        )
        self.assertTrue(
            TemplateLift.objects.filter(
                template=pull_day,
                name="Hyperextensions",
                sets__isnull=True,
                reps__isnull=True,
                saved_lift__name="Hyperextensions",
            ).exists()
        )

        first_lift_count = SavedLift.objects.count()
        first_template_count = LiftTemplate.objects.count()
        first_template_lift_count = TemplateLift.objects.count()

        call_command("seed_push_pull_legs")

        self.assertEqual(SavedLift.objects.count(), first_lift_count)
        self.assertEqual(LiftTemplate.objects.count(), first_template_count)
        self.assertEqual(TemplateLift.objects.count(), first_template_lift_count)


class ResetLiftLibraryCommandTests(TestCase):
    def test_reset_lift_library_replaces_existing_lifts_and_presets_with_tagged_defaults(self):
        old_category = LiftCategory.objects.create(name="Old")
        old_lift = SavedLift.objects.create(name="Old Lift", category=old_category)
        old_template = LiftTemplate.objects.create(name="Old Day")
        TemplateLift.objects.create(template=old_template, saved_lift=old_lift, name=old_lift.name, sort_order=0)

        call_command("reset_lift_library")

        self.assertFalse(SavedLift.objects.filter(name="Old Lift").exists())
        self.assertEqual(LiftCategory.objects.count(), 5)
        self.assertEqual(SavedLift.objects.count(), 25)
        self.assertEqual(LiftTemplate.objects.count(), 5)

        smith_bench = SavedLift.objects.get(name="Smith Bench")
        self.assertEqual(smith_bench.category.name, "Bench")

        core_day = LiftTemplate.objects.get(name="Core")
        self.assertTrue(
            TemplateLift.objects.filter(
                template=core_day,
                saved_lift__name="Reverse Hyper",
                name="Reverse Hyper",
            ).exists()
        )

        push_pull_1 = LiftTemplate.objects.get(name="Push&Pull Var1")
        self.assertEqual(push_pull_1.lifts.count(), 5)
