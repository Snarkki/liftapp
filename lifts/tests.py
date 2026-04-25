import json

from django.test import TestCase
from django.urls import reverse

from .models import LiftCategory, LiftTemplate, SavedLift, TrainingDay, UserProfile


class LiftCategoryApiTests(TestCase):
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


class SavedLiftApiTests(TestCase):
    def test_create_lift_with_category(self):
        category = LiftCategory.objects.create(name="Pull")

        response = self.client.post(
            reverse("lifts:saved-lift-collection"),
            data=json.dumps({"name": "Deadlift", "category_id": category.id}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(SavedLift.objects.count(), 1)
        payload = response.json()
        self.assertEqual(payload["name"], "Deadlift")
        self.assertEqual(payload["category"]["name"], "Pull")

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


class LiftTemplateApiTests(TestCase):
    def test_save_and_get_template_days(self):
        deadlift = SavedLift.objects.create(name="Deadlift")
        row = SavedLift.objects.create(name="Barbell Row")

        save_response = self.client.post(
            reverse("lifts:lift-template-collection"),
            data=json.dumps(
                {
                    "days": [
                        {"name": "Pull Day", "lift_ids": [deadlift.id, row.id]},
                        {"name": "Back Day", "lift_ids": [row.id]},
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
        self.assertEqual(pull_day["lifts"][0]["name"], "Deadlift")

    def test_template_rejects_unknown_lift_id(self):
        response = self.client.post(
            reverse("lifts:lift-template-collection"),
            data=json.dumps({"days": [{"name": "Pull Day", "lift_ids": [12345]}]}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)

    def test_delete_template_day(self):
        day = LiftTemplate.objects.create(name="Pull Day")

        response = self.client.delete(reverse("lifts:lift-template-detail", kwargs={"day_id": day.id}))

        self.assertEqual(response.status_code, 204)
        self.assertEqual(LiftTemplate.objects.count(), 0)


class TrainingDayApiTests(TestCase):
    def test_create_and_list_training_day(self):
        save_response = self.client.post(
            reverse("lifts:training-day-collection"),
            data=json.dumps(
                {
                    "date": "2026-02-03",
                    "name": "Pull Day",
                    "intensity": "medium",
                    "lifts": [
                        {
                            "name": "Deadlift",
                            "sets": 4,
                            "reps": 5,
                            "weight": 180,
                            "is_pr": True,
                            "notes": "Felt very strong today.",
                        },
                        {"name": "Barbell Row", "sets": 3, "reps": 8, "weight": 90},
                    ],
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(save_response.status_code, 201)
        self.assertEqual(TrainingDay.objects.count(), 1)
        created_payload = save_response.json()
        self.assertEqual(created_payload["name"], "Pull Day")
        self.assertEqual(created_payload["intensity"], "medium")
        self.assertEqual(len(created_payload["lifts"]), 2)
        self.assertEqual(created_payload["lifts"][0]["is_pr"], True)
        self.assertEqual(created_payload["lifts"][0]["notes"], "Felt very strong today.")
        self.assertEqual(created_payload["lifts"][1]["is_pr"], False)
        self.assertEqual(created_payload["lifts"][1]["notes"], "")

        list_response = self.client.get(
            reverse("lifts:training-day-collection"),
            data={"month": "2026-02"},
        )
        self.assertEqual(list_response.status_code, 200)
        list_payload = list_response.json()
        self.assertEqual(len(list_payload["days"]), 1)
        self.assertEqual(list_payload["days"][0]["date"], "2026-02-03")
        self.assertEqual(list_payload["days"][0]["lifts"][0]["is_pr"], True)

    def test_update_training_day_by_date(self):
        first_save = self.client.post(
            reverse("lifts:training-day-collection"),
            data=json.dumps(
                {
                    "date": "2026-02-04",
                    "name": "Push Day",
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
        self.assertEqual(updated_payload["intensity"], "high")
        self.assertEqual(updated_payload["lifts"][0]["sets"], 6)
        self.assertEqual(updated_payload["lifts"][0]["is_pr"], False)
        self.assertEqual(updated_payload["lifts"][0]["notes"], "")

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

    def test_reject_invalid_lift_is_pr(self):
        response = self.client.post(
            reverse("lifts:training-day-collection"),
            data=json.dumps(
                {
                    "date": "2026-02-03",
                    "name": "Pull Day",
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
                    "intensity": "minor",
                    "lifts": [{"name": "Deadlift", "notes": 42}],
                }
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, 400)


class UserProfileApiTests(TestCase):
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
