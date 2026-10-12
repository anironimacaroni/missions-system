"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Plus } from "lucide-react";
import { PRIORITIES, PRIORITY_META, STATUS_META, type Priority } from "@/lib/constants";
import { byDueThenPosition } from "@/lib/task-utils";
import type { Space, Task } from "@/lib/types";
import { useData } from "../data-provider";
import { useTaskDialog } from "../task-dialog";
import { DueChip, EventMark } from "../task-bits";
import { cx } from "../ui";

export function TodoView({ space, tasks }: { space: Space; tasks: Task[] }) {
  const { today, createTask, updateTask } = useData();
  const { openTask } = useTaskDialog();
  const [draft, setDraft] = useState("");
  const [showDone, setShowDone] = useState(false);

  const { groups, done } = useMemo(() => {
    const open = tasks.filter((t) => t.status !== "completed");
    return {
      groups: PRIORITIES.map((p) => ({
        priority: p,
        tasks: open.filter((t) => t.priority === p).sort(byDueThenPosition),
      })).filter((g) => g.tasks.length > 0),
      done: tasks
        .filter((t) => t.status === "completed")
        .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")),
    };
  }, [tasks]);

  async function quickAdd() {
    const title = draft.trim();
    if (!title) return;
    setDraft("");
    await createTask({ spaceId: space.id, title });
  }

  const empty = groups.length === 0 && done.length === 0;

  return (
    <div className="mx-auto max-w-3xl">
      <form
        className="mb-5 flex items-center gap-2 rounded-xl border border-line bg-surface p-1.5 shadow-sm focus-within:border-focus"
        onSubmit={(e) => {
          e.preventDefault();
          void quickAdd();
        }}
      >
        <span className="flex h-9 w-9 items-center justify-center text-muted">
          <Plus size={18} />
        </span>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="הוספה מהירה: כתבו משימה והקישו Enter"
          aria-label="הוספת משימה מהירה"
          maxLength={300}
          className="h-9 min-w-0 flex-1 bg-transparent text-[15px] placeholder:text-faint focus:outline-none"
        />
        {draft.trim() && (
          <button type="submit" className="h-9 rounded-lg bg-brand px-3.5 text-sm font-medium text-white hover:bg-brand-hover">
            הוספה
          </button>
        )}
      </form>

      {empty && (
        <div className="rounded-2xl border border-dashed border-[#cfd4de] bg-surface/60 px-6 py-14 text-center">
          <p className="text-lg font-semibold">הרשימה ריקה</p>
          <p className="mt-1 text-muted">הוסיפו את המשימה הראשונה בשורה למעלה.</p>
        </div>
      )}

      <div className="space-y-6">
        {groups.map((g) => (
          <PriorityGroup
            key={g.priority}
            priority={g.priority}
            tasks={g.tasks}
            today={today}
            onToggle={(t) => updateTask(t.id, { status: "completed" })}
            onOpen={openTask}
          />
        ))}
      </div>

      {done.length > 0 && (
        <section className="mt-8">
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            aria-expanded={showDone}
            className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-start text-sm font-semibold text-muted hover:text-ink"
          >
            <ChevronDown size={16} className={cx("transition-transform", !showDone && "-rotate-90")} />
            הושלמו ({done.length})
          </button>
          {showDone && (
            <ul className="mt-1 divide-y divide-line-soft overflow-hidden rounded-xl border border-line bg-surface">
              {done.map((t) => (
                <Row
                  key={t.id}
                  task={t}
                  today={today}
                  onToggle={() => updateTask(t.id, { status: "new" })}
                  onOpen={() => openTask(t.id)}
                />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function PriorityGroup({
  priority,
  tasks,
  today,
  onToggle,
  onOpen,
}: {
  priority: Priority;
  tasks: Task[];
  today: string;
  onToggle: (t: Task) => void;
  onOpen: (id: string) => void;
}) {
  const m = PRIORITY_META[priority];
  return (
    <section aria-label={m.label}>
      <h3 className="mb-2 flex items-center gap-2 px-1 text-sm font-bold" style={{ color: m.color }}>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />
        {m.label}
        <span className="rounded-full px-2 text-xs font-semibold" style={{ background: m.soft }}>
          {tasks.length}
        </span>
      </h3>
      <ul
        className={cx(
          "divide-y divide-line-soft overflow-hidden rounded-xl border border-line bg-surface",
          priority === "irrelevant" && "opacity-70",
        )}
      >
        {tasks.map((t) => (
          <Row key={t.id} task={t} today={today} onToggle={() => onToggle(t)} onOpen={() => onOpen(t.id)} />
        ))}
      </ul>
    </section>
  );
}

function Row({ task, today, onToggle, onOpen }: { task: Task; today: string; onToggle: () => void; onOpen: () => void }) {
  const m = PRIORITY_META[task.priority];
  const done = task.status === "completed";
  return (
    <li className="group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-wash">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={done ? `החזרת "${task.title}" לפתוחה` : `סימון "${task.title}" כהושלמה`}
        onClick={onToggle}
        className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 transition-all hover:scale-110"
        style={
          done
            ? { background: STATUS_META.completed.color, borderColor: STATUS_META.completed.color }
            : { borderColor: m.color }
        }
      >
        {done && <Check size={13} strokeWidth={3.5} className="text-white" />}
      </button>
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-start">
        <span className="min-w-0 flex-1">
          <span className={cx("block truncate text-[15px] font-medium", done && "text-muted line-through decoration-faint")}>
            {task.title}
          </span>
          {task.description && <span className="block truncate text-sm text-muted">{task.description}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {task.type === "event" && <EventMark />}
          {(task.status === "working" || task.status === "paused") && (
            <span
              className="rounded-md px-1.5 py-0.5 text-xs font-medium"
              style={{ background: STATUS_META[task.status].soft, color: STATUS_META[task.status].color }}
            >
              {STATUS_META[task.status].label}
            </span>
          )}
          <DueChip task={task} today={today} />
        </span>
      </button>
    </li>
  );
}
