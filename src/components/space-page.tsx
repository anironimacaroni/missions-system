"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CalendarDays, KanbanSquare, ListChecks, Plus, Settings2 } from "lucide-react";
import { VIEWS, VIEW_META, type View } from "@/lib/constants";
import { useData } from "./data-provider";
import { useSpaceDialog } from "./space-dialog";
import { useTaskDialog } from "./task-dialog";
import { KanbanView } from "./views/kanban-view";
import { TodoView } from "./views/todo-view";
import { CalendarView } from "./views/calendar-view";
import { Button, IconButton, Spinner, cx } from "./ui";

const VIEW_ICON: Record<View, typeof KanbanSquare> = {
  kanban: KanbanSquare,
  todo: ListChecks,
  calendar: CalendarDays,
};

export function SpacePage() {
  const params = useParams<{ id: string }>();
  const { spaces, tasks, loaded, updateSpace, today } = useData();
  const { newTask } = useTaskDialog();
  const { openEdit } = useSpaceDialog();

  const space = spaces.find((s) => s.id === params.id);
  const spaceTasks = useMemo(() => tasks.filter((t) => t.spaceId === params.id), [tasks, params.id]);

  if (!loaded) {
    return (
      <div className="flex justify-center py-24 text-muted">
        <Spinner size={24} />
      </div>
    );
  }
  if (!space) {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-2xl border border-line bg-surface p-10 text-center">
        <h1 className="text-xl font-bold">המרחב לא נמצא</h1>
        <p className="mt-1 text-muted">ייתכן שנמחק.</p>
        <Link href="/" className="mt-5 inline-block font-medium text-focus hover:underline">
          חזרה לדשבורד
        </Link>
      </div>
    );
  }

  const openCount = spaceTasks.filter((t) => t.status !== "completed").length;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="h-9 w-2 shrink-0 rounded-full" style={{ background: space.color }} aria-hidden />
          <div className="min-w-0">
            <h1 className="truncate font-display text-3xl font-black leading-tight sm:text-4xl">{space.name}</h1>
            <p className="text-sm text-muted">
              {openCount === 0 ? "אין משימות פתוחות" : openCount === 1 ? "משימה פתוחה אחת" : `${openCount} משימות פתוחות`}
            </p>
          </div>
          <IconButton label="עריכת המרחב" onClick={() => openEdit(space.id)} className="ms-1">
            <Settings2 size={18} />
          </IconButton>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl bg-[#e6e9f0] p-1" role="radiogroup" aria-label="תצוגה">
            {VIEWS.map((v) => {
              const Icon = VIEW_ICON[v];
              const active = space.view === v;
              return (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => !active && void updateSpace(space.id, { view: v })}
                  title={VIEW_META[v].hint}
                  className={cx(
                    "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-all",
                    active ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
                  )}
                >
                  <Icon size={15} />
                  <span className="max-sm:sr-only">{VIEW_META[v].label}</span>
                </button>
              );
            })}
          </div>
          <Button
            variant="primary"
            onClick={() => newTask({ spaceId: space.id, dueDate: space.view === "calendar" ? today : undefined })}
          >
            <Plus size={18} />
            משימה חדשה
          </Button>
        </div>
      </header>

      {space.view === "kanban" && <KanbanView space={space} tasks={spaceTasks} />}
      {space.view === "todo" && <TodoView space={space} tasks={spaceTasks} />}
      {space.view === "calendar" && <CalendarView space={space} tasks={spaceTasks} />}
    </div>
  );
}
