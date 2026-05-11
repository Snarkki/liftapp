import { useEffect, useMemo, useRef, useState } from "react";
import {
  FaCalendarAlt,
  FaChevronLeft,
  FaChevronRight,
  FaDumbbell,
  FaMedal,
  FaPen,
  FaPlus,
  FaSave,
  FaSearch,
  FaStickyNote,
  FaTrashAlt,
} from "react-icons/fa";

import {
  deleteTrainingDay,
  fetchSuggestDayAvailability,
  fetchLiftTemplate,
  fetchSavedLifts,
  fetchTrainingDays,
  fetchUserProfile,
  LiftTemplateDay,
  SavedLift,
  saveTrainingDay,
  SuggestedDay,
  SuggestDayAvailability,
  suggestDay,
  TrainingDay,
  UserProfile,
  TrainingDayStatus,
  TrainingIntensity,
} from "../api/lifts";
import { SaveState } from "../types";
import { addMonths, getCalendarCells, isTodayInActiveMonth, monthTitle, WEEKDAY_LABELS } from "../utils/calendar";

type DraftLiftRow = {
  key: string;
  sets: string;
  reps: string;
  weight: string;
  isPr: boolean;
  notes: string;
};

type DraftLift = {
  key: string;
  savedLiftId: number | null;
  name: string;
  rows: DraftLiftRow[];
};

type GroupedTrainingLift = {
  savedLiftId: number | null;
  name: string;
  rows: Array<{
    sets: number | null;
    reps: number | null;
    weight: number | null;
    isPr: boolean;
    notes: string;
  }>;
};

type NotesModalState =
  | { mode: "edit"; liftKey: string; rowKey: string; title: string }
  | { mode: "view"; title: string; notes: string };

type SuggestHistoryWindow = "none" | "1w" | "4w" | "12w";

type SuggestDayModalState = {
  historyWindow: SuggestHistoryWindow;
  wantedDayType: string;
  isLoading: boolean;
  error: string | null;
};

const INTENSITY_OPTIONS: Array<{ value: TrainingIntensity; label: string }> = [
  { value: "minor", label: "Minor" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "non-relevant", label: "Non-relevant" },
];

const STATUS_OPTIONS: Array<{ value: TrainingDayStatus; label: string }> = [
  { value: "planned", label: "Planned" },
  { value: "completed", label: "Completed" },
];

const SUGGEST_HISTORY_OPTIONS: Array<{ value: SuggestHistoryWindow; label: string }> = [
  { value: "none", label: "No history" },
  { value: "1w", label: "1 week" },
  { value: "4w", label: "4 weeks" },
  { value: "12w", label: "12 weeks" },
];

const DEFAULT_SUGGEST_DAY_TYPES = ["Push", "Pull", "Legs", "Core", "Upper", "Lower", "Full Body", "Recovery"];

const INTENSITY_DAY_BADGE_CLASS: Record<TrainingIntensity, string> = {
  minor: "bg-emerald-100 text-emerald-800",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-rose-100 text-rose-800",
  "non-relevant": "bg-slate-200 text-slate-700",
};

const INTENSITY_DAY_CELL_CLASS: Record<TrainingIntensity, string> = {
  minor: "border-emerald-200 bg-emerald-50",
  medium: "border-amber-200 bg-amber-50",
  high: "border-rose-200 bg-rose-50",
  "non-relevant": "border-slate-200 bg-slate-100",
};

const STATUS_BADGE_CLASS: Record<TrainingDayStatus, string> = {
  planned: "bg-sky-100 text-sky-800",
  completed: "bg-slate-900 text-white",
};

const STATUS_MOBILE_LABEL: Record<TrainingDayStatus, string> = {
  planned: "Plan",
  completed: "Done",
};

function monthParam(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function isoDateForDay(activeMonth: Date, day: number): string {
  const year = activeMonth.getFullYear();
  const month = String(activeMonth.getMonth() + 1).padStart(2, "0");
  const dayPart = String(day).padStart(2, "0");
  return `${year}-${month}-${dayPart}`;
}

function nextKey(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createDraftLiftRow(
  sets = "",
  reps = "",
  weight = "",
  isPr = false,
  notes = ""
): DraftLiftRow {
  return {
    key: nextKey(),
    sets,
    reps,
    weight,
    isPr,
    notes,
  };
}

function createDraftLift(
  name = "",
  savedLiftId: number | null = null,
  rows: DraftLiftRow[] = [createDraftLiftRow()]
): DraftLift {
  return {
    key: nextKey(),
    savedLiftId,
    name,
    rows: rows.length > 0 ? rows : [createDraftLiftRow()],
  };
}

function createDraftLiftFromSaved(savedLift: SavedLift): DraftLift {
  return createDraftLift(savedLift.name, savedLift.id, [
    createDraftLiftRow(
      savedLift.defaultSets !== null ? String(savedLift.defaultSets) : "",
      savedLift.defaultReps !== null ? String(savedLift.defaultReps) : "",
      savedLift.defaultWeight !== null ? String(savedLift.defaultWeight) : ""
    ),
  ]);
}

function parseOptionalInt(value: string, fieldName: string): number | null {
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

function parseOptionalNumber(value: string, fieldName: string): number | null {
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

function selectedDateLabel(dateIso: string): string {
  const [year, month, day] = dateIso.split("-").map((value) => Number(value));
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatLiftHistoryRow(
  row: { sets: number | null; reps: number | null; weight: number | null },
  weightUnit: "kg" | "lb"
): string {
  const parts: string[] = [];

  if (row.sets !== null && row.reps !== null) {
    parts.push(`${row.sets} x ${row.reps}`);
  } else {
    if (row.sets !== null) {
      parts.push(`${row.sets} sets`);
    }
    if (row.reps !== null) {
      parts.push(`${row.reps} reps`);
    }
  }

  if (row.weight !== null) {
    parts.push(`${row.weight} ${weightUnit}`);
  }

  return parts.length > 0 ? parts.join(" • ") : "No set targets stored";
}

function groupTrainingDayLifts(lifts: TrainingDay["lifts"]): GroupedTrainingLift[] {
  const groups = new Map<string, GroupedTrainingLift>();
  const groupOrder: string[] = [];

  for (const lift of lifts) {
    const normalizedName = lift.name.trim().toLowerCase();
    const key = `${lift.savedLiftId ?? "custom"}:${normalizedName}`;

    if (!groups.has(key)) {
      groups.set(key, {
        savedLiftId: lift.savedLiftId,
        name: lift.name.trim(),
        rows: [],
      });
      groupOrder.push(key);
    }

    groups.get(key)?.rows.push({
      sets: lift.sets,
      reps: lift.reps,
      weight: lift.weight,
      isPr: lift.isPr,
      notes: lift.notes,
    });
  }

  return groupOrder
    .map((key) => groups.get(key))
    .filter((group): group is GroupedTrainingLift => Boolean(group));
}

function dayCardClass(day: TrainingDay | null): string {
  if (!day) {
    return "border-slate-200 bg-white";
  }

  if (day.status === "planned") {
    return "border-sky-200 bg-sky-50";
  }

  return INTENSITY_DAY_CELL_CLASS[day.intensity];
}

function dayBadgeClass(day: TrainingDay): string {
  if (day.status === "planned") {
    return "bg-sky-100 text-sky-800";
  }

  return INTENSITY_DAY_BADGE_CLASS[day.intensity];
}

function todayIsoString(today: Date): string {
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0"),
  ].join("-");
}

function defaultStatusForDate(dateIso: string, todayIso: string): TrainingDayStatus {
  return dateIso > todayIso ? "planned" : "completed";
}

function compactCalendarLabel(name: string, maxLength = 16): string {
  const trimmed = name.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 1)}…`;
}

function buildSuggestDayTypeOptions(presetDays: LiftTemplateDay[]): string[] {
  const seen = new Set<string>();
  const options: string[] = [];

  for (const presetDay of presetDays) {
    const trimmedName = presetDay.name.trim();
    const normalized = trimmedName.toLowerCase();
    if (!trimmedName || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    options.push(trimmedName);
  }

  for (const defaultType of DEFAULT_SUGGEST_DAY_TYPES) {
    const normalized = defaultType.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    options.push(defaultType);
  }

  return options;
}

function isSuggestionProfileComplete(profile: UserProfile | null): boolean {
  return Boolean(profile && profile.height !== null && profile.weight !== null && profile.gender !== "unspecified");
}

function buildTrainingDayLiftsPayload(draftLifts: DraftLift[]): Array<{
  savedLiftId: number | null;
  name: string;
  sets: number | null;
  reps: number | null;
  weight: number | null;
  isPr: boolean;
  notes: string;
}> {
  return draftLifts.flatMap((lift) => {
    const trimmedLiftName = lift.name.trim();
    if (!trimmedLiftName) {
      throw new Error("Every lift must have a name.");
    }

    const parsedRows = lift.rows.map((row, index) => ({
      sets: parseOptionalInt(row.sets, `${trimmedLiftName} row ${index + 1} sets`),
      reps: parseOptionalInt(row.reps, `${trimmedLiftName} row ${index + 1} reps`),
      weight: parseOptionalNumber(row.weight, `${trimmedLiftName} row ${index + 1} weight`),
      isPr: row.isPr,
      notes: row.notes.trim(),
    }));

    const rowsWithData = parsedRows.filter(
      (row) => row.sets !== null || row.reps !== null || row.weight !== null || row.isPr || row.notes
    );

    const rowsToPersist =
      rowsWithData.length > 0
        ? rowsWithData
        : [
            {
              sets: null,
              reps: null,
              weight: null,
              isPr: false,
              notes: "",
            },
          ];

    return rowsToPersist.map((row) => ({
      savedLiftId: lift.savedLiftId,
      name: trimmedLiftName,
      sets: row.sets,
      reps: row.reps,
      weight: row.weight,
      isPr: row.isPr,
      notes: row.notes,
    }));
  });
}

export function CalendarView() {
  const editorSectionRef = useRef<HTMLElement | null>(null);
  const [today] = useState(() => new Date());
  const [activeMonth, setActiveMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<number>(() => today.getDate());
  const [trainingDaysByDate, setTrainingDaysByDate] = useState<Record<string, TrainingDay>>({});
  const [presetDays, setPresetDays] = useState<LiftTemplateDay[]>([]);
  const [savedLifts, setSavedLifts] = useState<SavedLift[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [weightUnit, setWeightUnit] = useState<"kg" | "lb">("kg");
  const [referenceError, setReferenceError] = useState<string | null>(null);
  const [suggestDayAvailability, setSuggestDayAvailability] = useState<SuggestDayAvailability | null>(null);
  const [suggestDayModal, setSuggestDayModal] = useState<SuggestDayModalState | null>(null);
  const [suggestionSummary, setSuggestionSummary] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [dayName, setDayName] = useState("");
  const [dayStatus, setDayStatus] = useState<TrainingDayStatus>("completed");
  const [intensity, setIntensity] = useState<TrainingIntensity>("non-relevant");
  const [draftLifts, setDraftLifts] = useState<DraftLift[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [newLiftName, setNewLiftName] = useState("");
  const [editorState, setEditorState] = useState<SaveState>({ kind: "idle" });
  const [calendarState, setCalendarState] = useState<SaveState>({ kind: "idle" });
  const [notesModal, setNotesModal] = useState<NotesModalState | null>(null);
  const [deletingDayId, setDeletingDayId] = useState<number | null>(null);

  const cells = useMemo(() => getCalendarCells(activeMonth), [activeMonth]);
  const selectedDateIso = useMemo(() => isoDateForDay(activeMonth, selectedDay), [activeMonth, selectedDay]);
  const todayIso = useMemo(() => todayIsoString(today), [today]);
  const selectedTrainingDay = trainingDaysByDate[selectedDateIso] ?? null;

  const selectedTrainingLiftGroups = useMemo(
    () => (selectedTrainingDay ? groupTrainingDayLifts(selectedTrainingDay.lifts) : []),
    [selectedTrainingDay]
  );
  const suggestDayTypeOptions = useMemo(() => buildSuggestDayTypeOptions(presetDays), [presetDays]);
  const suggestionProfileComplete = useMemo(() => isSuggestionProfileComplete(userProfile), [userProfile]);

  const currentEditorNote = useMemo(() => {
    if (!notesModal || notesModal.mode !== "edit") {
      return "";
    }

    const lift = draftLifts.find((draftLift) => draftLift.key === notesModal.liftKey);
    const row = lift?.rows.find((draftRow) => draftRow.key === notesModal.rowKey);
    return row?.notes ?? "";
  }, [draftLifts, notesModal]);

  const matchingSavedLifts = useMemo(() => {
    const query = newLiftName.trim().toLowerCase();
    if (!query) {
      return [];
    }

    return savedLifts
      .filter((lift) => lift.name.toLowerCase().includes(query))
      .sort((left, right) => left.name.localeCompare(right.name))
      .slice(0, 6);
  }, [newLiftName, savedLifts]);

  const suggestDayDisabledReason = useMemo(() => {
    if (!suggestionProfileComplete) {
      return "Save weight, height, and gender in Settings first.";
    }

    if (savedLifts.length === 0) {
      return "Save some lifts before using Suggest day.";
    }

    if (!suggestDayAvailability) {
      return "Checking Ollama availability...";
    }

    if (!suggestDayAvailability.available) {
      return suggestDayAvailability.reason ?? "gemma4 is not available in Ollama.";
    }

    return null;
  }, [savedLifts.length, suggestDayAvailability, suggestionProfileComplete]);

  useEffect(() => {
    const isCurrentMonth =
      activeMonth.getFullYear() === today.getFullYear() && activeMonth.getMonth() === today.getMonth();
    setSelectedDay(isCurrentMonth ? today.getDate() : 1);
    setEditorOpen(false);
    setEditorState({ kind: "idle" });
    setNotesModal(null);
    setSuggestDayModal(null);
    setSuggestionSummary(null);
  }, [activeMonth, today]);

  useEffect(() => {
    let isMounted = true;

    const loadReferenceData = async () => {
      try {
        const [templates, lifts, loadedUserProfile] = await Promise.all([
          fetchLiftTemplate(),
          fetchSavedLifts(),
          fetchUserProfile(),
        ]);

        if (!isMounted) {
          return;
        }

        setPresetDays(templates);
        setSavedLifts(lifts);
        setUserProfile(loadedUserProfile);
        setWeightUnit(loadedUserProfile.weightUnit);
        setReferenceError(null);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const message = error instanceof Error ? error.message : "Failed to load settings data.";
        setReferenceError(message);
      }

      try {
        const availability = await fetchSuggestDayAvailability();
        if (!isMounted) {
          return;
        }
        setSuggestDayAvailability(availability);
      } catch (error) {
        if (!isMounted) {
          return;
        }
        const message = error instanceof Error ? error.message : "Suggest day is unavailable right now.";
        setSuggestDayAvailability({
          available: false,
          modelName: null,
          reason: message,
          profileComplete: false,
        });
      }
    };

    void loadReferenceData();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadTrainingDays = async () => {
      try {
        setCalendarState({ kind: "saving" });
        const monthDays = await fetchTrainingDays(monthParam(activeMonth));
        if (!isMounted) {
          return;
        }

        const nextByDate: Record<string, TrainingDay> = {};
        for (const day of monthDays) {
          nextByDate[day.date] = day;
        }

        setTrainingDaysByDate(nextByDate);
        setCalendarState({ kind: "idle" });
      } catch (error) {
        if (!isMounted) {
          return;
        }
        const message = error instanceof Error ? error.message : "Failed to load training days.";
        setCalendarState({ kind: "error", message });
      }
    };

    void loadTrainingDays();

    return () => {
      isMounted = false;
    };
  }, [activeMonth]);

  useEffect(() => {
    if (!editorOpen) {
      return;
    }

    editorSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [editorOpen]);

  const closeEditor = () => {
    setEditorOpen(false);
    setEditorState({ kind: "idle" });
    setNotesModal(null);
    setSelectedPresetId("");
    setNewLiftName("");
    setSuggestionSummary(null);
  };

  const openEditorForNewDay = (status = defaultStatusForDate(selectedDateIso, todayIso)) => {
    setDayName(selectedTrainingDay?.name ?? "");
    setDayStatus(status);
    setIntensity(selectedTrainingDay?.intensity ?? "non-relevant");
    setDraftLifts([]);
    setSelectedPresetId("");
    setNewLiftName("");
    setEditorState({ kind: "idle" });
    setNotesModal(null);
    setSuggestionSummary(null);
    setEditorOpen(true);
  };

  const openEditorForExistingDay = (day: TrainingDay, nextStatus: TrainingDayStatus = day.status) => {
    const grouped = groupTrainingDayLifts(day.lifts);
    const nextDraftLifts = grouped.map((lift) =>
      createDraftLift(
        lift.name,
        lift.savedLiftId,
        lift.rows.map((row) =>
          createDraftLiftRow(
            row.sets !== null ? String(row.sets) : "",
            row.reps !== null ? String(row.reps) : "",
            row.weight !== null ? String(row.weight) : "",
            row.isPr,
            row.notes
          )
        )
      )
    );

    setDayName(day.name);
    setDayStatus(nextStatus);
    setIntensity(day.intensity);
    setDraftLifts(nextDraftLifts);
    setSelectedPresetId("");
    setNewLiftName("");
    setEditorState({ kind: "idle" });
    setNotesModal(null);
    setSuggestionSummary(null);
    setEditorOpen(true);
  };

  const handleApplyPreset = () => {
    if (!selectedPresetId) {
      setEditorState({ kind: "error", message: "Choose a preset day first." });
      return;
    }

    const presetDay = presetDays.find((day) => day.id === Number(selectedPresetId));
    if (!presetDay) {
      setEditorState({ kind: "error", message: "Preset day not found." });
      return;
    }

    const nextDraftLifts = presetDay.lifts.map((lift) => {
      const matchingSavedLift = savedLifts.find((savedLift) => savedLift.id === lift.savedLiftId);
      return createDraftLift(
        matchingSavedLift?.name ?? lift.name,
        lift.savedLiftId,
        [
          createDraftLiftRow(
            lift.sets !== null ? String(lift.sets) : "",
            lift.reps !== null ? String(lift.reps) : "",
            lift.weight !== null ? String(lift.weight) : ""
          ),
        ]
      );
    });

    setDraftLifts(nextDraftLifts);
    setDayName((current) => (current.trim() ? current : presetDay.name));
    setEditorState({ kind: "success", message: `${presetDay.name} loaded.` });
  };

  const openSuggestDayModal = () => {
    if (suggestDayDisabledReason) {
      return;
    }

    setSuggestDayModal({
      historyWindow: "4w",
      wantedDayType: suggestDayTypeOptions[0] ?? "Push",
      isLoading: false,
      error: null,
    });
  };

  const applySuggestedDayToEditor = (suggestedDay: SuggestedDay) => {
    const nextDraftLifts = suggestedDay.lifts.map((lift) =>
      createDraftLift(
        lift.name,
        lift.savedLiftId,
        [
          createDraftLiftRow(
            lift.sets !== null ? String(lift.sets) : "",
            lift.reps !== null ? String(lift.reps) : "",
            lift.weight !== null ? String(lift.weight) : "",
            false,
            lift.notes
          ),
        ]
      )
    );

    setDayName(suggestedDay.name);
    setDayStatus(suggestedDay.status);
    setIntensity(suggestedDay.intensity);
    setDraftLifts(nextDraftLifts);
    setSelectedPresetId("");
    setNewLiftName("");
    setEditorState({ kind: "success", message: "Suggestion loaded. Review and save when ready." });
    setSuggestionSummary(suggestedDay.summary || null);
    setSuggestDayModal(null);
    setNotesModal(null);
    setEditorOpen(true);
  };

  const handleSuggestDay = async () => {
    if (!suggestDayModal) {
      return;
    }

    try {
      setSuggestDayModal((current) =>
        current
          ? {
              ...current,
              isLoading: true,
              error: null,
            }
          : current
      );

      const suggestedDay = await suggestDay({
        date: selectedDateIso,
        historyWindow: suggestDayModal.historyWindow,
        wantedDayType: suggestDayModal.wantedDayType,
      });

      applySuggestedDayToEditor(suggestedDay);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to suggest a day.";
      setSuggestDayModal((current) =>
        current
          ? {
              ...current,
              isLoading: false,
              error: message,
            }
          : current
      );
    }
  };

  const handleAddLiftFromSaved = (savedLift: SavedLift) => {
    setDraftLifts((current) => [...current, createDraftLiftFromSaved(savedLift)]);
    setNewLiftName("");
    setEditorState({ kind: "idle" });
  };

  const handleAddLift = () => {
    const trimmedName = newLiftName.trim();
    if (!trimmedName) {
      setEditorState({ kind: "error", message: "Lift name is required." });
      return;
    }

    const exactSavedLift = savedLifts.find((lift) => lift.name.trim().toLowerCase() === trimmedName.toLowerCase());
    if (exactSavedLift) {
      handleAddLiftFromSaved(exactSavedLift);
      return;
    }

    setDraftLifts((current) => [...current, createDraftLift(trimmedName)]);
    setNewLiftName("");
    setEditorState({ kind: "idle" });
  };

  const updateDraftLiftName = (liftKey: string, value: string) => {
    setDraftLifts((current) =>
      current.map((lift) => (lift.key === liftKey ? { ...lift, name: value, savedLiftId: lift.savedLiftId } : lift))
    );
  };

  const addDraftLiftRow = (liftKey: string) => {
    setDraftLifts((current) =>
      current.map((lift) =>
        lift.key === liftKey
          ? {
              ...lift,
              rows: [...lift.rows, createDraftLiftRow()],
            }
          : lift
      )
    );
  };

  const updateDraftLiftRow = (
    liftKey: string,
    rowKey: string,
    field: "sets" | "reps" | "weight",
    value: string
  ) => {
    setDraftLifts((current) =>
      current.map((lift) =>
        lift.key === liftKey
          ? {
              ...lift,
              rows: lift.rows.map((row) => (row.key === rowKey ? { ...row, [field]: value } : row)),
            }
          : lift
      )
    );
  };

  const updateDraftLiftRowPr = (liftKey: string, rowKey: string, isPr: boolean) => {
    setDraftLifts((current) =>
      current.map((lift) =>
        lift.key === liftKey
          ? {
              ...lift,
              rows: lift.rows.map((row) => (row.key === rowKey ? { ...row, isPr } : row)),
            }
          : lift
      )
    );
  };

  const updateDraftLiftRowNotes = (liftKey: string, rowKey: string, notes: string) => {
    setDraftLifts((current) =>
      current.map((lift) =>
        lift.key === liftKey
          ? {
              ...lift,
              rows: lift.rows.map((row) => (row.key === rowKey ? { ...row, notes } : row)),
            }
          : lift
      )
    );
  };

  const removeDraftLiftRow = (liftKey: string, rowKey: string) => {
    if (notesModal?.mode === "edit" && notesModal.liftKey === liftKey && notesModal.rowKey === rowKey) {
      setNotesModal(null);
    }

    setDraftLifts((current) =>
      current.map((lift) => {
        if (lift.key !== liftKey || lift.rows.length <= 1) {
          return lift;
        }

        return {
          ...lift,
          rows: lift.rows.filter((row) => row.key !== rowKey),
        };
      })
    );
  };

  const removeDraftLift = (liftKey: string) => {
    if (notesModal?.mode === "edit" && notesModal.liftKey === liftKey) {
      setNotesModal(null);
    }

    setDraftLifts((current) => current.filter((lift) => lift.key !== liftKey));
  };

  const handleSaveTrainingDay = async () => {
    const trimmedDayName = dayName.trim();
    if (!trimmedDayName) {
      setEditorState({ kind: "error", message: "Day name is required." });
      return;
    }

    try {
      const liftsPayload = buildTrainingDayLiftsPayload(draftLifts);

      setEditorState({ kind: "saving" });
      const savedDay = await saveTrainingDay({
        date: selectedDateIso,
        name: trimmedDayName,
        status: dayStatus,
        intensity,
        lifts: liftsPayload,
      });

      setTrainingDaysByDate((current) => ({
        ...current,
        [savedDay.date]: savedDay,
      }));
      setEditorState({ kind: "idle" });
      setCalendarState({
        kind: "success",
        message: dayStatus === "planned" ? "Planned day saved." : "Lift day saved.",
      });
      closeEditor();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save day.";
      setEditorState({ kind: "error", message });
    }
  };

  const handleDeleteDay = async () => {
    if (!selectedTrainingDay) {
      return;
    }

    try {
      setDeletingDayId(selectedTrainingDay.id);
      await deleteTrainingDay(selectedTrainingDay.id);
      setTrainingDaysByDate((current) => {
        const next = { ...current };
        delete next[selectedDateIso];
        return next;
      });
      setCalendarState({ kind: "success", message: "Day deleted." });
      closeEditor();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete day.";
      setCalendarState({ kind: "error", message });
    } finally {
      setDeletingDayId(null);
    }
  };

  const handleEditorNoteChange = (value: string) => {
    if (!notesModal || notesModal.mode !== "edit") {
      return;
    }

    updateDraftLiftRowNotes(notesModal.liftKey, notesModal.rowKey, value);
  };

  const suggestDayModalElement = suggestDayModal ? (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/55 p-3 sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-4 shadow-xl sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Suggest Day</p>
            <h3 className="text-lg font-semibold text-slate-900">Build a draft with Gemma 4</h3>
            <p className="text-sm text-slate-600">
              We’ll use your saved profile, lift library, preset days, and selected history window to suggest a day for{" "}
              {selectedDateLabel(selectedDateIso)}.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSuggestDayModal(null)}
            className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            Close
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <label className="space-y-1 text-sm text-slate-700">
            <span>How much history should be used?</span>
            <select
              value={suggestDayModal.historyWindow}
              onChange={(event) =>
                setSuggestDayModal((current) =>
                  current
                    ? {
                        ...current,
                        historyWindow: event.target.value as SuggestHistoryWindow,
                      }
                    : current
                )
              }
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 outline-none ring-sky-200 focus:ring-2"
            >
              {SUGGEST_HISTORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm text-slate-700">
            <span>What kind of day do you want?</span>
            <select
              value={suggestDayModal.wantedDayType}
              onChange={(event) =>
                setSuggestDayModal((current) =>
                  current
                    ? {
                        ...current,
                        wantedDayType: event.target.value,
                      }
                    : current
                )
              }
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 outline-none ring-sky-200 focus:ring-2"
            >
              {suggestDayTypeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          {suggestDayAvailability?.modelName && (
            <p className="text-xs text-slate-500">Using Ollama model `{suggestDayAvailability.modelName}`.</p>
          )}
          {suggestDayModal.error && <p className="text-sm text-rose-600">{suggestDayModal.error}</p>}
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => setSuggestDayModal(null)}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSuggestDay}
            disabled={suggestDayModal.isLoading}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-500"
          >
            <FaSave />
            {suggestDayModal.isLoading ? "Suggesting..." : "Suggest day"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const notesModalElement = notesModal ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-[24px] border border-slate-200 bg-white p-4 shadow-xl">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">{notesModal.title}</h3>
          <button
            type="button"
            onClick={() => setNotesModal(null)}
            className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            Close
          </button>
        </div>

        {notesModal.mode === "edit" ? (
          <div className="mt-3 space-y-3">
            <textarea
              value={currentEditorNote}
              onChange={(event) => handleEditorNoteChange(event.target.value)}
              rows={5}
              placeholder="Add context for anything unusual about this lift row..."
              className="w-full resize-y rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-sky-200 focus:ring-2"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setNotesModal(null)}
                className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <p className="whitespace-pre-wrap text-sm text-slate-700">{notesModal.notes}</p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setNotesModal(null)}
                className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  ) : null;

  const editorSaveLabel =
    editorState.kind === "saving" ? "Saving..." : dayStatus === "planned" ? "Save planned day" : "Save completed day";

  const editorElement = editorOpen ? (
    <section
      ref={editorSectionRef}
      className="space-y-3 rounded-[24px] border border-sky-200 bg-[linear-gradient(180deg,#f8fcff_0%,#ffffff_55%,#fff8ef_100%)] p-3 pb-[calc(6.5rem+env(safe-area-inset-bottom))] shadow-sm sm:rounded-[28px] sm:space-y-4 sm:p-6 sm:pb-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
            <FaCalendarAlt />
            Day Editor
          </p>
          <h2 className="text-xl font-semibold text-slate-900">{selectedDateLabel(selectedDateIso)}</h2>
          <p className="hidden text-sm text-slate-600 sm:block">
            Save this date as a future plan or as a completed lift day. The actions stay pinned on mobile so you can still save while the keyboard is open.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {selectedTrainingDay && (
            <button
              type="button"
              onClick={handleDeleteDay}
              disabled={deletingDayId === selectedTrainingDay.id}
              aria-label={deletingDayId === selectedTrainingDay.id ? "Deleting day" : "Delete day"}
              title={deletingDayId === selectedTrainingDay.id ? "Deleting..." : "Delete day"}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-rose-300 bg-white text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
            >
              <FaTrashAlt />
              <span className="sr-only">{deletingDayId === selectedTrainingDay.id ? "Deleting..." : "Delete day"}</span>
            </button>
          )}
          <button
            type="button"
            onClick={closeEditor}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Back to calendar
          </button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr] lg:gap-4">
        <div className="space-y-3 rounded-[24px] border border-slate-200 bg-white/90 p-3 sm:space-y-4 sm:p-4">
          {suggestionSummary && (
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
              <span className="font-semibold">Suggestion summary:</span> {suggestionSummary}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm text-slate-700 md:col-span-2">
              <span>Day name</span>
              <input
                value={dayName}
                onChange={(event) => setDayName(event.target.value)}
                placeholder="Pull Day, Lower 1, Recovery Accessories..."
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 outline-none ring-sky-200 focus:ring-2"
              />
            </label>

            <label className="space-y-1 text-sm text-slate-700">
              <span>Status</span>
              <select
                value={dayStatus}
                onChange={(event) => setDayStatus(event.target.value as TrainingDayStatus)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 outline-none ring-sky-200 focus:ring-2"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm text-slate-700">
              <span>Intensity</span>
              <select
                value={intensity}
                onChange={(event) => setIntensity(event.target.value as TrainingIntensity)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 outline-none ring-sky-200 focus:ring-2"
              >
                {INTENSITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-3 sm:p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Preset Day</p>
            <div className="mt-2 grid grid-cols-[1fr_auto] gap-2 sm:mt-3 sm:gap-3">
              <select
                value={selectedPresetId}
                onChange={(event) => setSelectedPresetId(event.target.value)}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 outline-none ring-sky-200 focus:ring-2"
              >
                <option value="">Load a preset day...</option>
                {presetDays.map((day) => (
                  <option key={day.id} value={day.id}>
                    {day.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleApplyPreset}
                className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 sm:min-h-11 sm:px-4 sm:py-2.5"
              >
                Apply preset
              </button>
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-3 sm:p-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              <FaSearch />
              Add lift
            </div>

            <div className="mt-2 grid grid-cols-[1fr_auto] gap-2 sm:mt-3 sm:gap-3">
              <input
                value={newLiftName}
                onChange={(event) => setNewLiftName(event.target.value)}
                placeholder="Search saved lifts or type a custom lift"
                list="saved-lift-name-options"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 outline-none ring-sky-200 focus:ring-2"
              />
              <button
                type="button"
                onClick={handleAddLift}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-700 sm:min-h-11 sm:px-4 sm:py-2.5"
              >
                <FaPlus />
                Add lift
              </button>
            </div>

            <datalist id="saved-lift-name-options">
              {savedLifts.map((lift) => (
                <option key={lift.id} value={lift.name} />
              ))}
            </datalist>

            {matchingSavedLifts.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {matchingSavedLifts.map((lift) => (
                  <button
                    key={lift.id}
                    type="button"
                    onClick={() => handleAddLiftFromSaved(lift)}
                    className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-100"
                  >
                    {lift.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3 rounded-[24px] border border-slate-200 bg-white/90 p-3 sm:space-y-4 sm:p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            <FaDumbbell />
            Lifts in this day
          </div>

          {draftLifts.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              No lifts yet. Load a preset day or add lifts one by one.
            </div>
          )}

          <div className="space-y-3">
            {draftLifts.map((lift) => (
              <div key={lift.key} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-2.5 sm:rounded-[24px] sm:p-4">
                <div className="flex flex-row items-center gap-2 sm:gap-3 sm:justify-between">
                  <input
                    value={lift.name}
                    onChange={(event) => updateDraftLiftName(lift.key, event.target.value)}
                    placeholder="Lift name"
                    className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 outline-none ring-sky-200 focus:ring-2"
                  />
                  <button
                    type="button"
                    onClick={() => removeDraftLift(lift.key)}
                    aria-label={`Remove ${lift.name || "lift"}`}
                    title="Remove lift"
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-rose-300 bg-white text-sm font-medium text-rose-700 hover:bg-rose-50 sm:h-11 sm:w-11"
                  >
                    <FaTrashAlt />
                    <span className="sr-only">Remove lift</span>
                  </button>
                </div>

                <div className="mt-2 space-y-1.5 sm:mt-4 sm:space-y-3">
                  {lift.rows.map((row, index) => (
                    <div
                      key={row.key}
                      className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-1.5 sm:gap-2 sm:p-2"
                    >
                      <input
                        value={row.sets}
                        onChange={(event) => updateDraftLiftRow(lift.key, row.key, "sets", event.target.value)}
                        type="number"
                        min={1}
                        placeholder="Sets"
                        aria-label={`Sets row ${index + 1}`}
                        className="w-0 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none ring-sky-200 focus:ring-2"
                      />
                      <input
                        value={row.reps}
                        onChange={(event) => updateDraftLiftRow(lift.key, row.key, "reps", event.target.value)}
                        type="number"
                        min={1}
                        placeholder="Reps"
                        aria-label={`Reps row ${index + 1}`}
                        className="w-0 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none ring-sky-200 focus:ring-2"
                      />
                      <input
                        value={row.weight}
                        onChange={(event) => updateDraftLiftRow(lift.key, row.key, "weight", event.target.value)}
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder={weightUnit}
                        aria-label={`Weight (${weightUnit}) row ${index + 1}`}
                        className="w-0 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none ring-sky-200 focus:ring-2"
                      />
                      {dayStatus === "completed" && (
                        <button
                          type="button"
                          onClick={() => updateDraftLiftRowPr(lift.key, row.key, !row.isPr)}
                          aria-label={row.isPr ? `Unmark PR row ${index + 1}` : `Mark PR row ${index + 1}`}
                          aria-pressed={row.isPr}
                          title={row.isPr ? "Personal record (tap to unset)" : "Mark as personal record"}
                          className={[
                            "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
                            row.isPr
                              ? "border-amber-300 bg-amber-100 text-amber-700 hover:bg-amber-200"
                              : "border-slate-300 bg-white text-slate-400 hover:bg-slate-100",
                          ].join(" ")}
                        >
                          <FaMedal />
                          <span className="sr-only">PR</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setNotesModal({
                            mode: "edit",
                            liftKey: lift.key,
                            rowKey: row.key,
                            title: `${lift.name || "Lift"} Row ${index + 1} Notes`,
                          })
                        }
                        aria-label={row.notes.trim() ? `Edit notes row ${index + 1}` : `Add notes row ${index + 1}`}
                        title={row.notes.trim() ? "Edit notes" : "Add notes"}
                        className={[
                          "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
                          row.notes.trim()
                            ? "border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100"
                            : "border-slate-300 bg-white text-slate-500 hover:bg-slate-100",
                        ].join(" ")}
                      >
                        <FaStickyNote />
                        <span className="sr-only">Notes</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeDraftLiftRow(lift.key, row.key)}
                        disabled={lift.rows.length <= 1}
                        aria-label={`Remove row ${index + 1}`}
                        title={lift.rows.length <= 1 ? "At least one row is required" : "Remove row"}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <FaTrashAlt />
                        <span className="sr-only">Remove row</span>
                      </button>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => addDraftLiftRow(lift.key)}
                  className="mt-2 inline-flex items-center gap-2 rounded-full border border-sky-300 bg-white px-3 py-1.5 text-sm font-medium text-sky-700 hover:bg-sky-50 sm:mt-4 sm:px-4 sm:py-2.5"
                >
                  <FaPlus />
                  Add row
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={handleSaveTrainingDay}
            disabled={editorState.kind === "saving"}
            className="hidden w-full items-center justify-center gap-2 rounded-full bg-slate-900 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-500 sm:inline-flex"
          >
            <FaSave />
            {editorSaveLabel}
          </button>

          {editorState.kind === "error" && <p className="text-sm text-rose-600">{editorState.message}</p>}
          {editorState.kind === "success" && <p className="text-sm text-emerald-600">{editorState.message}</p>}
        </div>
      </div>

      <div className="sticky bottom-2 z-30 -mx-1 mt-2 px-1 sm:hidden">
        <div className="rounded-[26px] border border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur supports-[padding:max(0px)]:pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
            <button
              type="button"
              onClick={closeEditor}
              className="inline-flex h-12 items-center justify-center rounded-full border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleSaveTrainingDay}
              disabled={editorState.kind === "saving"}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-500"
            >
              <FaSave />
              {editorSaveLabel}
            </button>
            {selectedTrainingDay ? (
              <button
                type="button"
                onClick={handleDeleteDay}
                disabled={deletingDayId === selectedTrainingDay.id}
                aria-label={deletingDayId === selectedTrainingDay.id ? "Deleting day" : "Delete day"}
                title={deletingDayId === selectedTrainingDay.id ? "Deleting..." : "Delete day"}
                className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-rose-300 bg-white text-rose-700 hover:bg-rose-50 disabled:opacity-60"
              >
                <FaTrashAlt />
                <span className="sr-only">{deletingDayId === selectedTrainingDay.id ? "Deleting..." : "Delete day"}</span>
              </button>
            ) : (
              <div aria-hidden="true" className="h-12 w-12" />
            )}
          </div>
        </div>
      </div>
    </section>
  ) : null;

  return (
    <>
      <section className="space-y-4 rounded-[28px] border border-sky-100 bg-[linear-gradient(180deg,#ffffff_0%,#f5fbff_48%,#fff6ec_100%)] p-3 shadow-sm sm:p-6">
        <div className="space-y-3">
          <div className="text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">Calendar</p>
            <h2 className="mt-1 flex items-center justify-center gap-2 text-lg font-semibold text-slate-900 sm:text-xl">
              <FaCalendarAlt className="text-sky-600" />
              {monthTitle(activeMonth)}
            </h2>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => setActiveMonth((current) => addMonths(current, -1))}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100"
            >
              <FaChevronLeft />
              <span>Previous</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMonth((current) => addMonths(current, 1))}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100"
            >
              <span>Next</span>
              <FaChevronRight />
            </button>
          </div>
        </div>

        {calendarState.kind === "saving" && <p className="text-xs text-slate-500">Loading days...</p>}
        {calendarState.kind === "error" && <p className="text-xs text-rose-600">{calendarState.message}</p>}
        {calendarState.kind === "success" && <p className="text-xs text-emerald-600">{calendarState.message}</p>}
        {referenceError && <p className="text-xs text-rose-600">{referenceError}</p>}

        <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-medium text-slate-500 sm:gap-2 sm:text-sm">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="py-1 sm:py-2">
              <span className="sm:hidden">{label[0]}</span>
              <span className="hidden sm:inline">{label}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {cells.map((day, index) => {
            if (day === null) {
              return <div key={`blank-${index}`} className="h-16 rounded-xl border border-transparent sm:h-24" />;
            }

            const dateIso = isoDateForDay(activeMonth, day);
            const trainingDay = trainingDaysByDate[dateIso];
            const isSelected = day === selectedDay;
            const isToday = isTodayInActiveMonth(activeMonth, day, today);
            const hasPr = Boolean(
              trainingDay && trainingDay.status === "completed" && trainingDay.lifts.some((lift) => lift.isPr)
            );

            return (
              <button
                key={dateIso}
                type="button"
                onClick={() => {
                  setSelectedDay(day);
                  setEditorOpen(false);
                  setEditorState({ kind: "idle" });
                  setNotesModal(null);
                  setSuggestDayModal(null);
                  setSuggestionSummary(null);
                }}
                className={[
                  "h-16 rounded-xl border p-1.5 text-left align-top transition sm:h-24 sm:p-2",
                  dayCardClass(trainingDay ?? null),
                  isSelected ? "border-sky-500 ring-2 ring-sky-200" : "",
                  isToday ? "shadow-[inset_0_0_0_1px_rgb(14_165_233_/_0.45)]" : "",
                ].join(" ")}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-bold text-slate-900 sm:text-xs sm:font-semibold sm:text-slate-700">{day}</span>
                  {hasPr && (
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-200 text-[9px] text-amber-900">
                      <FaMedal />
                    </span>
                  )}
                </div>

                {trainingDay && (
                  <div className="mt-1 space-y-0.5 sm:space-y-1">
                    <span
                      className={[
                        "hidden rounded-full px-2 py-0.5 text-[8px] font-semibold uppercase tracking-wide sm:inline-flex sm:text-[10px]",
                        STATUS_BADGE_CLASS[trainingDay.status],
                      ].join(" ")}
                    >
                      {trainingDay.status}
                    </span>
                    <span
                      className={[
                        "inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide sm:hidden",
                        STATUS_BADGE_CLASS[trainingDay.status],
                      ].join(" ")}
                    >
                      {STATUS_MOBILE_LABEL[trainingDay.status]}
                    </span>
                    <div
                      className={[
                        "truncate rounded-lg px-1.5 py-0.5 text-[10px] font-semibold leading-tight sm:line-clamp-2 sm:px-2 sm:py-1 sm:text-[11px] sm:font-medium",
                        dayBadgeClass(trainingDay),
                      ].join(" ")}
                    >
                      {compactCalendarLabel(trainingDay.name)}
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-white/85 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{selectedDateLabel(selectedDateIso)}</h3>
              <p className="mt-1 text-sm text-slate-600">
                {selectedTrainingDay
                  ? selectedTrainingDay.status === "planned"
                    ? "This date is currently saved as a planned training day."
                    : "This date has a recorded lift day."
                  : "Nothing saved on this date yet."}
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={openSuggestDayModal}
                disabled={Boolean(suggestDayDisabledReason)}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-violet-300 bg-violet-50 px-4 py-2.5 text-sm font-medium text-violet-700 hover:bg-violet-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400 sm:w-auto"
              >
                <FaSave />
                Suggest day
              </button>
              {selectedTrainingDay ? (
                <>
                  <button
                    type="button"
                    onClick={() => openEditorForExistingDay(selectedTrainingDay)}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-sky-300 bg-sky-50 px-4 py-2.5 text-sm font-medium text-sky-700 hover:bg-sky-100 sm:w-auto"
                  >
                    <FaPen />
                    Edit day
                  </button>
                  {selectedTrainingDay.status === "planned" && (
                    <button
                      type="button"
                      onClick={() => openEditorForExistingDay(selectedTrainingDay, "completed")}
                      className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 sm:w-auto"
                    >
                      <FaSave />
                      Mark completed
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => openEditorForNewDay("planned")}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-sky-300 bg-sky-50 px-4 py-2.5 text-sm font-medium text-sky-700 hover:bg-sky-100 sm:w-auto"
                  >
                    <FaCalendarAlt />
                    Plan day
                  </button>
                  <button
                    type="button"
                    onClick={() => openEditorForNewDay("completed")}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 sm:w-auto"
                  >
                    <FaDumbbell />
                    Log day
                  </button>
                </>
              )}
            </div>
          </div>

          {selectedTrainingDay ? (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={[
                    "inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide",
                    STATUS_BADGE_CLASS[selectedTrainingDay.status],
                  ].join(" ")}
                >
                  {selectedTrainingDay.status}
                </span>
                <span
                  className={[
                    "inline-flex rounded-full px-3 py-1 text-xs font-medium",
                    INTENSITY_DAY_BADGE_CLASS[selectedTrainingDay.intensity],
                  ].join(" ")}
                >
                  {selectedTrainingDay.intensity}
                </span>
              </div>

              {selectedTrainingLiftGroups.length === 0 && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                  No lifts stored on this day.
                </div>
              )}

              {selectedTrainingLiftGroups.map((lift) => (
                <div key={`${lift.savedLiftId ?? "custom"}-${lift.name}`} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <p className="flex items-center gap-2 text-base font-semibold text-slate-900">
                    <FaDumbbell className="text-slate-500" />
                    {lift.name}
                  </p>
                  <div className="mt-3 space-y-2">
                    {lift.rows.map((row, index) => (
                      <div key={`${lift.name}-${index}`} className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-1">
                          <p className="text-sm text-slate-700">
                            Row {index + 1}: {formatLiftHistoryRow(row, weightUnit)}
                          </p>
                          {selectedTrainingDay.status === "planned" && (
                            <p className="text-xs text-slate-500">Saved as a plan for this date.</p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
                          {row.isPr && selectedTrainingDay.status === "completed" && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-200 px-2 py-1 text-[10px] font-semibold uppercase text-amber-900">
                              <FaMedal />
                              PR
                            </span>
                          )}
                          {row.notes && (
                            <button
                              type="button"
                              onClick={() =>
                                setNotesModal({
                                  mode: "view",
                                  title: `${lift.name} Row ${index + 1} Notes`,
                                  notes: row.notes,
                                })
                              }
                              className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
                            >
                              <FaStickyNote />
                              Notes
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              Save a planned day here if you want next week mapped out ahead of time, or log a completed day when you finish training.
            </div>
          )}
        </div>

        {suggestDayDisabledReason && (
          <p className="mt-3 text-sm text-slate-500">{suggestDayDisabledReason}</p>
        )}
      </section>

      {editorElement}
      {suggestDayModalElement}
      {notesModalElement}
    </>
  );
}
