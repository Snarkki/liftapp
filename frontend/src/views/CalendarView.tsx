import { useEffect, useMemo, useRef, useState } from "react";
import {
  FaCalendarAlt,
  FaChevronLeft,
  FaChevronRight,
  FaDumbbell,
  FaMedal,
  FaPen,
  FaPlus,
  FaSearch,
  FaStickyNote,
  FaTrashAlt,
} from "react-icons/fa";

import {
  fetchLiftTemplate,
  fetchSavedLifts,
  fetchTrainingDays,
  fetchUserProfile,
  LiftTemplateDay,
  SavedLift,
  saveTrainingDay,
  TrainingDay,
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
  name: string;
  rows: DraftLiftRow[];
};

type GroupedTrainingLift = {
  name: string;
  rows: Array<{ sets: number | null; reps: number | null; weight: number | null; isPr: boolean; notes: string }>;
};

type NotesModalState =
  | { mode: "edit"; liftKey: string; rowKey: string; title: string }
  | { mode: "view"; title: string; notes: string };

type AutosaveState =
  | { kind: "idle" }
  | { kind: "dirty" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "blocked"; message: string }
  | { kind: "error"; message: string };

const INTENSITY_OPTIONS: Array<{ value: TrainingIntensity; label: string }> = [
  { value: "minor", label: "Minor" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "non-relevant", label: "Non-relevant" },
];

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

const INTENSITY_DOT_CLASS: Record<TrainingIntensity, string> = {
  minor: "bg-emerald-500",
  medium: "bg-amber-500",
  high: "bg-rose-500",
  "non-relevant": "bg-slate-500",
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

function createDraftLiftRow(sets = "", reps = "", weight = "", isPr = false, notes = ""): DraftLiftRow {
  return {
    key: nextKey(),
    sets,
    reps,
    weight,
    isPr,
    notes,
  };
}

function createDraftLift(name = "", rows: DraftLiftRow[] = [createDraftLiftRow()]): DraftLift {
  return {
    key: nextKey(),
    name,
    rows: rows.length > 0 ? rows : [createDraftLiftRow()],
  };
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

  return parts.length > 0 ? parts.join(" • ") : "No sets/reps/weight logged";
}

function groupTrainingDayLifts(lifts: TrainingDay["lifts"]): GroupedTrainingLift[] {
  const groups = new Map<string, GroupedTrainingLift>();
  const groupOrder: string[] = [];

  for (const lift of lifts) {
    const normalized = lift.name.trim().toLowerCase();
    if (!groups.has(normalized)) {
      groups.set(normalized, {
        name: lift.name.trim(),
        rows: [],
      });
      groupOrder.push(normalized);
    }

    groups.get(normalized)?.rows.push({
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

function uniqueSavedLiftNames(savedLifts: SavedLift[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const lift of savedLifts) {
    const trimmed = lift.name.trim();
    const normalized = trimmed.toLowerCase();
    if (!trimmed || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    names.push(trimmed);
  }

  return names;
}

function buildEditorFingerprint(dayName: string, intensity: TrainingIntensity, draftLifts: DraftLift[]): string {
  return JSON.stringify({
    dayName,
    intensity,
    lifts: draftLifts.map((lift) => ({
      name: lift.name,
      rows: lift.rows.map((row) => ({
        sets: row.sets,
        reps: row.reps,
        weight: row.weight,
        isPr: row.isPr,
        notes: row.notes,
      })),
    })),
  });
}

function buildTrainingDayLiftsPayload(draftLifts: DraftLift[]): Array<{
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
      name: trimmedLiftName,
      sets: row.sets,
      reps: row.reps,
      weight: row.weight,
      isPr: row.isPr,
      notes: row.notes,
    }));
  });
}

function autosaveStatusDetails(state: AutosaveState): { message: string; className: string } {
  if (state.kind === "dirty") {
    return { message: "Unsaved changes", className: "text-amber-700" };
  }

  if (state.kind === "saving") {
    return { message: "Autosaving...", className: "text-sky-700" };
  }

  if (state.kind === "saved") {
    return {
      message: `All changes saved at ${new Date(state.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
      className: "text-emerald-700",
    };
  }

  if (state.kind === "blocked") {
    return { message: state.message, className: "text-amber-700" };
  }

  if (state.kind === "error") {
    return { message: state.message, className: "text-rose-700" };
  }

  return { message: "Autosave ready", className: "text-slate-500" };
}

export function CalendarView() {
  const [today] = useState(() => new Date());
  const [activeMonth, setActiveMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<number>(() => today.getDate());
  const [trainingDaysByDate, setTrainingDaysByDate] = useState<Record<string, TrainingDay>>({});
  const [favoriteDays, setFavoriteDays] = useState<LiftTemplateDay[]>([]);
  const [savedLifts, setSavedLifts] = useState<SavedLift[]>([]);
  const [weightUnit, setWeightUnit] = useState<"kg" | "lb">("kg");
  const [referenceError, setReferenceError] = useState<string | null>(null);

  const [dayName, setDayName] = useState("");
  const [intensity, setIntensity] = useState<TrainingIntensity>("non-relevant");
  const [draftLifts, setDraftLifts] = useState<DraftLift[]>([]);
  const [newLiftName, setNewLiftName] = useState("");
  const [selectedFavoriteDayId, setSelectedFavoriteDayId] = useState<string>("");
  const [editorMode, setEditorMode] = useState<"create" | "edit">("create");

  const [screen, setScreen] = useState<"calendar" | "training">("calendar");
  const [calendarState, setCalendarState] = useState<SaveState>({ kind: "idle" });
  const [editorState, setEditorState] = useState<SaveState>({ kind: "idle" });
  const [notesModal, setNotesModal] = useState<NotesModalState | null>(null);
  const [autosaveState, setAutosaveState] = useState<AutosaveState>({ kind: "idle" });
  const [lastAutosaveFingerprint, setLastAutosaveFingerprint] = useState<string | null>(null);
  const autosaveRequestIdRef = useRef(0);

  const cells = useMemo(() => getCalendarCells(activeMonth), [activeMonth]);

  const selectedDateIso = useMemo(() => isoDateForDay(activeMonth, selectedDay), [activeMonth, selectedDay]);
  const selectedTrainingDay = trainingDaysByDate[selectedDateIso] ?? null;

  const selectedTrainingLiftGroups = useMemo(
    () => (selectedTrainingDay ? groupTrainingDayLifts(selectedTrainingDay.lifts) : []),
    [selectedTrainingDay]
  );

  const currentEditorNote = useMemo(() => {
    if (!notesModal || notesModal.mode !== "edit") {
      return "";
    }

    const lift = draftLifts.find((draftLift) => draftLift.key === notesModal.liftKey);
    const row = lift?.rows.find((draftRow) => draftRow.key === notesModal.rowKey);
    return row?.notes ?? "";
  }, [draftLifts, notesModal]);

  const savedLiftNames = useMemo(() => uniqueSavedLiftNames(savedLifts), [savedLifts]);

  const matchingSavedLiftNames = useMemo(() => {
    const query = newLiftName.trim().toLowerCase();
    if (!query) {
      return [];
    }

    return savedLiftNames
      .filter((name) => name.toLowerCase().includes(query))
      .slice(0, 6);
  }, [savedLiftNames, newLiftName]);

  const editorFingerprint = useMemo(
    () => buildEditorFingerprint(dayName, intensity, draftLifts),
    [dayName, intensity, draftLifts]
  );

  useEffect(() => {
    const isCurrentMonth =
      activeMonth.getFullYear() === today.getFullYear() && activeMonth.getMonth() === today.getMonth();
    setSelectedDay(isCurrentMonth ? today.getDate() : 1);
    setScreen("calendar");
  }, [activeMonth, today]);

  useEffect(() => {
    let isMounted = true;

    const loadReferenceData = async () => {
      try {
        const [days, lifts, userProfile] = await Promise.all([fetchLiftTemplate(), fetchSavedLifts(), fetchUserProfile()]);
        if (!isMounted) {
          return;
        }

        setFavoriteDays(days);
        setSavedLifts(lifts);
        setWeightUnit(userProfile.weightUnit);
        setReferenceError(null);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const message = error instanceof Error ? error.message : "Failed to load settings data.";
        setReferenceError(message);
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
    if (screen !== "training" || editorMode !== "edit" || editorState.kind === "saving") {
      return;
    }

    if (!lastAutosaveFingerprint) {
      return;
    }

    if (editorFingerprint === lastAutosaveFingerprint) {
      setAutosaveState((current) =>
        current.kind === "dirty" || current.kind === "error" || current.kind === "blocked"
          ? { kind: "saved", at: Date.now() }
          : current
      );
      return;
    }

    setAutosaveState((current) => (current.kind === "saving" ? current : { kind: "dirty" }));

    const timeoutId = window.setTimeout(async () => {
      const trimmedDayName = dayName.trim();
      if (!trimmedDayName) {
        setAutosaveState({ kind: "blocked", message: "Autosave paused: day name is required." });
        return;
      }

      let liftsPayload: ReturnType<typeof buildTrainingDayLiftsPayload>;
      try {
        liftsPayload = buildTrainingDayLiftsPayload(draftLifts);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid input.";
        setAutosaveState({ kind: "blocked", message: `Autosave paused: ${message}` });
        return;
      }

      const requestId = autosaveRequestIdRef.current + 1;
      autosaveRequestIdRef.current = requestId;
      setAutosaveState({ kind: "saving" });

      try {
        const saved = await saveTrainingDay({
          date: selectedDateIso,
          name: trimmedDayName,
          intensity,
          lifts: liftsPayload,
        });

        if (autosaveRequestIdRef.current !== requestId) {
          return;
        }

        setTrainingDaysByDate((current) => ({
          ...current,
          [saved.date]: saved,
        }));
        setLastAutosaveFingerprint(editorFingerprint);
        setAutosaveState({ kind: "saved", at: Date.now() });
      } catch (error) {
        if (autosaveRequestIdRef.current !== requestId) {
          return;
        }
        const message = error instanceof Error ? error.message : "Autosave failed.";
        setAutosaveState({ kind: "error", message: `Autosave failed: ${message}` });
      }
    }, 800);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    dayName,
    draftLifts,
    editorFingerprint,
    editorMode,
    editorState.kind,
    intensity,
    lastAutosaveFingerprint,
    screen,
    selectedDateIso,
  ]);

  const resetAutosaveTracking = (state: AutosaveState = { kind: "idle" }) => {
    autosaveRequestIdRef.current += 1;
    setLastAutosaveFingerprint(null);
    setAutosaveState(state);
  };

  const resetEditor = () => {
    setDayName("");
    setIntensity("non-relevant");
    setDraftLifts([]);
    setNewLiftName("");
    setSelectedFavoriteDayId("");
    setEditorMode("create");
    setEditorState({ kind: "idle" });
    setNotesModal(null);
    resetAutosaveTracking();
  };

  const handleSelectDay = (day: number) => {
    setSelectedDay(day);
    setScreen("calendar");
    setEditorState({ kind: "idle" });
    setNotesModal(null);
    resetAutosaveTracking();
  };

  const handleStartTraining = () => {
    resetEditor();
    setScreen("training");
  };

  const handleEditTraining = () => {
    if (!selectedTrainingDay) {
      return;
    }

    const grouped = groupTrainingDayLifts(selectedTrainingDay.lifts);
    const nextDraftLifts = grouped.map((lift) =>
      createDraftLift(
        lift.name,
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

    setDayName(selectedTrainingDay.name);
    setIntensity(selectedTrainingDay.intensity);
    setDraftLifts(nextDraftLifts);
    setNewLiftName("");
    setSelectedFavoriteDayId("");
    setEditorMode("edit");
    setEditorState({ kind: "idle" });
    setNotesModal(null);
    autosaveRequestIdRef.current += 1;
    setLastAutosaveFingerprint(buildEditorFingerprint(selectedTrainingDay.name, selectedTrainingDay.intensity, nextDraftLifts));
    setAutosaveState({ kind: "saved", at: Date.now() });
    setScreen("training");
  };

  const handleApplyFavoriteDay = () => {
    if (!selectedFavoriteDayId) {
      setEditorState({ kind: "error", message: "Select a favorite day first." });
      return;
    }

    const favoriteDay = favoriteDays.find((day) => day.id === Number(selectedFavoriteDayId));
    if (!favoriteDay) {
      setEditorState({ kind: "error", message: "Favorite day not found." });
      return;
    }

    setDraftLifts(favoriteDay.lifts.map((lift) => createDraftLift(lift.name)));
    setDayName((current) => (current.trim() ? current : favoriteDay.name));
    setEditorState({ kind: "success", message: `Loaded ${favoriteDay.name}.` });
  };

  const handleAddLift = () => {
    const trimmedName = newLiftName.trim();
    if (!trimmedName) {
      setEditorState({ kind: "error", message: "Lift name is required." });
      return;
    }

    setDraftLifts((current) => [...current, createDraftLift(trimmedName)]);
    setNewLiftName("");
    setEditorState({ kind: "idle" });
  };

  const updateDraftLiftName = (liftKey: string, value: string) => {
    setDraftLifts((current) =>
      current.map((lift) =>
        lift.key === liftKey
          ? {
              ...lift,
              name: value,
            }
          : lift
      )
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
              rows: lift.rows.map((row) =>
                row.key === rowKey
                  ? {
                      ...row,
                      [field]: value,
                    }
                  : row
              ),
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
              rows: lift.rows.map((row) =>
                row.key === rowKey
                  ? {
                      ...row,
                      isPr,
                    }
                  : row
              ),
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
              rows: lift.rows.map((row) =>
                row.key === rowKey
                  ? {
                      ...row,
                      notes,
                    }
                  : row
              ),
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
      setEditorState({ kind: "error", message: "Training day name is required." });
      return;
    }

    try {
      const liftsPayload = buildTrainingDayLiftsPayload(draftLifts);

      autosaveRequestIdRef.current += 1;
      setEditorState({ kind: "saving" });
      const saved = await saveTrainingDay({
        date: selectedDateIso,
        name: trimmedDayName,
        intensity,
        lifts: liftsPayload,
      });

      setTrainingDaysByDate((current) => ({
        ...current,
        [saved.date]: saved,
      }));
      setNotesModal(null);
      setScreen("calendar");
      setEditorMode("create");
      setEditorState({ kind: "idle" });
      setCalendarState({ kind: "success", message: "Training day saved." });
      resetAutosaveTracking();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save training day.";
      setEditorState({ kind: "error", message });
    }
  };

  const handleEditorNoteChange = (value: string) => {
    if (!notesModal || notesModal.mode !== "edit") {
      return;
    }

    updateDraftLiftRowNotes(notesModal.liftKey, notesModal.rowKey, value);
  };

  const autosaveStatus = editorMode === "edit" ? autosaveStatusDetails(autosaveState) : null;

  const notesModalElement = notesModal ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">{notesModal.title}</h3>
          <button
            type="button"
            onClick={() => setNotesModal(null)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
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
              className="w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-sky-200 focus:ring-2"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setNotesModal(null)}
                className="rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700"
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
                className="rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  ) : null;

  if (screen === "training") {
    return (
      <>
        <section className="mx-auto w-full max-w-4xl space-y-2.5 rounded-2xl border border-sky-100 bg-gradient-to-br from-sky-50 via-white to-orange-50 p-2 shadow-sm sm:space-y-4 sm:p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <FaCalendarAlt className="text-sky-600" />
              {editorMode === "edit" ? "Edit Training Day" : "Start Training"}
            </h2>
            <button
              type="button"
              onClick={() => {
                setScreen("calendar");
                setEditorState({ kind: "idle" });
                setNotesModal(null);
                resetAutosaveTracking();
              }}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-slate-100 sm:px-3 sm:py-2"
            >
              Back To Calendar
            </button>
          </div>

          <p className="text-xs font-medium text-slate-700 sm:text-sm">{selectedDateLabel(selectedDateIso)}</p>
          {autosaveStatus && <p className={`text-xs font-medium ${autosaveStatus.className}`}>{autosaveStatus.message}</p>}

          <div className="space-y-2 rounded-xl border border-sky-100 bg-white/80 p-2 sm:space-y-3 sm:p-3">
          <input
            value={dayName}
            onChange={(event) => setDayName(event.target.value)}
            placeholder="Training day name (e.g. Pull Day)"
            className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs outline-none ring-sky-200 focus:ring-2 sm:px-3 sm:py-2 sm:text-sm"
          />

          <select
            value={intensity}
            onChange={(event) => setIntensity(event.target.value as TrainingIntensity)}
            className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs outline-none ring-sky-200 focus:ring-2 sm:px-3 sm:py-2 sm:text-sm"
          >
            {INTENSITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                Intensity: {option.label}
              </option>
            ))}
          </select>

          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <select
              value={selectedFavoriteDayId}
              onChange={(event) => setSelectedFavoriteDayId(event.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs outline-none ring-sky-200 focus:ring-2 sm:px-3 sm:py-2 sm:text-sm"
            >
              <option value="">Load lifts from favorite day...</option>
              {favoriteDays.map((day) => (
                <option key={day.id} value={day.id}>
                  {day.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleApplyFavoriteDay}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-slate-100 sm:px-3 sm:py-2 sm:text-sm"
            >
              Apply
            </button>
          </div>

          <div className="space-y-2.5 sm:space-y-3">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">
              <FaDumbbell />
              Current Lifts
            </div>

            {draftLifts.length === 0 && (
              <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-2.5 text-xs text-slate-500 sm:p-3">
                No lifts yet. Apply a favorite day or add one manually below.
              </p>
            )}

            {draftLifts.map((lift) => (
              <div key={lift.key} className="space-y-1.5 rounded-md border border-slate-200 bg-slate-50 p-2 sm:space-y-2 sm:p-3">
                <div className="flex items-center justify-between gap-2">
                  <input
                    value={lift.name}
                    onChange={(event) => updateDraftLiftName(lift.key, event.target.value)}
                    placeholder="Lift name"
                    className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs outline-none ring-sky-200 focus:ring-2 sm:px-2 sm:py-1.5 sm:text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => removeDraftLift(lift.key)}
                    className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-white px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
                  >
                    <FaTrashAlt />
                    <span className="sr-only sm:not-sr-only">Remove</span>
                  </button>
                </div>

                <div className="space-y-1.5 sm:space-y-2">
                  {lift.rows.map((row, index) => (
                    <div key={row.key} className="rounded-md border border-slate-200 bg-white p-1.5 sm:p-2">
                      <div className="flex items-center gap-1">
                        <input
                          value={row.sets}
                          onChange={(event) => updateDraftLiftRow(lift.key, row.key, "sets", event.target.value)}
                          type="number"
                          min={1}
                          placeholder={`S${index + 1}`}
                          className="w-10 rounded-md border border-slate-300 bg-white px-1 py-1 text-[11px] outline-none ring-sky-200 focus:ring-2 sm:w-12 sm:px-1.5 sm:text-xs"
                        />
                        <input
                          value={row.reps}
                          onChange={(event) => updateDraftLiftRow(lift.key, row.key, "reps", event.target.value)}
                          type="number"
                          min={1}
                          placeholder="R"
                          className="w-10 rounded-md border border-slate-300 bg-white px-1 py-1 text-[11px] outline-none ring-sky-200 focus:ring-2 sm:w-12 sm:px-1.5 sm:text-xs"
                        />
                        <input
                          value={row.weight}
                          onChange={(event) => updateDraftLiftRow(lift.key, row.key, "weight", event.target.value)}
                          type="number"
                          min={0}
                          step="0.01"
                          placeholder={`Wt (${weightUnit})`}
                          className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-1.5 py-1 text-[11px] outline-none ring-sky-200 focus:ring-2 sm:px-2 sm:text-xs"
                        />

                        <label className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-1.5 text-xs text-slate-700 hover:bg-slate-100">
                          <input
                            type="checkbox"
                            checked={row.isPr}
                            onChange={(event) => updateDraftLiftRowPr(lift.key, row.key, event.target.checked)}
                            className="h-3 w-3 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                          />
                          <FaMedal className={row.isPr ? "text-amber-500" : "text-slate-400"} />
                          <span className="sr-only">PR</span>
                        </label>

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
                          className={[
                            "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-xs",
                            row.notes.trim()
                              ? "border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100"
                              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100",
                          ].join(" ")}
                        >
                          <FaStickyNote />
                          <span className="sr-only">{row.notes.trim() ? "Edit Note" : "Add Note"}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => removeDraftLiftRow(lift.key, row.key)}
                          disabled={lift.rows.length <= 1}
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white p-0 text-xs text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <FaTrashAlt />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => addDraftLiftRow(lift.key)}
                  className="inline-flex items-center gap-1 rounded-md border border-sky-300 bg-white px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-50 sm:px-2.5 sm:py-1.5"
                >
                  <FaPlus />
                  Add Row
                </button>
              </div>
            ))}
          </div>

          <div className="space-y-2 rounded-md border border-slate-200 bg-white p-2.5 sm:p-3">
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <FaSearch />
              Add Lift Manually
            </label>

            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                value={newLiftName}
                onChange={(event) => setNewLiftName(event.target.value)}
                placeholder="Search saved lifts or type a new one"
                list="saved-lift-name-options"
                className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs outline-none ring-sky-200 focus:ring-2 sm:px-3 sm:py-2 sm:text-sm"
              />
              <button
                type="button"
                onClick={handleAddLift}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-700 sm:px-3 sm:py-2 sm:text-sm"
              >
                <FaPlus />
                Add Lift
              </button>
            </div>

            <datalist id="saved-lift-name-options">
              {savedLiftNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>

            {matchingSavedLiftNames.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {matchingSavedLiftNames.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setNewLiftName(name)}
                    className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 hover:bg-sky-100"
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleSaveTrainingDay}
            disabled={editorState.kind === "saving" || (editorMode === "edit" && autosaveState.kind === "saving")}
            className="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-500 sm:py-2.5"
          >
            {editorState.kind === "saving"
              ? "Saving..."
              : editorMode === "edit"
                ? "Update Training Day"
                : "Save Training Day"}
          </button>

            {editorState.kind === "success" && <p className="text-sm text-emerald-600">{editorState.message}</p>}
            {editorState.kind === "error" && <p className="text-sm text-rose-600">{editorState.message}</p>}
          </div>
        </section>
        {notesModalElement}
      </>
    );
  }

  return (
    <>
      <section className="space-y-2.5 rounded-2xl border border-sky-100 bg-gradient-to-br from-white via-sky-50 to-amber-50 p-2 shadow-sm sm:space-y-4 sm:p-6">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setActiveMonth((current) => addMonths(current, -1))}
          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium hover:bg-slate-100 sm:gap-2 sm:px-3 sm:py-2 sm:text-sm"
        >
          <FaChevronLeft />
          <span className="hidden sm:inline">Previous</span>
        </button>
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 sm:text-xl">
          <FaCalendarAlt className="text-sky-600" />
          {monthTitle(activeMonth)}
        </h2>
        <button
          type="button"
          onClick={() => setActiveMonth((current) => addMonths(current, 1))}
          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium hover:bg-slate-100 sm:gap-2 sm:px-3 sm:py-2 sm:text-sm"
        >
          <span className="hidden sm:inline">Next</span>
          <FaChevronRight />
        </button>
      </div>

      {calendarState.kind === "saving" && <p className="text-xs text-slate-500">Loading training days...</p>}
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

      <div className="grid grid-cols-7 gap-0.5 sm:gap-2">
        {cells.map((day, index) => {
          if (day === null) {
            return <div key={`blank-${index}`} className="h-12 rounded-md border border-transparent sm:h-20" />;
          }

          const dateIso = isoDateForDay(activeMonth, day);
          const trainingDay = trainingDaysByDate[dateIso];
          const isSelected = day === selectedDay;
          const isToday = isTodayInActiveMonth(activeMonth, day, today);
          const hasPr = Boolean(trainingDay && trainingDay.lifts.some((lift) => lift.isPr));

          return (
            <button
              key={dateIso}
              type="button"
              onClick={() => handleSelectDay(day)}
              className={[
                "h-12 rounded-md border p-0.5 text-left align-top transition sm:h-20 sm:p-1.5",
                trainingDay ? INTENSITY_DAY_CELL_CLASS[trainingDay.intensity] : "border-slate-200 bg-white",
                isSelected ? "border-sky-500 ring-2 ring-sky-200" : "",
                isToday ? "shadow-[inset_0_0_0_1px_rgb(14_165_233_/_0.45)]" : "",
              ].join(" ")}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-700 sm:text-xs">{day}</span>
                <div className="flex items-center">
                  {hasPr && (
                    <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber-200 text-[8px] text-amber-900 sm:h-4 sm:w-4 sm:text-[9px]" aria-label="PR">
                      <FaMedal />
                    </span>
                  )}
                </div>
              </div>
              {trainingDay && (
                <div
                  className={[
                    "mt-0.5 line-clamp-1 rounded px-1 py-0.5 text-[8px] leading-tight font-medium sm:mt-1 sm:line-clamp-2 sm:text-[10px]",
                    INTENSITY_DAY_BADGE_CLASS[trainingDay.intensity],
                  ].join(" ")}
                >
                  {trainingDay.name}
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="space-y-2 rounded-xl border border-slate-200 bg-white/70 p-2 sm:space-y-3 sm:p-4">
        <h3 className="text-xs font-semibold text-slate-800 sm:text-sm">{selectedDateLabel(selectedDateIso)}</h3>

        {selectedTrainingDay ? (
          <div className="space-y-2 sm:space-y-3">
            <div className="flex items-center justify-between rounded-md border border-slate-200 bg-white p-2 sm:p-3">
              <div>
                <p className="text-xs font-semibold text-slate-800 sm:text-sm">{selectedTrainingDay.name}</p>
                <p className="text-[11px] text-slate-500 sm:text-xs">History</p>
              </div>
              <div className="flex items-center gap-2">
                {selectedTrainingDay.lifts.some((lift) => lift.isPr) && (
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-[10px] text-amber-900" aria-label="PR">
                    <FaMedal />
                  </span>
                )}
                <span
                  className={[
                    "inline-flex h-2.5 w-2.5 rounded-full",
                    INTENSITY_DOT_CLASS[selectedTrainingDay.intensity],
                  ].join(" ")}
                />
                <button
                  type="button"
                  onClick={handleEditTraining}
                  className="inline-flex items-center gap-1 rounded-md border border-sky-300 bg-sky-50 px-2 py-1 text-[11px] font-medium text-sky-700 hover:bg-sky-100 sm:px-2.5 sm:py-1.5 sm:text-xs"
                >
                  <FaPen />
                  Edit
                </button>
              </div>
            </div>

            <div className="space-y-1.5 sm:space-y-2">
              {selectedTrainingLiftGroups.length === 0 && (
                <p className="rounded-md border border-slate-200 bg-white p-2.5 text-xs text-slate-500 sm:p-3">No lifts logged.</p>
              )}

              {selectedTrainingLiftGroups.map((lift) => (
                <div key={lift.name} className="rounded-md border border-slate-200 bg-white p-2.5 sm:p-3">
                  <p className="flex items-center gap-2 text-sm font-medium text-slate-800">
                    <FaDumbbell className="text-slate-500" />
                    {lift.name}
                  </p>
                  <div className="mt-2 space-y-1">
                    {lift.rows.map((row, index) => (
                      <div key={`${lift.name}-${index}`} className="flex items-center justify-between gap-2">
                        <p className="text-xs text-slate-600">
                          Set Row {index + 1}: {formatLiftHistoryRow(row, weightUnit)}
                        </p>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {row.isPr && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-900">
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
                              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[10px] font-medium text-slate-700 hover:bg-slate-100"
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
          </div>
        ) : (
          <div className="space-y-2 rounded-md border border-dashed border-slate-300 bg-white p-2.5 text-center sm:space-y-3 sm:p-4">
            <p className="text-xs text-slate-600 sm:text-sm">No training day logged for this date.</p>
            <button
              type="button"
              onClick={handleStartTraining}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700 sm:py-2.5 sm:text-sm"
            >
              <FaPlus />
              Start Training
            </button>
          </div>
        )}
      </div>
      </section>
      {notesModalElement}
    </>
  );
}
