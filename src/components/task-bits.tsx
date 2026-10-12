"use client";

import { CalendarDays, CalendarClock } from "lucide-react";
import { relativeDue } from "@/lib/dates";
import { isOverdue } from "@/lib/task-utils";
import type { Task } from "@/lib/types";
import { cx } from "./ui";

export function DueChip({ task, today, className }: { task: Task; today: string; className?: string }) {
  if (!task.dueDate) return null;
  const overdue = isOverdue(task, today);
  const isToday = task.dueDate === today && task.status !== "completed";
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium",
        overdue ? "bg-[#fdecee] text-[#c0293a]" : isToday ? "bg-[#e8f0fd] text-[#2456b8]" : "bg-line-soft text-muted",
        className,
      )}
      title={task.dueDate}
    >
      <CalendarDays size={12} aria-hidden />
      {relativeDue(task.dueDate, today)}
    </span>
  );
}

export function EventMark({ className }: { className?: string }) {
  return (
    <span
      className={cx("inline-flex items-center gap-1 rounded-md bg-[#f1ecfd] px-1.5 py-0.5 text-xs font-medium text-[#5b3fc4]", className)}
    >
      <CalendarClock size={12} aria-hidden />
      אירוע
    </span>
  );
}
