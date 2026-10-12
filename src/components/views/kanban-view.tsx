"use client";

import { useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { PRIORITY_META, STATUSES, STATUS_META, type Status } from "@/lib/constants";
import type { Space, Task } from "@/lib/types";
import { useData } from "../data-provider";
import { useTaskDialog } from "../task-dialog";
import { DueChip, EventMark } from "../task-bits";
import { PriorityBadge, cx } from "../ui";

const COL_PREFIX = "col:";

export function KanbanView({ space, tasks }: { space: Space; tasks: Task[] }) {
  const { today, updateTask } = useData();
  const { newTask, openTask } = useTaskDialog();
  const [activeId, setActiveId] = useState<string | null>(null);
  const justDragged = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] } }),
  );

  const columns = useMemo(
    () =>
      STATUSES.map((status) => ({
        status,
        tasks: tasks.filter((t) => t.status === status).sort((a, b) => a.position - b.position),
      })),
    [tasks],
  );

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : undefined;

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    // אחרי גרירה הדפדפן עלול לירות click על הכרטיס המקורי; מתעלמים ממנו
    justDragged.current = true;
    setTimeout(() => {
      justDragged.current = false;
    }, 200);
    const { active, over } = e;
    if (!over) return;
    const dragged = tasks.find((t) => t.id === active.id);
    if (!dragged) return;

    let status: Status;
    let insertAt: number;
    const overId = String(over.id);
    if (overId.startsWith(COL_PREFIX)) {
      status = overId.slice(COL_PREFIX.length) as Status;
      insertAt = Number.POSITIVE_INFINITY;
    } else {
      const overTask = tasks.find((t) => t.id === overId);
      if (!overTask) return;
      if (overTask.id === dragged.id) return;
      status = overTask.status;
      const siblings = tasks
        .filter((t) => t.status === status && t.id !== dragged.id)
        .sort((a, b) => a.position - b.position);
      const idx = siblings.findIndex((t) => t.id === overTask.id);
      const translated = active.rect.current.translated;
      const draggedCenter = translated ? translated.top + translated.height / 2 : 0;
      const overCenter = over.rect.top + over.rect.height / 2;
      insertAt = draggedCenter > overCenter ? idx + 1 : idx;
    }

    const siblings = tasks
      .filter((t) => t.status === status && t.id !== dragged.id)
      .sort((a, b) => a.position - b.position);
    const index = Math.min(insertAt, siblings.length);
    const prev = siblings[index - 1];
    const next = siblings[index];
    const position =
      prev && next ? (prev.position + next.position) / 2 : prev ? prev.position + 1 : next ? next.position - 1 : 0;

    if (status === dragged.status) {
      // אותו מקום - אין מה לשמור
      const before = tasks.filter((t) => t.status === status).sort((a, b) => a.position - b.position);
      if (before.findIndex((t) => t.id === dragged.id) === index) return;
    }
    void updateTask(dragged.id, { status, position });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="grid auto-cols-[minmax(272px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-3 lg:grid-cols-4 lg:grid-flow-row lg:auto-cols-auto lg:overflow-visible">
        {columns.map((col) => (
          <Column key={col.status} status={col.status} count={col.tasks.length} onAdd={() => newTask({ spaceId: space.id, status: col.status })}>
            {col.tasks.map((t) => (
              <Card
                key={t.id}
                task={t}
                today={today}
                onOpen={() => {
                  if (!justDragged.current) openTask(t.id);
                }}
                hidden={t.id === activeId}
              />
            ))}
          </Column>
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 160 }}>
        {activeTask ? <CardBody task={activeTask} today={today} overlay /> : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  status,
  count,
  onAdd,
  children,
}: {
  status: Status;
  count: number;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: COL_PREFIX + status });
  const meta = STATUS_META[status];
  return (
    <section
      aria-label={meta.label}
      className={cx(
        "flex min-h-[220px] flex-col rounded-2xl border bg-[#eceef3] p-2.5 transition-colors lg:min-h-[420px]",
        isOver ? "border-focus bg-[#e4e8f6]" : "border-transparent",
      )}
    >
      <header className="mb-2.5 flex items-center justify-between px-1.5 pt-0.5">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.color }} />
          <h3 className="text-[15px] font-bold">{meta.label}</h3>
          <span className="rounded-full bg-white/80 px-2 text-xs font-semibold text-muted">{count}</span>
        </div>
        <button
          type="button"
          onClick={onAdd}
          aria-label={`משימה חדשה ב"${meta.label}"`}
          title="משימה חדשה"
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-white hover:text-ink"
        >
          <Plus size={16} />
        </button>
      </header>
      <div ref={setNodeRef} className="flex flex-1 flex-col gap-2">
        {children}
        {count === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-[#cfd4de] px-3 py-8 text-center text-sm text-faint">
            גררו משימה לכאן
          </div>
        )}
      </div>
    </section>
  );
}

function Card({ task, today, onOpen, hidden }: { task: Task; today: string; onOpen: () => void; hidden: boolean }) {
  const drag = useDraggable({ id: task.id });
  const drop = useDroppable({ id: task.id });
  return (
    <div
      ref={(node) => {
        drag.setNodeRef(node);
        drop.setNodeRef(node);
      }}
      {...drag.listeners}
      {...drag.attributes}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      className={cx("touch-manipulation outline-none", hidden && "opacity-30")}
    >
      <CardBody task={task} today={today} />
    </div>
  );
}

function CardBody({ task, today, overlay }: { task: Task; today: string; overlay?: boolean }) {
  const meta = PRIORITY_META[task.priority];
  const done = task.status === "completed";
  return (
    <div
      className={cx(
        "group cursor-grab rounded-xl border border-line bg-surface p-3 shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition-shadow hover:shadow-md active:cursor-grabbing",
        overlay && "rotate-1 cursor-grabbing shadow-xl ring-1 ring-focus",
      )}
      style={{ borderInlineStartWidth: 4, borderInlineStartColor: meta.color }}
    >
      <div className={cx("clamp-2 text-[15px] font-semibold leading-snug", done && "text-muted line-through decoration-faint")}>
        {task.title}
      </div>
      {task.description && <div className="mt-1 line-clamp-1 text-sm text-muted">{task.description}</div>}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <PriorityBadge priority={task.priority} />
        {task.type === "event" && <EventMark />}
        <DueChip task={task} today={today} />
      </div>
    </div>
  );
}
