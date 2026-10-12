"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, CheckSquare, Trash2 } from "lucide-react";
import {
  PRIORITY_META,
  PRIORITY_PICK_ORDER,
  STATUSES,
  STATUS_META,
  type Priority,
  type Status,
  type TaskType,
} from "@/lib/constants";
import { addDays, formatDayLong } from "@/lib/dates";
import { Button, Modal, ModalHeader, cx } from "./ui";
import { useData } from "./data-provider";

interface NewDefaults {
  spaceId: string;
  dueDate?: string | null;
  status?: Status;
  priority?: Priority;
}

type DialogState = { mode: "edit"; taskId: string } | { mode: "new"; defaults: NewDefaults } | null;

interface TaskDialogApi {
  openTask: (id: string) => void;
  newTask: (defaults: NewDefaults) => void;
}

const Ctx = createContext<TaskDialogApi | null>(null);

export function useTaskDialog(): TaskDialogApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTaskDialog חייב לפעול בתוך TaskDialogProvider");
  return v;
}

export function TaskDialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DialogState>(null);
  const api = useMemo<TaskDialogApi>(
    () => ({
      openTask: (id) => setState({ mode: "edit", taskId: id }),
      newTask: (defaults) => setState({ mode: "new", defaults }),
    }),
    [],
  );
  const close = useCallback(() => setState(null), []);

  return (
    <Ctx.Provider value={api}>
      {children}
      {state && <TaskForm key={state.mode === "edit" ? state.taskId : "new"} state={state} onClose={close} />}
    </Ctx.Provider>
  );
}

function TaskForm({ state, onClose }: { state: NonNullable<DialogState>; onClose: () => void }) {
  const { tasks, spaces, today, createTask, updateTask, deleteTask } = useData();
  const existing = state.mode === "edit" ? tasks.find((t) => t.id === state.taskId) : undefined;
  const defaults = state.mode === "new" ? state.defaults : undefined;

  const [type, setType] = useState<TaskType>(existing?.type ?? "task");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [priority, setPriority] = useState<Priority>(existing?.priority ?? defaults?.priority ?? "medium");
  const [status, setStatus] = useState<Status>(existing?.status ?? defaults?.status ?? "new");
  const [dueDate, setDueDate] = useState<string>(existing?.dueDate ?? defaults?.dueDate ?? "");
  const [spaceId, setSpaceId] = useState(existing?.spaceId ?? defaults?.spaceId ?? spaces[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [titleError, setTitleError] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // המשימה נמחקה (למשל על ידי הסוכן) בזמן שהכרטיס פתוח
    if (state.mode === "edit" && !existing) onClose();
  }, [state.mode, existing, onClose]);

  useEffect(() => {
    if (state.mode === "new") titleRef.current?.focus();
  }, [state.mode]);

  if (state.mode === "edit" && !existing) return null;

  const space = spaces.find((s) => s.id === spaceId);

  async function save() {
    if (!title.trim()) {
      setTitleError(true);
      titleRef.current?.focus();
      return;
    }
    setSaving(true);
    const payload = {
      type,
      title: title.trim(),
      description,
      priority,
      status,
      dueDate: dueDate || null,
    };
    if (existing) {
      const patch: Parameters<typeof updateTask>[1] = { ...payload };
      if (spaceId !== existing.spaceId) patch.spaceId = spaceId;
      await updateTask(existing.id, patch);
      onClose();
    } else {
      const created = await createTask({ spaceId, ...payload });
      setSaving(false);
      if (created) onClose();
    }
  }

  const quickDates = [
    { label: "היום", value: today },
    { label: "מחר", value: addDays(today, 1) },
    { label: "בעוד שבוע", value: addDays(today, 7) },
  ];

  return (
    <Modal open onClose={onClose} label={existing ? "עריכת משימה" : "משימה חדשה"} maxWidth="max-w-2xl">
      <ModalHeader
        title={existing ? "עריכת משימה" : "משימה חדשה"}
        onClose={onClose}
        right={
          space && (
            <span className="me-2 inline-flex items-center gap-1.5 text-sm text-muted">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: space.color }} />
              {space.name}
            </span>
          )
        }
      />
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            void save();
          }
        }}
      >
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {/* סוג */}
          <div className="inline-flex rounded-lg bg-wash p-1 ring-1 ring-line" role="radiogroup" aria-label="סוג">
            {(
              [
                ["task", "משימה", CheckSquare],
                ["event", "אירוע", CalendarDays],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={type === value}
                onClick={() => setType(value)}
                className={cx(
                  "inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors",
                  type === value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
                )}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>

          {/* כותרת */}
          <div>
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (titleError) setTitleError(false);
              }}
              placeholder={type === "event" ? "שם האירוע" : "מה צריך לעשות?"}
              aria-label="כותרת"
              aria-invalid={titleError}
              maxLength={300}
              className={cx(
                "w-full rounded-lg border bg-transparent px-3 py-2.5 text-xl font-semibold placeholder:font-normal placeholder:text-faint focus:border-focus focus:outline-none",
                titleError ? "border-[#d92d3f]" : "border-transparent hover:border-line",
              )}
            />
            {titleError && <p className="mt-1 px-3 text-sm text-[#c0293a]">צריך לתת כותרת</p>}
          </div>

          {/* עדיפות */}
          <FieldGroup label="עדיפות">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="עדיפות">
              {PRIORITY_PICK_ORDER.map((p) => {
                const m = PRIORITY_META[p];
                const active = priority === p;
                return (
                  <button
                    key={p}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setPriority(p)}
                    className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all"
                    style={
                      active
                        ? { background: m.soft, borderColor: m.color, color: m.color }
                        : { borderColor: "var(--color-line)", color: "var(--color-ink-soft)" }
                    }
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </FieldGroup>

          {/* סטטוס */}
          <FieldGroup label="סטטוס">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="סטטוס">
              {STATUSES.map((s) => {
                const m = STATUS_META[s];
                const active = status === s;
                return (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setStatus(s)}
                    className="rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all"
                    style={
                      active
                        ? { background: m.soft, borderColor: m.color, color: m.color }
                        : { borderColor: "var(--color-line)", color: "var(--color-ink-soft)" }
                    }
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </FieldGroup>

          {/* תאריך יעד */}
          <FieldGroup label="תאריך יעד">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                aria-label="תאריך יעד"
                className="h-10 rounded-lg border border-line bg-surface px-3 text-[15px] focus:border-focus focus:outline-none"
              />
              {quickDates.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => setDueDate(q.value)}
                  className={cx(
                    "h-10 rounded-lg border px-3 text-sm transition-colors",
                    dueDate === q.value ? "border-brand bg-brand text-white" : "border-line text-ink-soft hover:bg-wash",
                  )}
                >
                  {q.label}
                </button>
              ))}
              {dueDate && (
                <button
                  type="button"
                  onClick={() => setDueDate("")}
                  className="h-10 rounded-lg px-2 text-sm text-muted underline-offset-2 hover:underline"
                >
                  נקה תאריך
                </button>
              )}
            </div>
            {dueDate && <p className="mt-1.5 text-sm text-muted">{formatDayLong(dueDate)}</p>}
          </FieldGroup>

          {/* מרחב */}
          {spaces.length > 1 && (
            <FieldGroup label="מרחב">
              <select
                value={spaceId}
                onChange={(e) => setSpaceId(e.target.value)}
                aria-label="מרחב"
                className="h-10 rounded-lg border border-line bg-surface px-3 text-[15px] focus:border-focus focus:outline-none"
              >
                {spaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </FieldGroup>
          )}

          {/* תיאור */}
          <FieldGroup label="תיאור">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="פרטים, קישורים, הערות…"
              className="w-full resize-y rounded-lg border border-line bg-surface px-3 py-2.5 text-[15px] leading-relaxed placeholder:text-faint focus:border-focus focus:outline-none"
            />
          </FieldGroup>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line-soft bg-wash px-5 py-3">
          <div className="flex items-center gap-2">
            <Button variant="primary" type="submit" disabled={saving}>
              {existing ? "שמירה" : "יצירת משימה"}
            </Button>
            <Button variant="ghost" onClick={onClose}>
              ביטול
            </Button>
          </div>
          {existing &&
            (confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted">למחוק לצמיתות?</span>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={async () => {
                    await deleteTask(existing.id);
                    onClose();
                  }}
                >
                  כן, מחק
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                  לא
                </Button>
              </div>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmDelete(true)} className="text-[#c0293a]">
                <Trash2 size={16} />
                מחיקה
              </Button>
            ))}
        </div>
      </form>
    </Modal>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-sm font-medium text-muted">{label}</div>
      {children}
    </div>
  );
}
