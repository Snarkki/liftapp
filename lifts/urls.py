from django.urls import path

from .views import (
    index,
    lift_category_collection,
    lift_category_detail,
    lift_template_collection,
    lift_template_detail,
    saved_lift_collection,
    saved_lift_detail,
    suggest_day,
    suggest_day_status,
    training_day_collection,
    training_day_detail,
    user_profile,
)

app_name = "lifts"

urlpatterns = [
    path("", index, name="index"),
    path("calendar/", index, name="calendar"),
    path("settings/", index, name="settings"),
    path("block-generation/", index, name="block-generation"),
    path("api/lift-categories/", lift_category_collection, name="lift-category-collection"),
    path("api/lift-categories/<int:category_id>/", lift_category_detail, name="lift-category-detail"),
    path("api/saved-lifts/", saved_lift_collection, name="saved-lift-collection"),
    path("api/saved-lifts/<int:lift_id>/", saved_lift_detail, name="saved-lift-detail"),
    path("api/lift-templates/", lift_template_collection, name="lift-template-collection"),
    path("api/lift-templates/<int:day_id>/", lift_template_detail, name="lift-template-detail"),
    path("api/suggest-day/status/", suggest_day_status, name="suggest-day-status"),
    path("api/suggest-day/", suggest_day, name="suggest-day"),
    path("api/training-days/", training_day_collection, name="training-day-collection"),
    path("api/training-days/<int:day_id>/", training_day_detail, name="training-day-detail"),
    path("api/user-profile/", user_profile, name="user-profile"),
]
