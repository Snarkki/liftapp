import { useEffect, useMemo, useState } from "react";
import { FaBolt, FaCalendarAlt, FaClone, FaPlus, FaSave, FaTrashAlt } from "react-icons/fa";

import {
  createCategory,
  createSavedLift,
  deleteCategory,
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

type UserProfileDraft = {
  weightUnit: UserProfile["weightUnit"];
  heightUnit: UserProfile["heightUnit"];
  height: string;
  weight: string;
  gender: UserProfile["gender"];
};

type PresetLiftDraft = {
  key: string;
  savedLiftId: string;
  sets: string;
  reps: string;
  weight: string;
};

type PresetDayDraft = {
  key: string;
  id: number | null;
  name: string;
  lifts: PresetLiftDraft[];
};

const DEFAULT_PROFILE_DRAFT: UserProfileDraft = {
  weightUnit: "kg",
  heightUnit: "cm",
  height: "",
  weight: "",
  gender: "unspecified",
};

function nextKey(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

function liftDefaultsLabel(lift: SavedLift): string {
  const parts: string[] = [];

  if (lift.defaultSets !== null && lift.defaultReps !== null) {
    parts.push(`${lift.defaultSets} x ${lift.defaultReps}`);
  } else {
    if (lift.defaultSets !== null) {
      parts.push(`${lift.defaultSets} sets`);
    }
    if (lift.defaultReps !== null) {
      parts.push(`${lift.defaultReps} reps`);
    }
  }

  if (lift.defaultWeight !== null) {
    parts.push(`${lift.defaultWeight}`);
  }

  return parts.length > 0 ? parts.join(" • ") : "No default set data";
}

function parseOptionalPositiveInt(value: string, fieldName: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${fieldName} must be a positive integer.`);
  }

  return parsed;
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

function optionalNumberString(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

function createPresetLiftDraft(savedLift?: SavedLift, overrides?: { sets?: number | null; reps?: number | null; weight?: number | null }): PresetLiftDraft {
  return {
    key: nextKey(),
    savedLiftId: savedLift ? String(savedLift.id) : "",
    sets: optionalNumberString(overrides?.sets ?? savedLift?.defaultSets ?? null),
    reps: optionalNumberString(overrides?.reps ?? savedLift?.defaultReps ?? null),
    weight: optionalNumberString(overrides?.weight ?? savedLift?.defaultWeight ?? null),
  };
}

function draftFromTemplateDay(day: LiftTemplateDay, savedLifts: SavedLift[]): PresetDayDraft {
  return {
    key: nextKey(),
    id: day.id,
    name: day.name,
    lifts: day.lifts.map((lift) => {
      const matchingSavedLift = savedLifts.find((savedLift) => savedLift.id === lift.savedLiftId);
      return createPresetLiftDraft(matchingSavedLift, {
        sets: lift.sets,
        reps: lift.reps,
        weight: lift.weight,
      });
    }),
  };
}

function createPresetDayDraft(savedLifts: SavedLift[]): PresetDayDraft {
  return {
    key: nextKey(),
    id: null,
    name: "",
    lifts: savedLifts.length > 0 ? [createPresetLiftDraft(savedLifts[0])] : [],
  };
}

function statusMessage(state: SaveState): { text: string; className: string } | null {
  if (state.kind === "success") {
    return { text: state.message, className: "text-emerald-600" };
  }

  if (state.kind === "error") {
    return { text: state.message, className: "text-rose-600" };
  }

  if (state.kind === "saving") {
    return { text: "Saving...", className: "text-sky-700" };
  }

  return null;
}

function selectOptionsForLiftFilter(
  filteredLifts: SavedLift[],
  allLifts: SavedLift[],
  selectedLiftId: string
): SavedLift[] {
  if (!selectedLiftId) {
    return filteredLifts;
  }

  const selectedLift = allLifts.find((lift) => lift.id === Number(selectedLiftId));
  if (!selectedLift || filteredLifts.some((lift) => lift.id === selectedLift.id)) {
    return filteredLifts;
  }

  return [selectedLift, ...filteredLifts];
}

export function SettingsView() {
  const [tags, setTags] = useState<LiftCategory[]>([]);
  const [savedLifts, setSavedLifts] = useState<SavedLift[]>([]);
  const [presetDays, setPresetDays] = useState<PresetDayDraft[]>([]);
  const [activePresetDayKey, setActivePresetDayKey] = useState("");
  const [profileDraft, setProfileDraft] = useState<UserProfileDraft>(DEFAULT_PROFILE_DRAFT);

  const [newTagName, setNewTagName] = useState("");
  const [selectedTagId, setSelectedTagId] = useState("");
  const [savedLiftTagFilter, setSavedLiftTagFilter] = useState("");
  const [presetLiftTagFilter, setPresetLiftTagFilter] = useState("");
  const [newLiftName, setNewLiftName] = useState("");
  const [newLiftSets, setNewLiftSets] = useState("");
  const [newLiftReps, setNewLiftReps] = useState("");
  const [newLiftWeight, setNewLiftWeight] = useState("");

  const [loadMessage, setLoadMessage] = useState("Loading settings...");
  const [tagState, setTagState] = useState<SaveState>({ kind: "idle" });
  const [liftState, setLiftState] = useState<SaveState>({ kind: "idle" });
  const [presetState, setPresetState] = useState<SaveState>({ kind: "idle" });
  const [profileState, setProfileState] = useState<SaveState>({ kind: "idle" });
  const [deletingTagId, setDeletingTagId] = useState<number | null>(null);
  const [deletingLiftId, setDeletingLiftId] = useState<number | null>(null);
  const [deletingPresetDayKey, setDeletingPresetDayKey] = useState<string | null>(null);
  const [savingPresetDayKey, setSavingPresetDayKey] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      try {
        const [profile, categoryList, lifts, templates] = await Promise.all([
          fetchUserProfile(),
          fetchCategories(),
          fetchSavedLifts(),
          fetchLiftTemplate(),
        ]);

        if (!isMounted) {
          return;
        }

        const loadedPresetDays = templates.map((day) => draftFromTemplateDay(day, lifts));
        setProfileDraft(draftFromUserProfile(profile));
        setTags(categoryList);
        setSavedLifts(lifts);
        setPresetDays(loadedPresetDays);
        setActivePresetDayKey(loadedPresetDays[0]?.key ?? "");
        setLoadMessage("Tags, lift library, and presets are ready.");
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

  const sortedSavedLifts = useMemo(
    () => [...savedLifts].sort((left, right) => left.name.localeCompare(right.name)),
    [savedLifts]
  );
  const sortedTags = useMemo(() => [...tags].sort((left, right) => left.name.localeCompare(right.name)), [tags]);
  const visibleSavedLifts = useMemo(() => {
    if (!savedLiftTagFilter) {
      return sortedSavedLifts;
    }

    const filterId = Number(savedLiftTagFilter);
    return sortedSavedLifts.filter((lift) => lift.category?.id === filterId);
  }, [savedLiftTagFilter, sortedSavedLifts]);
  const activePresetDay = useMemo(
    () => presetDays.find((day) => day.key === activePresetDayKey) ?? null,
    [activePresetDayKey, presetDays]
  );

  const presetLiftOptions = useMemo(() => {
    if (!presetLiftTagFilter) {
      return sortedSavedLifts;
    }

    const filterId = Number(presetLiftTagFilter);
    return sortedSavedLifts.filter((lift) => lift.category?.id === filterId);
  }, [presetLiftTagFilter, sortedSavedLifts]);

  const profileStatus = statusMessage(profileState);
  const tagStatus = statusMessage(tagState);
  const liftStatus = statusMessage(liftState);
  const presetStatus = statusMessage(presetState);

  useEffect(() => {
    if (presetDays.length === 0) {
      if (activePresetDayKey) {
        setActivePresetDayKey("");
      }
      return;
    }

    if (!presetDays.some((day) => day.key === activePresetDayKey)) {
      setActivePresetDayKey(presetDays[0].key);
    }
  }, [activePresetDayKey, presetDays]);

  const updatePresetDay = (dayKey: string, updater: (day: PresetDayDraft) => PresetDayDraft) => {
    setPresetDays((current) => current.map((day) => (day.key === dayKey ? updater(day) : day)));
  };

  const handleCreateTag = async () => {
    try {
      setTagState({ kind: "saving" });
      const created = await createCategory(newTagName);
      setTags((current) => [...current, created].sort((left, right) => left.name.localeCompare(right.name)));
      setSelectedTagId(String(created.id));
      setNewTagName("");
      setTagState({ kind: "success", message: "Tag added." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save tag.";
      setTagState({ kind: "error", message });
    }
  };

  const handleDeleteTag = async (tagId: number) => {
    try {
      setDeletingTagId(tagId);
      await deleteCategory(tagId);
      setTags((current) => current.filter((tag) => tag.id !== tagId));
      setSavedLifts((current) =>
        current.map((lift) => (lift.category?.id === tagId ? { ...lift, category: null } : lift))
      );

      if (selectedTagId === String(tagId)) {
        setSelectedTagId("");
      }
      if (savedLiftTagFilter === String(tagId)) {
        setSavedLiftTagFilter("");
      }
      if (presetLiftTagFilter === String(tagId)) {
        setPresetLiftTagFilter("");
      }

      setTagState({ kind: "success", message: "Tag deleted." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete tag.";
      setTagState({ kind: "error", message });
    } finally {
      setDeletingTagId(null);
    }
  };

  const handleCreateLift = async () => {
    try {
      setLiftState({ kind: "saving" });
      const created = await createSavedLift({
        name: newLiftName,
        categoryId: selectedTagId ? Number(selectedTagId) : null,
        defaultSets: parseOptionalPositiveInt(newLiftSets, "Default sets"),
        defaultReps: parseOptionalPositiveInt(newLiftReps, "Default reps"),
        defaultWeight: parseOptionalNonNegativeNumber(newLiftWeight, "Default weight"),
      });

      setSavedLifts((current) => [...current, created]);
      setNewLiftName("");
      setSelectedTagId("");
      setNewLiftSets("");
      setNewLiftReps("");
      setNewLiftWeight("");
      setLiftState({ kind: "success", message: "Lift added to your library." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save lift.";
      setLiftState({ kind: "error", message });
    }
  };

  const handleDeleteLift = async (liftId: number) => {
    try {
      setDeletingLiftId(liftId);
      await deleteSavedLift(liftId);
      setSavedLifts((current) => current.filter((lift) => lift.id !== liftId));
      setPresetDays((current) =>
        current.map((day) => ({
          ...day,
          lifts: day.lifts.filter((lift) => Number(lift.savedLiftId) !== liftId),
        }))
      );
      setLiftState({ kind: "success", message: "Lift removed from your library." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete lift.";
      setLiftState({ kind: "error", message });
    } finally {
      setDeletingLiftId(null);
    }
  };

  const handleSaveProfile = async () => {
    try {
      setProfileState({ kind: "saving" });
      const savedProfile = await saveUserProfile({
        weightUnit: profileDraft.weightUnit,
        heightUnit: profileDraft.heightUnit,
        height: parseOptionalNonNegativeNumber(profileDraft.height, "Height"),
        weight: parseOptionalNonNegativeNumber(profileDraft.weight, "Weight"),
        gender: profileDraft.gender,
      });

      setProfileDraft(draftFromUserProfile(savedProfile));
      setProfileState({ kind: "success", message: "Preferences saved." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save preferences.";
      setProfileState({ kind: "error", message });
    }
  };

  const handleAddPresetDay = () => {
    const nextDay = createPresetDayDraft(sortedSavedLifts);
    setPresetDays((current) => [...current, nextDay]);
    setActivePresetDayKey(nextDay.key);
  };

  const handleDuplicatePresetDay = (dayKey: string) => {
    const existing = presetDays.find((day) => day.key === dayKey);
    if (!existing) {
      return;
    }

    const duplicatedDay = {
      ...existing,
      key: nextKey(),
      id: null,
      name: existing.name ? `${existing.name} Copy` : "",
      lifts: existing.lifts.map((lift) => ({ ...lift, key: nextKey() })),
    };

    setPresetDays((current) => [...current, duplicatedDay]);
    setActivePresetDayKey(duplicatedDay.key);
  };

  const handleRemovePresetDay = async (dayKey: string) => {
    const presetDay = presetDays.find((day) => day.key === dayKey);
    if (!presetDay) {
      return;
    }

    if (presetDay.id === null) {
      setPresetDays((current) => current.filter((day) => day.key !== dayKey));
      return;
    }

    try {
      setDeletingPresetDayKey(dayKey);
      await deleteLiftTemplateDay(presetDay.id);
      setPresetDays((current) => current.filter((day) => day.key !== dayKey));
      setPresetState({ kind: "success", message: "Preset day deleted." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete preset day.";
      setPresetState({ kind: "error", message });
    } finally {
      setDeletingPresetDayKey(null);
    }
  };

  const handleAddLiftToPreset = (dayKey: string) => {
    if (sortedSavedLifts.length === 0) {
      setPresetState({ kind: "error", message: "Create at least one saved lift first." });
      return;
    }

    updatePresetDay(dayKey, (day) => ({
      ...day,
      lifts: [...day.lifts, createPresetLiftDraft(sortedSavedLifts[0])],
    }));
  };

  const handlePresetLiftSelection = (dayKey: string, liftKey: string, savedLiftId: string) => {
    updatePresetDay(dayKey, (day) => ({
      ...day,
      lifts: day.lifts.map((lift) => {
        if (lift.key !== liftKey) {
          return lift;
        }

        const savedLift = sortedSavedLifts.find((candidate) => candidate.id === Number(savedLiftId));
        return {
          ...lift,
          savedLiftId,
          sets: savedLift?.defaultSets !== null && savedLift?.defaultSets !== undefined ? String(savedLift.defaultSets) : "",
          reps: savedLift?.defaultReps !== null && savedLift?.defaultReps !== undefined ? String(savedLift.defaultReps) : "",
          weight:
            savedLift?.defaultWeight !== null && savedLift?.defaultWeight !== undefined
              ? String(savedLift.defaultWeight)
              : "",
        };
      }),
    }));
  };

  const handleSavePresetDay = async (dayKey: string) => {
    const presetDay = presetDays.find((day) => day.key === dayKey);
    if (!presetDay) {
      return;
    }

    const trimmedName = presetDay.name.trim();
    if (!trimmedName) {
      setPresetState({ kind: "error", message: "Preset day name is required." });
      return;
    }

    if (presetDay.lifts.length === 0) {
      setPresetState({ kind: "error", message: `${trimmedName} needs at least one lift.` });
      return;
    }

    try {
      const lifts = presetDay.lifts.map((lift, index) => {
        const savedLiftId = Number(lift.savedLiftId);
        if (!savedLiftId) {
          throw new Error(`${trimmedName}: lift ${index + 1} needs a saved lift.`);
        }

        return {
          savedLiftId,
          sets: parseOptionalPositiveInt(lift.sets, `${trimmedName} lift ${index + 1} sets`),
          reps: parseOptionalPositiveInt(lift.reps, `${trimmedName} lift ${index + 1} reps`),
          weight: parseOptionalNonNegativeNumber(lift.weight, `${trimmedName} lift ${index + 1} weight`),
        };
      });

      setSavingPresetDayKey(dayKey);
      setPresetState({ kind: "saving" });
      const savedTemplateDays = await saveLiftTemplate([
        {
          id: presetDay.id ?? undefined,
          name: trimmedName,
          lifts,
        },
      ]);

      const savedTemplateDay =
        savedTemplateDays.find((day) => day.id === presetDay.id) ??
        savedTemplateDays.find((day) => day.name.trim().toLowerCase() === trimmedName.toLowerCase());

      if (!savedTemplateDay) {
        throw new Error("Saved preset day could not be found in the response.");
      }

      const nextDraft = draftFromTemplateDay(savedTemplateDay, sortedSavedLifts);
      setPresetDays((current) => current.map((day) => (day.key === dayKey ? nextDraft : day)));
      setActivePresetDayKey(nextDraft.key);
      setPresetState({ kind: "success", message: `${trimmedName} saved.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save preset day.";
      setPresetState({ kind: "error", message });
    } finally {
      setSavingPresetDayKey(null);
    }
  };

  return (
    <section className="space-y-6 rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#fffdf8_0%,#f8fbff_58%,#eef6ff_100%)] p-4 shadow-sm sm:p-6">
      <div className="space-y-2">
        <p className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white">
          <FaBolt />
          Settings
        </p>
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold text-slate-900">Lift library and preset day builder</h2>
            <p className="max-w-3xl text-sm text-slate-600">
              Organize lifts with tags, optionally store set targets for the ones that matter, and build reusable preset days without giant scrolling lists.
            </p>
          </div>
          <p className="text-xs text-slate-500">{loadMessage}</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_1.4fr]">
        <div className="space-y-6">
          <section className="rounded-[24px] border border-sky-200 bg-white/90 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Tags</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">Manage lift tags</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Use tags to keep the lift dropdowns manageable when the library gets large.
                </p>
              </div>
              <div className="rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-800">
                {sortedTags.length} tags
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
              <input
                value={newTagName}
                onChange={(event) => setNewTagName(event.target.value)}
                placeholder="Deadlifts, Squats, Bench..."
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none ring-sky-200 focus:ring-2"
              />
              <button
                type="button"
                onClick={handleCreateTag}
                disabled={tagState.kind === "saving"}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-500"
              >
                <FaPlus />
                {tagState.kind === "saving" ? "Saving tag..." : "Add tag"}
              </button>
            </div>

            {tagStatus && <p className={`mt-4 text-sm ${tagStatus.className}`}>{tagStatus.text}</p>}

            <div className="mt-5 flex flex-wrap gap-2">
              {sortedTags.length === 0 && <p className="text-sm text-slate-500">No tags saved yet.</p>}
              {sortedTags.map((tag) => (
                <div key={tag.id} className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-slate-50 px-3 py-2">
                  <span className="text-sm font-medium text-slate-700">{tag.name}</span>
                  <button
                    type="button"
                    onClick={() => handleDeleteTag(tag.id)}
                    disabled={deletingTagId === tag.id}
                    aria-label={deletingTagId === tag.id ? "Deleting tag" : `Delete ${tag.name}`}
                    title={deletingTagId === tag.id ? "Deleting..." : `Delete ${tag.name}`}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-rose-300 bg-white text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                  >
                    <FaTrashAlt />
                    <span className="sr-only">{deletingTagId === tag.id ? "Deleting..." : "Delete"}</span>
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[24px] border border-amber-200 bg-white/90 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Lift Library</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">Save reusable lifts</h3>
                <p className="mt-1 text-sm text-slate-600">
                  Default sets, reps, and weight are optional. Leave them blank for movements you just want to keep in the library.
                </p>
              </div>
              <div className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                {sortedSavedLifts.length} saved
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm text-slate-700 sm:col-span-2">
                <span>Lift name</span>
                <input
                  value={newLiftName}
                  onChange={(event) => setNewLiftName(event.target.value)}
                  placeholder="Deadlift, Hyperextensions, Incline Bench..."
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none ring-amber-200 focus:ring-2"
                />
              </label>

              <label className="space-y-1 text-sm text-slate-700 sm:col-span-2">
                <span>Tag</span>
                <select
                  value={selectedTagId}
                  onChange={(event) => setSelectedTagId(event.target.value)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none ring-amber-200 focus:ring-2"
                >
                  <option value="">No tag</option>
                  {sortedTags.map((tag) => (
                    <option key={tag.id} value={tag.id}>
                      {tag.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-sm text-slate-700">
                <span>Default sets</span>
                <input
                  value={newLiftSets}
                  onChange={(event) => setNewLiftSets(event.target.value)}
                  placeholder="Optional"
                  type="number"
                  min={1}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none ring-amber-200 focus:ring-2"
                />
              </label>

              <label className="space-y-1 text-sm text-slate-700">
                <span>Default reps</span>
                <input
                  value={newLiftReps}
                  onChange={(event) => setNewLiftReps(event.target.value)}
                  placeholder="Optional"
                  type="number"
                  min={1}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none ring-amber-200 focus:ring-2"
                />
              </label>

              <label className="space-y-1 text-sm text-slate-700 sm:col-span-2">
                <span>Default weight ({profileDraft.weightUnit})</span>
                <input
                  value={newLiftWeight}
                  onChange={(event) => setNewLiftWeight(event.target.value)}
                  placeholder="Optional"
                  type="number"
                  min={0}
                  step="0.01"
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none ring-amber-200 focus:ring-2"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleCreateLift}
                disabled={liftState.kind === "saving"}
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-500"
              >
                <FaPlus />
                {liftState.kind === "saving" ? "Saving lift..." : "Add lift to library"}
              </button>
              {liftStatus && <span className={`text-sm ${liftStatus.className}`}>{liftStatus.text}</span>}
            </div>

            <div className="mt-5 space-y-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <label className="space-y-1 text-sm text-slate-700">
                  <span>Filter library by tag</span>
                  <select
                    value={savedLiftTagFilter}
                    onChange={(event) => setSavedLiftTagFilter(event.target.value)}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none ring-amber-200 focus:ring-2"
                  >
                    <option value="">All tags</option>
                    {sortedTags.map((tag) => (
                      <option key={tag.id} value={tag.id}>
                        {tag.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-end">
                  <div className="rounded-full bg-amber-100 px-3 py-2 text-xs font-medium text-amber-800">
                    {visibleSavedLifts.length} shown
                  </div>
                </div>
              </div>

              {sortedSavedLifts.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                  No lifts saved yet. Start by adding the movements you use most often.
                </div>
              )}

              {sortedSavedLifts.length > 0 && visibleSavedLifts.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                  No lifts match the selected tag.
                </div>
              )}

              {visibleSavedLifts.map((lift) => (
                <div
                  key={lift.id}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold text-slate-900">{lift.name}</p>
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
                        {lift.category?.name ?? "Untagged"}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600">{liftDefaultsLabel(lift)}</p>
                  </div>
              <button
                type="button"
                onClick={() => handleDeleteLift(lift.id)}
                disabled={deletingLiftId === lift.id}
                aria-label={deletingLiftId === lift.id ? "Deleting lift" : `Delete ${lift.name}`}
                title={deletingLiftId === lift.id ? "Deleting..." : `Delete ${lift.name}`}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-rose-300 bg-white text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
              >
                <FaTrashAlt />
                <span className="sr-only">{deletingLiftId === lift.id ? "Deleting..." : "Delete"}</span>
              </button>
            </div>
          ))}
            </div>
          </section>

          <section className="rounded-[24px] border border-slate-200 bg-white/90 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Preferences</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-900">Weight and profile settings</h3>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm text-slate-700">
                <span>Weight unit</span>
                <select
                  value={profileDraft.weightUnit}
                  onChange={(event) =>
                    setProfileDraft((current) => ({
                      ...current,
                      weightUnit: event.target.value as UserProfile["weightUnit"],
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none ring-sky-200 focus:ring-2"
                >
                  <option value="kg">kg</option>
                  <option value="lb">lb</option>
                </select>
              </label>

              <label className="space-y-1 text-sm text-slate-700">
                <span>Height unit</span>
                <select
                  value={profileDraft.heightUnit}
                  onChange={(event) =>
                    setProfileDraft((current) => ({
                      ...current,
                      heightUnit: event.target.value as UserProfile["heightUnit"],
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none ring-sky-200 focus:ring-2"
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
                  type="number"
                  min={0}
                  step="0.01"
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none ring-sky-200 focus:ring-2"
                />
              </label>

              <label className="space-y-1 text-sm text-slate-700">
                <span>Weight ({profileDraft.weightUnit})</span>
                <input
                  value={profileDraft.weight}
                  onChange={(event) => setProfileDraft((current) => ({ ...current, weight: event.target.value }))}
                  type="number"
                  min={0}
                  step="0.01"
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none ring-sky-200 focus:ring-2"
                />
              </label>

              <label className="space-y-1 text-sm text-slate-700 sm:col-span-2">
                <span>Gender</span>
                <select
                  value={profileDraft.gender}
                  onChange={(event) =>
                    setProfileDraft((current) => ({
                      ...current,
                      gender: event.target.value as UserProfile["gender"],
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none ring-sky-200 focus:ring-2"
                >
                  <option value="unspecified">Prefer not to say</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="non-binary">Non-binary</option>
                  <option value="other">Other</option>
                </select>
              </label>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={profileState.kind === "saving"}
                className="inline-flex items-center gap-2 rounded-full bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-600 disabled:bg-sky-400"
              >
                <FaSave />
                {profileState.kind === "saving" ? "Saving..." : "Save preferences"}
              </button>
              {profileStatus && <span className={`text-sm ${profileStatus.className}`}>{profileStatus.text}</span>}
            </div>
          </section>
        </div>

        <section className="rounded-[24px] border border-sky-200 bg-white/90 p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Preset Days</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-900">Build reusable training days</h3>
              <p className="mt-1 text-sm text-slate-600">
                Each preset day pulls from your saved lift library. Store target sets only where you want them.
              </p>
            </div>

            <button
              type="button"
              onClick={handleAddPresetDay}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-sky-300 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-800 hover:bg-sky-100"
            >
              <FaCalendarAlt />
              Add preset day
            </button>
          </div>

          {presetStatus && <p className={`mt-4 text-sm ${presetStatus.className}`}>{presetStatus.text}</p>}

          <div className="mt-5 space-y-4">
            {presetDays.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                No preset days yet. Add one and start building next week’s training flow.
              </div>
            )}

            {presetDays.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto]">
                  <label className="space-y-1 text-sm text-slate-700">
                    <span>Choose preset day</span>
                    <select
                      value={activePresetDayKey}
                      onChange={(event) => setActivePresetDayKey(event.target.value)}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none ring-sky-200 focus:ring-2"
                    >
                      {presetDays.map((day) => (
                        <option key={day.key} value={day.key}>
                          {day.name.trim() || "Untitled preset"}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-sm text-slate-700">
                    <span>Filter lift dropdown by tag</span>
                    <select
                      value={presetLiftTagFilter}
                      onChange={(event) => setPresetLiftTagFilter(event.target.value)}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none ring-sky-200 focus:ring-2"
                    >
                      <option value="">All tags</option>
                      {sortedTags.map((tag) => (
                        <option key={tag.id} value={tag.id}>
                          {tag.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex items-end">
                    <div className="rounded-full bg-sky-100 px-3 py-2 text-xs font-medium text-sky-800">
                      {presetDays.length} presets
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activePresetDay && (
              <div key={activePresetDay.key} className="rounded-[24px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex-1 space-y-3">
                    <label className="space-y-1 text-sm text-slate-700">
                      <span>Preset day name</span>
                      <input
                        value={activePresetDay.name}
                        onChange={(event) =>
                          updatePresetDay(activePresetDay.key, (current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                        placeholder="Pull Day, Lower 1, Saturday Accessories..."
                        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none ring-sky-200 focus:ring-2"
                      />
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleDuplicatePresetDay(activePresetDay.key)}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                    >
                      <FaClone />
                      Duplicate
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemovePresetDay(activePresetDay.key)}
                      disabled={deletingPresetDayKey === activePresetDay.key}
                      aria-label={
                        deletingPresetDayKey === activePresetDay.key
                          ? "Deleting preset day"
                          : `Delete ${activePresetDay.name || "preset day"}`
                      }
                      title={
                        deletingPresetDayKey === activePresetDay.key
                          ? "Deleting..."
                          : `Delete ${activePresetDay.name || "preset day"}`
                      }
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-rose-300 bg-white text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                    >
                      <FaTrashAlt />
                      <span className="sr-only">{deletingPresetDayKey === activePresetDay.key ? "Deleting..." : "Delete"}</span>
                    </button>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {activePresetDay.lifts.map((lift) => (
                    <div
                      key={lift.key}
                      className="grid gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3 md:grid-cols-[1.5fr_minmax(0,0.7fr)_minmax(0,0.7fr)_minmax(0,1fr)_auto]"
                    >
                      <label className="space-y-1 text-sm text-slate-700">
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Lift</span>
                        <select
                          value={lift.savedLiftId}
                          onChange={(event) => handlePresetLiftSelection(activePresetDay.key, lift.key, event.target.value)}
                          className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none ring-sky-200 focus:ring-2"
                        >
                          <option value="">Choose a saved lift</option>
                          {selectOptionsForLiftFilter(presetLiftOptions, sortedSavedLifts, lift.savedLiftId).map((savedLift) => (
                            <option key={savedLift.id} value={savedLift.id}>
                              {savedLift.name}{savedLift.category ? ` (${savedLift.category.name})` : ""}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="space-y-1 text-sm text-slate-700">
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Sets</span>
                        <input
                          value={lift.sets}
                          onChange={(event) =>
                            updatePresetDay(activePresetDay.key, (current) => ({
                              ...current,
                              lifts: current.lifts.map((entry) =>
                                entry.key === lift.key ? { ...entry, sets: event.target.value } : entry
                              ),
                            }))
                          }
                          type="number"
                          min={1}
                          placeholder="Optional"
                          className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none ring-sky-200 focus:ring-2"
                        />
                      </label>

                      <label className="space-y-1 text-sm text-slate-700">
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Reps</span>
                        <input
                          value={lift.reps}
                          onChange={(event) =>
                            updatePresetDay(activePresetDay.key, (current) => ({
                              ...current,
                              lifts: current.lifts.map((entry) =>
                                entry.key === lift.key ? { ...entry, reps: event.target.value } : entry
                              ),
                            }))
                          }
                          type="number"
                          min={1}
                          placeholder="Optional"
                          className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none ring-sky-200 focus:ring-2"
                        />
                      </label>

                      <label className="space-y-1 text-sm text-slate-700">
                        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          Weight ({profileDraft.weightUnit})
                        </span>
                        <input
                          value={lift.weight}
                          onChange={(event) =>
                            updatePresetDay(activePresetDay.key, (current) => ({
                              ...current,
                              lifts: current.lifts.map((entry) =>
                                entry.key === lift.key ? { ...entry, weight: event.target.value } : entry
                              ),
                            }))
                          }
                          type="number"
                          min={0}
                          step="0.01"
                          placeholder="Optional"
                          className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 outline-none ring-sky-200 focus:ring-2"
                        />
                      </label>

                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={() =>
                            updatePresetDay(activePresetDay.key, (current) => ({
                              ...current,
                              lifts: current.lifts.filter((entry) => entry.key !== lift.key),
                            }))
                          }
                          aria-label={`Remove ${sortedSavedLifts.find((savedLift) => savedLift.id === Number(lift.savedLiftId))?.name ?? "lift"} from preset`}
                          title="Remove lift"
                          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-100"
                        >
                          <FaTrashAlt />
                          <span className="sr-only">Remove</span>
                        </button>
                      </div>
                    </div>
                  ))}

                  {activePresetDay.lifts.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                      No lifts in this preset yet.
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleAddLiftToPreset(activePresetDay.key)}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                  >
                    <FaPlus />
                    Add lift
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSavePresetDay(activePresetDay.key)}
                    disabled={savingPresetDayKey === activePresetDay.key}
                    className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-500"
                  >
                    <FaSave />
                    {savingPresetDayKey === activePresetDay.key ? "Saving preset..." : "Save preset day"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

export const BlockGenerationView = SettingsView;
