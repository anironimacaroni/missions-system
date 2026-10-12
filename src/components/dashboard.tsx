"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlarmClock, ArrowLeft, CalendarCheck, Check, Flame, KanbanSquare, ListChecks, CalendarDays, Plus } from "lucide-react";
import { PRIORITY_META, STATUS_META, VIEW_META, type View } from "@/lib/constants";
import { formatDayLong, formatMonthName, startOfWeek, addDays, toISODate, dayOfMonth, formatWeekdayName } from "@/lib/dates";
import { byPriorityThenDue, isOpen, isOverdue } from "@/lib/task-utils";
import type { Space, Task } from "@/lib/types";
import { useData } from "./data-provider";
import { useSpaceDialog } from "./space-dialog";
import { useTaskDialog } from "./task-dialog";
import { DueChip, EventMark } from "./task-bits";
import { Button, cx } from "./ui";

const VIEW_ICON: Record<View, typeof KanbanSquare> = {
  kanban: KanbanSquare,
  todo: ListChecks,
  calendar: CalendarDays,
};

export function Dashboard() {
  const { spaces, tasks, settings, today, setDashboardSpaces, loaded } = useData();
  const { openNew } = useSpaceDialog();

  const selectedIds = useMemo(() => {
    const all = spaces.map((s) => s.id);
    if (!settings.dashboardSpaces) return all;
    return all.filter((id) => settings.dashboardSpaces!.includes(id));
  }, [spaces, settings.dashboardSpaces]);

  const selected = useMemo(() => spaces.filter((s) => selectedIds.includes(s.id)), [spaces, selectedIds]);
  const scoped = useMemo(() => tasks.filter((t) => selectedIds.includes(t.spaceId)), [tasks, selectedIds]);

  const urgent = useMemo(() => scoped.filter((t) => isOpen(t) && t.priority === "urgent").sort(byPriorityThenDue), [scoped]);
  const dueToday = useMemo(
    () => scoped.filter((t) => isOpen(t) && t.dueDate === today).sort(byPriorityThenDue),
    [scoped, today],
  );
  const overdue = useMemo(
    () => scoped.filter((t) => isOverdue(t, today)).sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "")),
    [scoped, today],
  );

  function toggle(id: string) {
    const next = selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id];
    void setDashboardSpaces(next.length === spaces.length ? null : next);
  }

  if (loaded && spaces.length === 0) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-2xl border border-dashed border-[#cfd4de] bg-surface p-10 text-center">
        <h1 className="font-display text-3xl font-bold">ברוכים הבאים</h1>
        <p className="mt-2 text-muted">התחילו ביצירת מרחב ראשון, למשל &quot;בית&quot; או &quot;עבודה&quot;.</p>
        <Button variant="primary" className="mt-6" onClick={openNew}>
          <Plus size={18} />
          מרחב חדש
        </Button>
      </div>
    );
  }

  const quiet = urgent.length === 0 && dueToday.length === 0 && overdue.length === 0;

  return (
    <div className="space-y-8">
      {/* כותרת בסגנון דף יומן */}
      <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="flex items-end gap-4">
          <div className="font-display text-[84px] font-black leading-[0.82] tracking-tight text-brand sm:text-[104px]">
            {dayOfMonth(today)}
          </div>
          <div className="pb-1">
            <div className="text-xl font-bold">{formatMonthName(today)}</div>
            <div className="text-muted">{formatWeekdayName(today)}</div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 pb-1">
          <Pill color={PRIORITY_META.urgent.color} soft={PRIORITY_META.urgent.soft} n={urgent.length} label="דחוף" />
          <Pill color="#2456b8" soft="#e8f0fd" n={dueToday.length} label="להיום" />
          <Pill color="#a8480a" soft="#fdeede" n={overdue.length} label="באיחור" />
        </div>
      </header>

      {/* בחירת מרחבים */}
      <section aria-label="בחירת מרחבים בדשבורד" className="flex flex-wrap items-center gap-2">
        <span className="me-1 text-sm font-medium text-muted">מציג:</span>
        {spaces.map((s) => {
          const on = selectedIds.includes(s.id);
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(s.id)}
              className={cx(
                "inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-all",
                on ? "bg-surface shadow-sm" : "border-line bg-transparent text-muted hover:bg-surface/70",
              )}
              style={on ? { borderColor: s.color } : undefined}
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-full" style={{ background: on ? s.color : "#cfd4de" }}>
                {on && <Check size={11} strokeWidth={3.5} className="text-white" />}
              </span>
              {s.name}
            </button>
          );
        })}
      </section>

      {selected.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#cfd4de] bg-surface/60 px-6 py-12 text-center text-muted">
          לא נבחר אף מרחב. סמנו מרחב אחד לפחות כדי לראות אותו כאן.
        </div>
      ) : (
        <>
          {/* מה דורש תשומת לב */}
          <section aria-label="משימות חשובות" className="grid gap-4 lg:grid-cols-3">
            <AttentionList
              title="דחוף"
              icon={Flame}
              color={PRIORITY_META.urgent.color}
              soft={PRIORITY_META.urgent.soft}
              tasks={urgent}
              empty="אין משימות דחופות"
              spaces={spaces}
            />
            <AttentionList
              title="להיום"
              icon={CalendarCheck}
              color="#2456b8"
              soft="#e8f0fd"
              tasks={dueToday}
              empty="אין משימות להיום"
              subtitle={formatDayLong(today)}
              spaces={spaces}
            />
            <AttentionList
              title="באיחור"
              icon={AlarmClock}
              color="#a8480a"
              soft="#fdeede"
              tasks={overdue}
              empty="אין משימות באיחור"
              spaces={spaces}
            />
          </section>
          {quiet && <p className="-mt-3 text-center text-sm text-muted">אין משהו שבוער. אפשר לנשום.</p>}

          {/* כרטיס לכל מרחב */}
          <section aria-label="סיכום לפי מרחב">
            <h2 className="mb-3 text-lg font-bold">המרחבים שלי</h2>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {selected.map((s) => (
                <SpaceCard key={s.id} space={s} tasks={tasks.filter((t) => t.spaceId === s.id)} today={today} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Pill({ color, soft, n, label }: { color: string; soft: string; n: number; label: string }) {
  return (
    <span
      className="inline-flex items-baseline gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium"
      style={{ background: n > 0 ? soft : "#e9ebf0", color: n > 0 ? color : "#7b8498" }}
    >
      <span className="text-lg font-bold leading-none">{n}</span>
      {label}
    </span>
  );
}

const PREVIEW_COUNT = 6;

function AttentionList({
  title,
  icon: Icon,
  color,
  soft,
  tasks,
  empty,
  subtitle,
  spaces,
}: {
  title: string;
  icon: typeof Flame;
  color: string;
  soft: string;
  tasks: Task[];
  empty: string;
  subtitle?: string;
  spaces: Space[];
}) {
  const { today, updateTask } = useData();
  const { openTask } = useTaskDialog();
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? tasks : tasks.slice(0, PREVIEW_COUNT);

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
      <header className="flex items-center gap-2.5 border-b border-line-soft px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: soft, color }}>
          <Icon size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold leading-tight">{title}</h3>
          {subtitle && <div className="truncate text-xs text-muted">{subtitle}</div>}
        </div>
        <span className="rounded-full px-2.5 py-0.5 text-sm font-bold" style={{ background: soft, color }}>
          {tasks.length}
        </span>
      </header>
      {tasks.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {shown.map((t) => {
            const space = spaces.find((s) => s.id === t.spaceId);
            return (
              <li key={t.id} className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-wash">
                <button
                  type="button"
                  aria-label={`סימון "${t.title}" כהושלמה`}
                  onClick={() => void updateTask(t.id, { status: "completed" })}
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-transform hover:scale-110"
                  style={{ borderColor: PRIORITY_META[t.priority].color }}
                />
                <button type="button" onClick={() => openTask(t.id)} className="min-w-0 flex-1 text-start">
                  <span className="block truncate text-[15px] font-medium">{t.title}</span>
                  <span className="mt-0.5 flex items-center gap-2 text-xs text-muted">
                    {space && (
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full" style={{ background: space.color }} />
                        {space.name}
                      </span>
                    )}
                    {t.type === "event" && <EventMark className="!px-1 !py-0" />}
                  </span>
                </button>
                <DueChip task={t} today={today} />
              </li>
            );
          })}
        </ul>
      )}
      {tasks.length > PREVIEW_COUNT && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="border-t border-line-soft px-4 py-2.5 text-sm font-medium text-muted hover:bg-wash hover:text-ink"
        >
          {expanded ? "הצג פחות" : `הצג עוד ${tasks.length - PREVIEW_COUNT}`}
        </button>
      )}
    </div>
  );
}

function SpaceCard({ space, tasks, today }: { space: Space; tasks: Task[]; today: string }) {
  const weekStart = startOfWeek(today);
  const weekEnd = addDays(weekStart, 6);
  const open = tasks.filter(isOpen).length;
  const overdue = tasks.filter((t) => isOverdue(t, today)).length;
  const closedThisWeek = tasks.filter((t) => {
    if (!t.completedAt) return false;
    const d = toISODate(new Date(t.completedAt));
    return d >= weekStart && d <= weekEnd;
  }).length;
  const ViewIcon = VIEW_ICON[space.view];

  return (
    <Link
      href={`/spaces/${space.id}`}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
    >
      <span className="absolute inset-x-0 top-0 h-1.5" style={{ background: space.color }} aria-hidden />
      <div className="mt-1 flex items-center justify-between gap-2">
        <h3 className="truncate text-lg font-bold">{space.name}</h3>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted">
          <ViewIcon size={14} />
          {VIEW_META[space.view].label}
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Stat label="פתוחות" value={open} />
        <Stat label="באיחור" value={overdue} tone={overdue > 0 ? "bad" : "muted"} />
        <Stat label="נסגרו השבוע" value={closedThisWeek} tone={closedThisWeek > 0 ? "good" : "muted"} />
      </dl>
      <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors group-hover:text-ink">
        לפתיחת המרחב
        <ArrowLeft size={15} className="transition-transform group-hover:-translate-x-0.5" />
      </span>
    </Link>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "bad" | "good" | "muted" }) {
  const color = tone === "bad" ? "#c0293a" : tone === "good" ? STATUS_META.completed.color : tone === "muted" ? "#98a2b3" : "#161c2d";
  return (
    <div className="rounded-xl bg-wash px-1 py-2.5">
      <dd className="text-2xl font-bold leading-none" style={{ color }}>
        {value}
      </dd>
      <dt className="mt-1.5 text-xs font-medium text-muted">{label}</dt>
    </div>
  );
}
