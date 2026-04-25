from django.urls import path

from .views import (
    index,
    lift_category_collection,
    lift_template_collection,
    lift_template_detail,
    saved_lift_collection,
    saved_lift_detail,
    training_day_collection,
    user_profile,
)

app_name = "lifts"

urlpatterns = [
    path("", index, name="index"),
    path("calendar/", index, name="calendar"),
    path("settings/", index, name="settings"),
    path("block-generation/", index, name="block-generation"),
    path("api/lift-categories/", lift_category_collection, name="lift-category-collection"),
    path("api/saved-lifts/", saved_lift_collection, name="saved-lift-collection"),
    path("api/saved-lifts/<int:lift_id>/", saved_lift_detail, name="saved-lift-detail"),
    path("api/lift-templates/", lift_template_collection, name="lift-template-collection"),
    path("api/lift-templates/<int:day_id>/", lift_template_detail, name="lift-template-detail"),
    path("api/training-days/", training_day_collection, name="training-day-collection"),
    path("api/user-profile/", user_profile, name="user-profile"),
]
