// קבועים משותפים לצד השרת והלקוח: עדיפויות, סטטוסים, תצוגות וצבעים.

export const PRIORITIES = ["urgent", "high", "medium", "low", "irrelevant"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const STATUSES = ["new", "working", "paused", "completed"] as const;
export type Status = (typeof STATUSES)[number];

export const VIEWS = ["kanban", "todo", "calendar"] as const;
export type View = (typeof VIEWS)[number];

export const TASK_TYPES = ["task", "event"] as const;
export type TaskType = (typeof TASK_TYPES)[number];

/** צבע לכל עדיפות - זהה בכל התצוגות */
export const PRIORITY_META: Record<
  Priority,
  { label: string; color: string; soft: string; rank: number }
> = {
  urgent: { label: "דחוף", color: "#D92D3F", soft: "#FDECEE", rank: 0 },
  high: { label: "גבוהה", color: "#E8710A", soft: "#FEF0E1", rank: 1 },
  medium: { label: "בינונית", color: "#C79500", soft: "#FCF4D9", rank: 2 },
  low: { label: "נמוכה", color: "#2F6FDE", soft: "#E8F0FD", rank: 3 },
  irrelevant: { label: "לא רלוונטי", color: "#8A93A5", soft: "#EEF0F4", rank: 4 },
};

/** סדר התצוגה בבחירה: מהנמוכה לדחוף ובסוף "לא רלוונטי", כפי שהוגדר */
export const PRIORITY_PICK_ORDER: Priority[] = ["low", "medium", "high", "urgent", "irrelevant"];

export const STATUS_META: Record<Status, { label: string; color: string; soft: string }> = {
  new: { label: "חדשה", color: "#6D4FE0", soft: "#EFEBFD" },
  working: { label: "בעבודה", color: "#0B8F8C", soft: "#DFF4F3" },
  paused: { label: "בהשהייה", color: "#9A6B3F", soft: "#F6ECE2" },
  completed: { label: "הושלמה", color: "#1E9A63", soft: "#E1F5EB" },
};

export const VIEW_META: Record<View, { label: string; hint: string }> = {
  kanban: { label: "קנבן", hint: "עמודות לפי סטטוס, גוררים בין עמודות" },
  todo: { label: "רשימה", hint: "רשימת TODO ממוינת לפי עדיפות" },
  calendar: { label: "לוח שנה", hint: "חודש שלם לפי תאריך יעד" },
};

export const TYPE_META: Record<TaskType, { label: string }> = {
  task: { label: "משימה" },
  event: { label: "אירוע" },
};

export const SPACE_COLORS = [
  "#E5604D",
  "#EE9B2F",
  "#2FA566",
  "#14A3A3",
  "#3B7BEA",
  "#7C5CFC",
  "#D6478C",
  "#6B7A90",
] as const;

export const DEFAULT_TIMEZONE = "Asia/Jerusalem";
