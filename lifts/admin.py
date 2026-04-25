from django.contrib import admin

from .models import LiftCategory, LiftTemplate, SavedLift, TemplateLift, TrainingDay, TrainingDayLift, UserProfile


@admin.register(LiftCategory)
class LiftCategoryAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "created_at")
    search_fields = ("name",)
    readonly_fields = ("created_at",)


@admin.register(SavedLift)
class SavedLiftAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "category", "variation_of", "created_at")
    list_filter = ("category", "variation_of")
    search_fields = ("name", "category__name", "variation_of__name")
    readonly_fields = ("created_at",)


@admin.register(LiftTemplate)
class LiftTemplateAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "created_at")
    search_fields = ("name",)
    readonly_fields = ("created_at",)


@admin.register(TemplateLift)
class TemplateLiftAdmin(admin.ModelAdmin):
    list_display = ("id", "template", "name", "sort_order", "created_at")
    search_fields = ("name",)
    readonly_fields = ("created_at",)


@admin.register(TrainingDay)
class TrainingDayAdmin(admin.ModelAdmin):
    list_display = ("id", "date", "name", "intensity", "created_at", "updated_at")
    list_filter = ("intensity",)
    search_fields = ("name", "date")
    readonly_fields = ("created_at", "updated_at")


@admin.register(TrainingDayLift)
class TrainingDayLiftAdmin(admin.ModelAdmin):
    list_display = ("id", "training_day", "name", "sets", "reps", "weight", "sort_order", "created_at")
    search_fields = ("name", "training_day__name")
    readonly_fields = ("created_at",)


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ("id", "weight_unit", "height_unit", "height", "weight", "gender", "updated_at")
    readonly_fields = ("created_at", "updated_at")
