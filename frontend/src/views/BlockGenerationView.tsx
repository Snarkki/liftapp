import { useEffect, useState } from "react";

import {
  createCategory,
  createSavedLift,
  deleteLiftTemplateDay,
  deleteSavedLift,
  fetchCategories,
  fetchLiftTemplate,
  fetchSavedLifts,
  fetchUserProfile,
  LiftCategory,
  LiftTemplateDay,
  saveLiftTemplate,
  saveUserProfile,
  SavedLift,
  UserProfile,
} from "../api/lifts";
import { SaveState } from "../types";

type DraftTemplateDay = {
  key: string;
  name: string;
  liftIds: number[];
};

type UserProfileDraft = {
  weightUnit: UserProfile["weightUnit"];
  heightUnit: UserProfile["heightUnit"];
  height: string;
  weight: string;
  gender: UserProfile["gender"];
};

const DEFAULT_PROFILE_DRAFT: UserProfileDraft = {
  weightUnit: "kg",
  heightUnit: "cm",
  height: "",
  weight: "",
  gender: "unspecified",
};

function nextDayKey(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createDraftDay(name = ""): DraftTemplateDay {
  return { key: nextDayKey(), name, liftIds: [] };
}

function draftFromUserProfile(profile: UserProfile): UserProfileDraft {
  return {
    weightUnit: profile.weightUnit,
    heightUnit: profile.heightUnit,
    height: profile.height !== null ? String(profile.height) : "",
    weight: profile.weight !== null ? String(profile.weight) : "",
    gender: profile.gender,
  };
}

function parseOptionalNonNegativeNumber(value: string, fieldName: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${fieldName} must be 0 or greater.`);
  }

  return parsed;
}

export function SettingsView() {
  const [categories, setCategories] = useState<LiftCategory[]>([]);
  const [lifts, setLifts] = useState<SavedLift[]>([]);
  const [templateDays, setTemplateDays] = useState<LiftTemplateDay[]>([]);
  const [draftDays, setDraftDays] = useState<DraftTemplateDay[]>([createDraftDay("Pull Day")]);

  const [profileDraft, setProfileDraft] = useState<UserProfileDraft>(DEFAULT_PROFILE_DRAFT);

  const [newCategoryName, setNewCategoryName] = useState("");
  const [newLiftName, setNewLiftName] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("");
  const [selectedVariationOfId, setSelectedVariationOfId] = useState<string>("");

  const [loadMessage, setLoadMessage] = useState("Loading settings...");
  const [profileState, setProfileState] = useState<SaveState>({ kind: "idle" });
  const [categoryState, setCategoryState] = useState<SaveState>({ kind: "idle" });
  const [liftState, setLiftState] = useState<SaveState>({ kind: "idle" });
  const [templateState, setTemplateState] = useState<SaveState>({ kind: "idle" });
  const [deletingLiftId, setDeletingLiftId] = useState<number | null>(null);
  const [deletingTemplateDayId, setDeletingTemplateDayId] = useState<number | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      try {
        const [profile, categoryList, liftList, days] = await Promise.all([
          fetchUserProfile(),
          fetchCategories(),
          fetchSavedLifts(),
          fetchLiftTemplate(),
        ]);
        if (!isMounted) {
          return;
        }

        setProfileDraft(draftFromUserProfile(profile));
        setCategories(categoryList);
        setLifts(liftList);
        setTemplateDays(days);
        setLoadMessage("Settings loaded.");
      } catch (error) {
        if (!isMounted) {
          return;
        }
        const message = error instanceof Error ? error.message : "Failed to load settings.";
        setLoadMessage(message);
      }
    };

    void loadData();

    return () => {
      isMounted = false;
    };
  }, []);

  const baseLifts = lifts.filter((lift) => lift.variationOf === null);

  const handleSaveProfile = async () => {
    try {
      setProfileState({ kind: "saving" });

      const saved = await saveUserProfile({
        weightUnit: profileDraft.weightUnit,
        heightUnit: profileDraft.heightUnit,
        height: parseOptionalNonNegativeNumber(profileDraft.height, "Height"),
        weight: parseOptionalNonNegativeNumber(profileDraft.weight, "Weight"),
        gender: profileDraft.gender,
      });

      setProfileDraft(draftFromUserProfile(saved));
      setProfileState({ kind: "success", message: "User details saved." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save user details.";
      setProfileState({ kind: "error", message });
    }
  };

  const handleCreateCategory = async () => {
    try {
      setCategoryState({ kind: "saving" });
      const created = await createCategory(newCategoryName);
      setCategories((current) => {
        if (current.some((category) => category.id === created.id)) {
          return current;
        }
        return [...current, created].sort((a, b) => a.name.localeCompare(b.name));
      });
      setNewCategoryName("");
      setCategoryState({ kind: "success", message: "Category saved." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create category.";
      setCategoryState({ kind: "error", message });
    }
  };

  const handleCreateLift = async () => {
    try {
      setLiftState({ kind: "saving" });
      const categoryId = selectedCategoryId ? Number(selectedCategoryId) : null;
      const variationOfId = selectedVariationOfId ? Number(selectedVariationOfId) : null;
      const created = await createSavedLift(newLiftName, categoryId, variationOfId);
      setLifts((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
      setNewLiftName("");
      setSelectedVariationOfId("");
      setLiftState({ kind: "success", message: "Lift saved." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create lift.";
      setLiftState({ kind: "error", message });
    }
  };

  const handleDeleteLift = async (liftId: number) => {
    try {
      setDeletingLiftId(liftId);
      await deleteSavedLift(liftId);
      setLifts((current) => current.filter((lift) => lift.id !== liftId));
      setDraftDays((current) =>
        current.map((day) => ({
          ...day,
          liftIds: day.liftIds.filter((id) => id !== liftId),
        }))
      );
      if (selectedVariationOfId && Number(selectedVariationOfId) === liftId) {
        setSelectedVariationOfId("");
      }
      setLiftState({ kind: "success", message: "Lift deleted." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete lift.";
      setLiftState({ kind: "error", message });
    } finally {
      setDeletingLiftId(null);
    }
  };

  const handleDeleteTemplateDay = async (dayId: number) => {
    try {
      setDeletingTemplateDayId(dayId);
      await deleteLiftTemplateDay(dayId);
      setTemplateDays((current) => current.filter((day) => day.id !== dayId));
      setTemplateState({ kind: "success", message: "Favorite day deleted." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete favorite day.";
      setTemplateState({ kind: "error", message });
    } finally {
      setDeletingTemplateDayId(null);
    }
  };

  const updateDraftDayName = (key: string, name: string) => {
    setDraftDays((current) =>
      current.map((day) =>
        day.key === key
          ? {
              ...day,
              name,
            }
          : day
      )
    );
  };

  const toggleLiftForDay = (key: string, liftId: number) => {
    setDraftDays((current) =>
      current.map((day) => {
        if (day.key !== key) {
          return day;
        }
        const exists = day.liftIds.includes(liftId);
        return {
          ...day,
          liftIds: exists ? day.liftIds.filter((id) => id !== liftId) : [...day.liftIds, liftId],
        };
      })
    );
  };

  const handleAddDraftDay = () => {
    setDraftDays((current) => [...current, createDraftDay()]);
  };

  const handleRemoveDraftDay = (key: string) => {
    setDraftDays((current) => current.filter((day) => day.key !== key));
  };

  const handleSaveTemplate = async () => {
    if (draftDays.length === 0) {
      setTemplateState({ kind: "error", message: "Add at least one favorite day." });
      return;
    }

    const usedNames = new Set<string>();

    for (const day of draftDays) {
      const trimmedName = day.name.trim();
      if (!trimmedName) {
        setTemplateState({ kind: "error", message: "Each day requires a name." });
        return;
      }

      const normalizedName = trimmedName.toLowerCase();
      if (usedNames.has(normalizedName)) {
        setTemplateState({ kind: "error", message: `Duplicate day name: ${trimmedName}.` });
        return;
      }
      usedNames.add(normalizedName);

      if (day.liftIds.length === 0) {
        setTemplateState({ kind: "error", message: `${trimmedName} must include at least one lift.` });
        return;
      }
    }

    try {
      setTemplateState({ kind: "saving" });
      const savedDays = await saveLiftTemplate(
        draftDays.map((day) => ({
          name: day.name.trim(),
          liftIds: day.liftIds,
        }))
      );
      setTemplateDays(savedDays);
      setTemplateState({ kind: "success", message: "Favorite days saved." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save favorite days.";
      setTemplateState({ kind: "error", message });
    }
  };

  return (
    <section className="space-y-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="text-xl font-semibold">Settings</h2>
        <p className="mt-1 text-sm text-slate-600">
          Manage user details, units of measure, saved lifts, and favorite training day templates.
        </p>
        <p className="mt-2 text-xs text-slate-500">{loadMessage}</p>
      </div>

      <div className="space-y-3 rounded-md border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-800">1. User Details</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm text-slate-700">
            <span>Weight Unit</span>
            <select
              value={profileDraft.weightUnit}
              onChange={(event) =>
                setProfileDraft((current) => ({
                  ...current,
                  weightUnit: event.target.value as UserProfile["weightUnit"],
                }))
              }
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-200 focus:ring-2"
            >
              <option value="kg">kg</option>
              <option value="lb">lb</option>
            </select>
          </label>

          <label className="space-y-1 text-sm text-slate-700">
            <span>Height Unit</span>
            <select
              value={profileDraft.heightUnit}
              onChange={(event) =>
                setProfileDraft((current) => ({
                  ...current,
                  heightUnit: event.target.value as UserProfile["heightUnit"],
                }))
              }
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-200 focus:ring-2"
            >
              <option value="cm">cm</option>
              <option value="inch">inch</option>
            </select>
          </label>

          <label className="space-y-1 text-sm text-slate-700">
            <span>Height ({profileDraft.heightUnit})</span>
            <input
              value={profileDraft.height}
              onChange={(event) => setProfileDraft((current) => ({ ...current, height: event.target.value }))}
              placeholder={`e.g. ${profileDraft.heightUnit === "cm" ? "180" : "71"}`}
              type="number"
              min={0}
              step="0.01"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-200 focus:ring-2"
            />
          </label>

          <label className="space-y-1 text-sm text-slate-700">
            <span>Weight ({profileDraft.weightUnit})</span>
            <input
              value={profileDraft.weight}
              onChange={(event) => setProfileDraft((current) => ({ ...current, weight: event.target.value }))}
              placeholder={`e.g. ${profileDraft.weightUnit === "kg" ? "82" : "180"}`}
              type="number"
              min={0}
              step="0.01"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-200 focus:ring-2"
            />
          </label>

          <label className="space-y-1 text-sm text-slate-700 md:col-span-2">
            <span>Gender</span>
            <select
              value={profileDraft.gender}
              onChange={(event) =>
                setProfileDraft((current) => ({
                  ...current,
                  gender: event.target.value as UserProfile["gender"],
                }))
              }
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-200 focus:ring-2"
            >
              <option value="unspecified">Prefer not to say</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="non-binary">Non-binary</option>
              <option value="other">Other</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleSaveProfile}
            disabled={profileState.kind === "saving"}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:bg-slate-500"
          >
            {profileState.kind === "saving" ? "Saving..." : "Save User Details"}
          </button>
          {profileState.kind === "success" && <span className="text-sm text-emerald-600">{profileState.message}</span>}
          {profileState.kind === "error" && <span className="text-sm text-rose-600">{profileState.message}</span>}
        </div>

        <p className="text-xs text-slate-500">Lift weights in calendar view will use your selected weight unit.</p>
      </div>

      <div className="space-y-3 rounded-md border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-800">2. Lift Categories</h3>
        <div className="flex flex-wrap gap-2">
          <input
            value={newCategoryName}
            onChange={(event) => setNewCategoryName(event.target.value)}
            placeholder="e.g. Compound, Pull, Legs"
            className="min-w-72 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-200 focus:ring-2"
          />
          <button
            type="button"
            onClick={handleCreateCategory}
            disabled={categoryState.kind === "saving"}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:bg-slate-500"
          >
            {categoryState.kind === "saving" ? "Saving..." : "Add Category"}
          </button>
        </div>
        {categoryState.kind === "success" && <p className="text-sm text-emerald-600">{categoryState.message}</p>}
        {categoryState.kind === "error" && <p className="text-sm text-rose-600">{categoryState.message}</p>}
        <div className="flex flex-wrap gap-2">
          {categories.map((category) => (
            <span key={category.id} className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-700">
              {category.name}
            </span>
          ))}
          {categories.length === 0 && <span className="text-xs text-slate-500">No categories yet.</span>}
        </div>
      </div>

      <div className="space-y-3 rounded-md border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-800">3. Saved Lifts</h3>
        <div className="grid gap-2 md:grid-cols-4">
          <input
            value={newLiftName}
            onChange={(event) => setNewLiftName(event.target.value)}
            placeholder="e.g. Deadlift"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-200 focus:ring-2"
          />
          <select
            value={selectedCategoryId}
            onChange={(event) => setSelectedCategoryId(event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-200 focus:ring-2"
          >
            <option value="">No category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <select
            value={selectedVariationOfId}
            onChange={(event) => setSelectedVariationOfId(event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-200 focus:ring-2"
          >
            <option value="">Base lift (no variation)</option>
            {baseLifts.map((lift) => (
              <option key={lift.id} value={lift.id}>
                Variation of: {lift.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleCreateLift}
            disabled={liftState.kind === "saving"}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:bg-slate-500"
          >
            {liftState.kind === "saving" ? "Saving..." : "Add Lift"}
          </button>
        </div>
        {liftState.kind === "success" && <p className="text-sm text-emerald-600">{liftState.message}</p>}
        {liftState.kind === "error" && <p className="text-sm text-rose-600">{liftState.message}</p>}
        <div className="grid gap-2 md:grid-cols-2">
          {lifts.map((lift) => (
            <div key={lift.id} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm">
              <div>
                <span className="font-medium text-slate-800">{lift.name}</span>
                <span className="ml-2 text-xs text-slate-500">{lift.category?.name ?? "Uncategorized"}</span>
                {lift.variationOf && <span className="ml-2 text-xs text-blue-700">Variation of {lift.variationOf.name}</span>}
              </div>
              <button
                type="button"
                onClick={() => handleDeleteLift(lift.id)}
                disabled={deletingLiftId === lift.id}
                className="rounded-md border border-rose-300 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-60"
              >
                {deletingLiftId === lift.id ? "Deleting..." : "Delete"}
              </button>
            </div>
          ))}
          {lifts.length === 0 && <span className="text-xs text-slate-500">No saved lifts yet.</span>}
        </div>
      </div>

      <div className="space-y-4 rounded-md border border-slate-200 p-4">
        <h3 className="text-sm font-semibold text-slate-800">4. Favorite Days</h3>
        {draftDays.map((day) => (
          <div key={day.key} className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm text-slate-700">Day Name</label>
              <input
                type="text"
                value={day.name}
                onChange={(event) => updateDraftDayName(day.key, event.target.value)}
                placeholder="e.g. Pull Day"
                className="w-48 rounded-md border border-slate-300 px-2 py-1 text-sm outline-none ring-blue-200 focus:ring-2"
              />
              {draftDays.length > 1 && (
                <button
                  type="button"
                  onClick={() => handleRemoveDraftDay(day.key)}
                  className="rounded-md border border-rose-300 px-3 py-1 text-xs text-rose-700 hover:bg-rose-50"
                >
                  Remove Favorite Day
                </button>
              )}
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {lifts.map((lift) => (
                <label key={`${day.key}-${lift.id}`} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={day.liftIds.includes(lift.id)}
                    onChange={() => toggleLiftForDay(day.key, lift.id)}
                  />
                  <span>{lift.name}</span>
                  <span className="text-xs text-slate-500">{lift.category?.name ?? "Uncategorized"}</span>
                  {lift.variationOf && <span className="text-xs text-blue-700">({lift.variationOf.name} variation)</span>}
                </label>
              ))}
            </div>
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleAddDraftDay}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100"
          >
            Add Favorite Day
          </button>
          <button
            type="button"
            onClick={handleSaveTemplate}
            disabled={templateState.kind === "saving"}
            className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600 disabled:bg-blue-400"
          >
            {templateState.kind === "saving" ? "Saving..." : "Save Favorite Days"}
          </button>
          {templateState.kind === "success" && <span className="text-sm text-emerald-600">{templateState.message}</span>}
          {templateState.kind === "error" && <span className="text-sm text-rose-600">{templateState.message}</span>}
        </div>

        <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
          <h4 className="text-sm font-semibold text-slate-800">Saved Favorite Days</h4>
          {templateDays.length === 0 && <p className="text-sm text-slate-500">No favorite days saved yet.</p>}
          {templateDays.map((day) => (
            <div key={day.id} className="flex items-start justify-between rounded-md border border-slate-200 bg-white p-3">
              <div>
                <p className="text-sm font-medium text-slate-800">{day.name}</p>
                <p className="mt-1 text-xs text-slate-600">{day.lifts.map((lift) => lift.name).join(" | ")}</p>
              </div>
              <button
                type="button"
                onClick={() => handleDeleteTemplateDay(day.id)}
                disabled={deletingTemplateDayId === day.id}
                className="rounded-md border border-rose-300 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-60"
              >
                {deletingTemplateDayId === day.id ? "Deleting..." : "Delete"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export const BlockGenerationView = SettingsView;
