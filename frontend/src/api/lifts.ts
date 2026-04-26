import { getCsrfToken } from "../utils/csrf";

export type LiftCategory = {
  id: number;
  name: string;
};

export type SavedLift = {
  id: number;
  name: string;
  category: LiftCategory | null;
  variationOf: {
    id: number;
    name: string;
  } | null;
  defaultSets: number | null;
  defaultReps: number | null;
  defaultWeight: number | null;
};

export type TemplateLift = {
  id: number;
  savedLiftId: number | null;
  name: string;
  sets: number | null;
  reps: number | null;
  weight: number | null;
  sortOrder: number;
};

export type LiftTemplateDay = {
  id: number;
  name: string;
  lifts: TemplateLift[];
};

export type TrainingDayStatus = "planned" | "completed";
export type TrainingIntensity = "minor" | "medium" | "high" | "non-relevant";

export type TrainingDayLift = {
  id: number;
  savedLiftId: number | null;
  name: string;
  sets: number | null;
  reps: number | null;
  weight: number | null;
  isPr: boolean;
  notes: string;
  sortOrder: number;
};

export type TrainingDay = {
  id: number;
  date: string;
  name: string;
  status: TrainingDayStatus;
  intensity: TrainingIntensity;
  lifts: TrainingDayLift[];
};

export type UserProfile = {
  id: number;
  weightUnit: "kg" | "lb";
  heightUnit: "cm" | "inch";
  height: number | null;
  weight: number | null;
  gender: "male" | "female" | "non-binary" | "other" | "unspecified";
};

export type SuggestDayAvailability = {
  available: boolean;
  modelName: string | null;
  reason: string | null;
  profileComplete: boolean;
};

export type SuggestedDayLift = {
  savedLiftId: number | null;
  name: string;
  sets: number | null;
  reps: number | null;
  weight: number | null;
  notes: string;
  isPr: boolean;
};

export type SuggestedDay = {
  name: string;
  status: TrainingDayStatus;
  intensity: TrainingIntensity;
  summary: string;
  lifts: SuggestedDayLift[];
};

type LiftTemplateDayApi = {
  id: number;
  name: string;
  lifts: Array<{
    id: number;
    saved_lift_id: number | null;
    name: string;
    sets: number | null;
    reps: number | null;
    weight: number | null;
    sort_order: number;
  }>;
};

type TrainingDayLiftApi = {
  id: number;
  saved_lift_id: number | null;
  name: string;
  sets: number | null;
  reps: number | null;
  weight: number | null;
  is_pr: boolean;
  notes: string;
  sort_order: number;
};

type TrainingDayApi = {
  id: number;
  date: string;
  name: string;
  status: TrainingDayStatus;
  intensity: TrainingIntensity;
  lifts: TrainingDayLiftApi[];
};

type UserProfileApi = {
  id: number;
  weight_unit: "kg" | "lb";
  height_unit: "cm" | "inch";
  height: number | null;
  weight: number | null;
  gender: "male" | "female" | "non-binary" | "other" | "unspecified";
};

type SuggestDayAvailabilityApi = {
  available: boolean;
  model_name: string | null;
  reason: string | null;
  profile_complete: boolean;
};

type SuggestedDayApi = {
  name: string;
  status: TrainingDayStatus;
  intensity: TrainingIntensity;
  summary: string;
  lifts: Array<{
    saved_lift_id: number | null;
    name: string;
    sets: number | null;
    reps: number | null;
    weight: number | null;
    notes: string;
    is_pr: boolean;
  }>;
};

function mapTemplateDay(day: LiftTemplateDayApi): LiftTemplateDay {
  return {
    id: day.id,
    name: day.name,
    lifts: day.lifts.map((lift) => ({
      id: lift.id,
      savedLiftId: lift.saved_lift_id,
      name: lift.name,
      sets: lift.sets,
      reps: lift.reps,
      weight: lift.weight,
      sortOrder: lift.sort_order,
    })),
  };
}

function mapTrainingDay(day: TrainingDayApi): TrainingDay {
  return {
    id: day.id,
    date: day.date,
    name: day.name,
    status: day.status,
    intensity: day.intensity,
    lifts: day.lifts.map((lift) => ({
      id: lift.id,
      savedLiftId: lift.saved_lift_id,
      name: lift.name,
      sets: lift.sets,
      reps: lift.reps,
      weight: lift.weight,
      isPr: lift.is_pr,
      notes: lift.notes,
      sortOrder: lift.sort_order,
    })),
  };
}

function mapUserProfile(profile: UserProfileApi): UserProfile {
  return {
    id: profile.id,
    weightUnit: profile.weight_unit,
    heightUnit: profile.height_unit,
    height: profile.height,
    weight: profile.weight,
    gender: profile.gender,
  };
}

function mapSuggestDayAvailability(payload: SuggestDayAvailabilityApi): SuggestDayAvailability {
  return {
    available: payload.available,
    modelName: payload.model_name,
    reason: payload.reason,
    profileComplete: payload.profile_complete,
  };
}

function mapSuggestedDay(day: SuggestedDayApi): SuggestedDay {
  return {
    name: day.name,
    status: day.status,
    intensity: day.intensity,
    summary: day.summary,
    lifts: day.lifts.map((lift) => ({
      savedLiftId: lift.saved_lift_id,
      name: lift.name,
      sets: lift.sets,
      reps: lift.reps,
      weight: lift.weight,
      notes: lift.notes,
      isPr: lift.is_pr,
    })),
  };
}

export async function fetchCategories(): Promise<LiftCategory[]> {
  const response = await fetch("/api/lift-categories/", {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch categories.");
  }

  const payload = (await response.json()) as { categories: LiftCategory[] };
  return payload.categories;
}

export async function createCategory(name: string): Promise<LiftCategory> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("Category name is required.");
  }

  const response = await fetch("/api/lift-categories/", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": getCsrfToken(),
    },
    body: JSON.stringify({ name: trimmedName }),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorBody.error ?? "Failed to create category.");
  }

  const payload = (await response.json()) as { id: number; name: string };
  return { id: payload.id, name: payload.name };
}

export async function deleteCategory(categoryId: number): Promise<void> {
  const response = await fetch(`/api/lift-categories/${categoryId}/`, {
    method: "DELETE",
    credentials: "same-origin",
    headers: {
      "X-CSRFToken": getCsrfToken(),
    },
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorBody.error ?? "Failed to delete tag.");
  }
}

export async function fetchSavedLifts(): Promise<SavedLift[]> {
  const response = await fetch("/api/saved-lifts/", {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch lifts.");
  }

  const payload = (await response.json()) as {
    lifts: Array<{
      id: number;
      name: string;
      category: LiftCategory | null;
      variation_of: {
        id: number;
        name: string;
      } | null;
      default_sets: number | null;
      default_reps: number | null;
      default_weight: number | null;
    }>;
  };
  return payload.lifts.map((lift) => ({
    id: lift.id,
    name: lift.name,
    category: lift.category,
    variationOf: lift.variation_of,
    defaultSets: lift.default_sets,
    defaultReps: lift.default_reps,
    defaultWeight: lift.default_weight,
  }));
}

export async function createSavedLift(input: {
  name: string;
  categoryId?: number | null;
  variationOfId?: number | null;
  defaultSets?: number | null;
  defaultReps?: number | null;
  defaultWeight?: number | null;
}): Promise<SavedLift> {
  const trimmedName = input.name.trim();
  if (!trimmedName) {
    throw new Error("Lift name is required.");
  }

  const response = await fetch("/api/saved-lifts/", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": getCsrfToken(),
    },
    body: JSON.stringify({
      name: trimmedName,
      category_id: input.categoryId ?? null,
      variation_of_id: input.variationOfId ?? null,
      default_sets: input.defaultSets ?? null,
      default_reps: input.defaultReps ?? null,
      default_weight: input.defaultWeight ?? null,
    }),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorBody.error ?? "Failed to create lift.");
  }

  const payload = (await response.json()) as {
    id: number;
    name: string;
    category: LiftCategory | null;
    variation_of: {
      id: number;
      name: string;
    } | null;
    default_sets: number | null;
    default_reps: number | null;
    default_weight: number | null;
  };
  return {
    id: payload.id,
    name: payload.name,
    category: payload.category,
    variationOf: payload.variation_of,
    defaultSets: payload.default_sets,
    defaultReps: payload.default_reps,
    defaultWeight: payload.default_weight,
  };
}

export async function deleteSavedLift(liftId: number): Promise<void> {
  const response = await fetch(`/api/saved-lifts/${liftId}/`, {
    method: "DELETE",
    credentials: "same-origin",
    headers: {
      "X-CSRFToken": getCsrfToken(),
    },
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorBody.error ?? "Failed to delete lift.");
  }
}

export async function fetchLiftTemplate(): Promise<LiftTemplateDay[]> {
  const response = await fetch("/api/lift-templates/", {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch favorite days.");
  }

  const payload = (await response.json()) as { days: LiftTemplateDayApi[] };
  return payload.days.map(mapTemplateDay);
}

export async function saveLiftTemplate(
  days: Array<{
    id?: number;
    name: string;
    lifts: Array<{
      savedLiftId: number;
      sets: number | null;
      reps: number | null;
      weight: number | null;
    }>;
  }>
): Promise<LiftTemplateDay[]> {
  const response = await fetch("/api/lift-templates/", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": getCsrfToken(),
    },
    body: JSON.stringify({
      days: days.map((day) => ({
        id: day.id,
        name: day.name,
        lifts: day.lifts.map((lift) => ({
          saved_lift_id: lift.savedLiftId,
          sets: lift.sets,
          reps: lift.reps,
          weight: lift.weight,
        })),
      })),
    }),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorBody.error ?? "Failed to save favorite days.");
  }

  const payload = (await response.json()) as { days: LiftTemplateDayApi[] };
  return payload.days.map(mapTemplateDay);
}

export async function deleteLiftTemplateDay(dayId: number): Promise<void> {
  const response = await fetch(`/api/lift-templates/${dayId}/`, {
    method: "DELETE",
    credentials: "same-origin",
    headers: {
      "X-CSRFToken": getCsrfToken(),
    },
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorBody.error ?? "Failed to delete favorite day.");
  }
}

export async function fetchTrainingDays(month: string): Promise<TrainingDay[]> {
  const response = await fetch(`/api/training-days/?month=${encodeURIComponent(month)}`, {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorBody.error ?? "Failed to fetch training days.");
  }

  const payload = (await response.json()) as { days: TrainingDayApi[] };
  return payload.days.map(mapTrainingDay);
}

export async function saveTrainingDay(day: {
  date: string;
  name: string;
  status: TrainingDayStatus;
  intensity: TrainingIntensity;
  lifts: Array<{
    savedLiftId: number | null;
    name: string;
    sets: number | null;
    reps: number | null;
    weight: number | null;
    isPr: boolean;
    notes: string;
  }>;
}): Promise<TrainingDay> {
  const response = await fetch("/api/training-days/", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": getCsrfToken(),
    },
    body: JSON.stringify({
      date: day.date,
      name: day.name,
      status: day.status,
      intensity: day.intensity,
      lifts: day.lifts.map((lift) => ({
        saved_lift_id: lift.savedLiftId,
        name: lift.name,
        sets: lift.sets,
        reps: lift.reps,
        weight: lift.weight,
        is_pr: lift.isPr,
        notes: lift.notes,
      })),
    }),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorBody.error ?? "Failed to save training day.");
  }

  const payload = (await response.json()) as TrainingDayApi;
  return mapTrainingDay(payload);
}

export async function deleteTrainingDay(dayId: number): Promise<void> {
  const response = await fetch(`/api/training-days/${dayId}/`, {
    method: "DELETE",
    credentials: "same-origin",
    headers: {
      "X-CSRFToken": getCsrfToken(),
    },
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorBody.error ?? "Failed to delete day.");
  }
}

export async function fetchUserProfile(): Promise<UserProfile> {
  const response = await fetch("/api/user-profile/", {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorBody.error ?? "Failed to fetch user profile.");
  }

  const payload = (await response.json()) as UserProfileApi;
  return mapUserProfile(payload);
}

export async function fetchSuggestDayAvailability(): Promise<SuggestDayAvailability> {
  const response = await fetch("/api/suggest-day/status/", {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorBody.error ?? "Failed to check Suggest day availability.");
  }

  const payload = (await response.json()) as SuggestDayAvailabilityApi;
  return mapSuggestDayAvailability(payload);
}

export async function suggestDay(input: {
  date: string;
  historyWindow: "none" | "1w" | "4w" | "12w";
  wantedDayType: string;
}): Promise<SuggestedDay> {
  const response = await fetch("/api/suggest-day/", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": getCsrfToken(),
    },
    body: JSON.stringify({
      date: input.date,
      history_window: input.historyWindow,
      wanted_day_type: input.wantedDayType,
    }),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorBody.error ?? "Failed to suggest a day.");
  }

  const payload = (await response.json()) as SuggestedDayApi;
  return mapSuggestedDay(payload);
}

export async function saveUserProfile(profile: {
  weightUnit: "kg" | "lb";
  heightUnit: "cm" | "inch";
  height: number | null;
  weight: number | null;
  gender: "male" | "female" | "non-binary" | "other" | "unspecified";
}): Promise<UserProfile> {
  const response = await fetch("/api/user-profile/", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": getCsrfToken(),
    },
    body: JSON.stringify({
      weight_unit: profile.weightUnit,
      height_unit: profile.heightUnit,
      height: profile.height,
      weight: profile.weight,
      gender: profile.gender,
    }),
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorBody.error ?? "Failed to save user profile.");
  }

  const payload = (await response.json()) as UserProfileApi;
  return mapUserProfile(payload);
}
