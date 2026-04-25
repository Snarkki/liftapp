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
};

export type TemplateLift = {
  id: number;
  name: string;
  sortOrder: number;
};

export type LiftTemplateDay = {
  id: number;
  name: string;
  lifts: TemplateLift[];
};

export type TrainingIntensity = "minor" | "medium" | "high" | "non-relevant";

export type TrainingDayLift = {
  id: number;
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

type LiftTemplateDayApi = {
  id: number;
  name: string;
  lifts: Array<{
    id: number;
    name: string;
    sort_order: number;
  }>;
};

type TrainingDayLiftApi = {
  id: number;
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

function mapTemplateDay(day: LiftTemplateDayApi): LiftTemplateDay {
  return {
    id: day.id,
    name: day.name,
    lifts: day.lifts.map((lift) => ({
      id: lift.id,
      name: lift.name,
      sortOrder: lift.sort_order,
    })),
  };
}

function mapTrainingDay(day: TrainingDayApi): TrainingDay {
  return {
    id: day.id,
    date: day.date,
    name: day.name,
    intensity: day.intensity,
    lifts: day.lifts.map((lift) => ({
      id: lift.id,
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
    }>;
  };
  return payload.lifts.map((lift) => ({
    id: lift.id,
    name: lift.name,
    category: lift.category,
    variationOf: lift.variation_of,
  }));
}

export async function createSavedLift(
  name: string,
  categoryId: number | null,
  variationOfId: number | null
): Promise<SavedLift> {
  const trimmedName = name.trim();
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
      category_id: categoryId,
      variation_of_id: variationOfId,
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
  };
  return {
    id: payload.id,
    name: payload.name,
    category: payload.category,
    variationOf: payload.variation_of,
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

export async function saveLiftTemplate(days: Array<{ name: string; liftIds: number[] }>): Promise<LiftTemplateDay[]> {
  const response = await fetch("/api/lift-templates/", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "X-CSRFToken": getCsrfToken(),
    },
    body: JSON.stringify({
      days: days.map((day) => ({
        name: day.name,
        lift_ids: day.liftIds,
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
  intensity: TrainingIntensity;
  lifts: Array<{
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
      intensity: day.intensity,
      lifts: day.lifts.map((lift) => ({
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
