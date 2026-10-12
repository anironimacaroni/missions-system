import { PRIORITY_META } from "./constants";
import type { Task } from "./types";

export function isOpen(t: Task): boolean {
  return t.status !== "completed";
}

export function isOverdue(t: Task, today: string): boolean {
  return isOpen(t) && t.dueDate !== null && t.dueDate < today;
}

/** תאריך יעד קרוב קודם, בלי תאריך בסוף, ואז לפי מיקום ידני */
export function byDueThenPosition(a: Task, b: Task): number {
  if (a.dueDate !== b.dueDate) {
    if (a.dueDate === null) return 1;
    if (b.dueDate === null) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  return a.position - b.position;
}

export function byPriorityThenDue(a: Task, b: Task): number {
  const d = PRIORITY_META[a.priority].rank - PRIORITY_META[b.priority].rank;
  return d !== 0 ? d : byDueThenPosition(a, b);
}
