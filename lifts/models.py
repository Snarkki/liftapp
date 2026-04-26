from django.db import models


class UserProfile(models.Model):
    WEIGHT_UNIT_KG = "kg"
    WEIGHT_UNIT_LB = "lb"
    HEIGHT_UNIT_CM = "cm"
    HEIGHT_UNIT_INCH = "inch"
    GENDER_MALE = "male"
    GENDER_FEMALE = "female"
    GENDER_NON_BINARY = "non-binary"
    GENDER_OTHER = "other"
    GENDER_UNSPECIFIED = "unspecified"

    WEIGHT_UNIT_CHOICES = [
        (WEIGHT_UNIT_KG, "kg"),
        (WEIGHT_UNIT_LB, "lb"),
    ]
    HEIGHT_UNIT_CHOICES = [
        (HEIGHT_UNIT_CM, "cm"),
        (HEIGHT_UNIT_INCH, "inch"),
    ]
    GENDER_CHOICES = [
        (GENDER_MALE, "Male"),
        (GENDER_FEMALE, "Female"),
        (GENDER_NON_BINARY, "Non-binary"),
        (GENDER_OTHER, "Other"),
        (GENDER_UNSPECIFIED, "Prefer not to say"),
    ]

    weight_unit = models.CharField(max_length=8, choices=WEIGHT_UNIT_CHOICES, default=WEIGHT_UNIT_KG)
    height_unit = models.CharField(max_length=8, choices=HEIGHT_UNIT_CHOICES, default=HEIGHT_UNIT_CM)
    height = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    weight = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    gender = models.CharField(max_length=20, choices=GENDER_CHOICES, default=GENDER_UNSPECIFIED)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class LiftCategory(models.Model):
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)


class SavedLift(models.Model):
    name = models.CharField(max_length=255)
    category = models.ForeignKey(LiftCategory, on_delete=models.SET_NULL, null=True, blank=True)
    variation_of = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="variations",
    )
    default_sets = models.PositiveIntegerField(null=True, blank=True)
    default_reps = models.PositiveIntegerField(null=True, blank=True)
    default_weight = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)


class LiftTemplate(models.Model):
    name = models.CharField(max_length=255, help_text="Favorite day name, e.g. Pull Day")
    created_at = models.DateTimeField(auto_now_add=True)


class TemplateLift(models.Model):
    template = models.ForeignKey(LiftTemplate, related_name="lifts", on_delete=models.CASCADE)
    saved_lift = models.ForeignKey(
        SavedLift,
        related_name="template_lifts",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=255)
    sets = models.PositiveIntegerField(null=True, blank=True)
    reps = models.PositiveIntegerField(null=True, blank=True)
    weight = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    sort_order = models.IntegerField(default=0, help_text="Order of the lift within the day, starting from 0")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("sort_order", "id")


class TrainingDay(models.Model):
    INTENSITY_MINOR = "minor"
    INTENSITY_MEDIUM = "medium"
    INTENSITY_HIGH = "high"
    INTENSITY_NON_RELEVANT = "non-relevant"
    STATUS_PLANNED = "planned"
    STATUS_COMPLETED = "completed"

    INTENSITY_CHOICES = [
        (INTENSITY_MINOR, "Minor"),
        (INTENSITY_MEDIUM, "Medium"),
        (INTENSITY_HIGH, "High"),
        (INTENSITY_NON_RELEVANT, "Non-relevant"),
    ]
    STATUS_CHOICES = [
        (STATUS_PLANNED, "Planned"),
        (STATUS_COMPLETED, "Completed"),
    ]

    date = models.DateField(unique=True)
    name = models.CharField(max_length=255)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_COMPLETED)
    intensity = models.CharField(max_length=20, choices=INTENSITY_CHOICES, default=INTENSITY_NON_RELEVANT)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


class TrainingDayLift(models.Model):
    training_day = models.ForeignKey(TrainingDay, related_name="lifts", on_delete=models.CASCADE)
    saved_lift = models.ForeignKey(
        SavedLift,
        related_name="training_day_lifts",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=255)
    sets = models.PositiveIntegerField(null=True, blank=True)
    reps = models.PositiveIntegerField(null=True, blank=True)
    weight = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True)
    is_pr = models.BooleanField(default=False)
    notes = models.TextField(blank=True, default="")
    sort_order = models.IntegerField(default=0, help_text="Order of the lift within the training day")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("sort_order", "id")
