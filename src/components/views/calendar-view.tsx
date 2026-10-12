"use client";

import { useMemo, useState } from "react";
import { CalendarOff, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { PRIORITY_META } from "@/lib/constants";
import {
  addMonths,
  dayOfMonth,
  formatDayLong,
  formatMonthTitle,
  monthGrid,
  startOfMonth,
} from "@/lib/dates";
import { byPriorityThenDue } from "@/lib/task-utils";
import type { Space, Task } from "@/lib/types";
import { useData } from "../data-provider";
import { useTaskDialog } from "../task-dialog";
import { Button, IconButton, Modal, ModalHeader, cx } from "../ui";

const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const WEEKDAYS_SHORT = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
const MAX_CHIPS = 3;

export function CalendarView({ space, tasks }: { space: Space; tasks: Task[] }) {
  const { today, updateTask } = useData();
  const { newTask, openTask } = useTaskDialog();
  const [cursor, setCursor] = useState(() => startOfMonth(today));
  const [dayModal, setDayModal] = useState<string | null>(null);
  const [showUnscheduled, setShowUnscheduled] = useState(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const days = useMemo(() => monthGrid(cursor), [cursor]);
  const byDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.dueDate) continue;
      const list = map.get(t.dueDate) ?? [];
      list.push(t);
      map.set(t.dueDate, list);
    }
    for (const list of map.values()) list.sort(byPriorityThenDue);
    return map;
  }, [tasks]);
  const unscheduled = useMemo(() => tasks.filter((t) => !t.dueDate && t.status !== "completed"), [tasks]);

  const monthPrefix = cursor.slice(0, 7);
  const isCurrentMonth = cursor === startOfMonth(today);
  const weeks = days.length / 7;

  return (
    <div className="rounded-2xl border border-line bg-surface shadow-sm">
      {/* סרגל עליון */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="min-w-[10ch] font-display text-2xl font-bold">{formatMonthTitle(cursor)}</h2>
          <div className="flex items-center">
            {/* ב-RTL "הקודם" הוא ימינה */}
            <IconButton label="החודש הקודם" onClick={() => setCursor((c) => addMonths(c, -1))}>
              <ChevronRight size={20} />
            </IconButton>
            <IconButton label="החודש הבא" onClick={() => setCursor((c) => addMonths(c, 1))}>
              <ChevronLeft size={20} />
            </IconButton>
          </div>
          <Button size="sm" onClick={() => setCursor(startOfMonth(today))} disabled={isCurrentMonth}>
            היום
          </Button>
        </div>
        <Button size="sm" onClick={() => setShowUnscheduled(true)} disabled={unscheduled.length === 0}>
          <CalendarOff size={15} />
          ללא תאריך ({unscheduled.length})
        </Button>
      </div>

      {/* כותרות ימים */}
      <div className="grid grid-cols-7 border-b border-line-soft bg-wash text-center text-xs font-semibold text-muted sm:text-sm">
        {WEEKDAYS.map((d, i) => (
          <div key={d} className={cx("py-2", i >= 5 && "text-faint")}>
            <span className="hidden sm:inline">{d}</span>
            <span className="sm:hidden">{WEEKDAYS_SHORT[i]}</span>
          </div>
        ))}
      </div>

      {/* רשת החודש */}
      <div className="grid grid-cols-7" style={{ gridTemplateRows: `repeat(${weeks}, minmax(0, 1fr))` }}>
        {days.map((iso, idx) => {
          const dayTasks = byDay.get(iso) ?? [];
          const inMonth = iso.startsWith(monthPrefix);
          const isToday = iso === today;
          const weekend = idx % 7 >= 5;
          const shown = dayTasks.slice(0, MAX_CHIPS);
          const hidden = dayTasks.length - shown.length;
          return (
            <div
              key={iso}
              onClick={() => newTask({ spaceId: space.id, dueDate: iso })}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dropTarget !== iso) setDropTarget(iso);
              }}
              onDragLeave={() => setDropTarget((d) => (d === iso ? null : d))}
              onDrop={(e) => {
                e.preventDefault();
                setDropTarget(null);
                const id = e.dataTransfer.getData("text/task-id");
                const t = tasks.find((x) => x.id === id);
                if (t && t.dueDate !== iso) void updateTask(id, { dueDate: iso });
              }}
              className={cx(
                "group relative min-h-[84px] cursor-pointer border-b border-e border-line-soft p-1 transition-colors sm:min-h-[118px] sm:p-1.5",
                "nth-[7n]:border-e-0",
                weekend && "bg-[#fafbfc]",
                !inMonth && "bg-wash/80",
                dropTarget === iso ? "bg-[#eaf0ff]! ring-2 ring-inset ring-focus" : "hover:bg-[#f6f8ff]",
              )}
            >
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={cx(
                    "flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-sm font-semibold",
                    isToday ? "bg-brand text-white" : inMonth ? "text-ink" : "text-faint",
                  )}
                  aria-label={isToday ? `היום, ${formatDayLong(iso)}` : formatDayLong(iso)}
                >
                  {dayOfMonth(iso)}
                </span>
                <button
                  type="button"
                  aria-label={`משימה חדשה ב${formatDayLong(iso)}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    newTask({ spaceId: space.id, dueDate: iso });
                  }}
                  className="hidden h-6 w-6 items-center justify-center rounded-md text-muted opacity-0 transition-opacity hover:bg-black/5 focus-visible:opacity-100 group-hover:opacity-100 sm:flex"
                >
                  <Plus size={14} />
                </button>
              </div>
              <div className="space-y-0.5">
                {shown.map((t) => (
                  <Chip key={t.id} task={t} onOpen={() => openTask(t.id)} />
                ))}
                {hidden > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDayModal(iso);
                    }}
                    className="w-full rounded px-1.5 py-0.5 text-start text-xs font-semibold text-muted hover:bg-black/5"
                  >
                    +{hidden} נוספות
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* כל משימות היום */}
      <Modal open={dayModal !== null} onClose={() => setDayModal(null)} label="משימות היום" maxWidth="max-w-md">
        {dayModal && (
          <>
            <ModalHeader title={formatDayLong(dayModal)} onClose={() => setDayModal(null)} />
            <div className="space-y-1 overflow-y-auto p-3">
              {(byDay.get(dayModal) ?? []).map((t) => (
                <Chip
                  key={t.id}
                  task={t}
                  large
                  onOpen={() => {
                    setDayModal(null);
                    openTask(t.id);
                  }}
                />
              ))}
            </div>
            <div className="border-t border-line-soft bg-wash px-4 py-3">
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  const d = dayModal;
                  setDayModal(null);
                  newTask({ spaceId: space.id, dueDate: d });
                }}
              >
                <Plus size={15} />
                משימה חדשה ליום הזה
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* משימות בלי תאריך */}
      <Modal open={showUnscheduled} onClose={() => setShowUnscheduled(false)} label="משימות ללא תאריך" maxWidth="max-w-md">
        <ModalHeader title="משימות ללא תאריך יעד" onClose={() => setShowUnscheduled(false)} />
        <div className="space-y-1 overflow-y-auto p-3">
          {unscheduled.map((t) => (
            <Chip
              key={t.id}
              task={t}
              large
              onOpen={() => {
                setShowUnscheduled(false);
                openTask(t.id);
              }}
            />
          ))}
        </div>
        <p className="border-t border-line-soft bg-wash px-4 py-3 text-sm text-muted">
          פתחו משימה כדי לתת לה תאריך, והיא תופיע בלוח.
        </p>
      </Modal>
    </div>
  );
}

function Chip({ task, onOpen, large }: { task: Task; onOpen: () => void; large?: boolean }) {
  const m = PRIORITY_META[task.priority];
  const done = task.status === "completed";
  const isEvent = task.type === "event";
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/task-id", task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      title={task.title}
      className={cx(
        "flex w-full items-center gap-1.5 truncate rounded-md text-start font-medium transition-[filter] hover:brightness-95",
        large ? "px-3 py-2 text-[15px]" : "px-1.5 py-[3px] text-xs",
        done && "opacity-55",
      )}
      style={
        isEvent
          ? { background: m.color, color: "#fff" }
          : { background: m.soft, color: m.color, borderInlineStart: `3px solid ${m.color}` }
      }
    >
      {!isEvent && !large && <span className="h-1.5 w-1.5 shrink-0 rounded-full max-sm:hidden" style={{ background: m.color }} />}
      <span className={cx("truncate max-sm:hidden", large && "max-sm:inline", done && "line-through")}>{task.title}</span>
      <span className="sm:hidden max-sm:block h-1.5 w-full" aria-hidden />
    </button>
  );
}
