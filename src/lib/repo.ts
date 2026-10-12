import { z } from "zod";
import { query } from "./db";
import { PRIORITIES, SPACE_COLORS, STATUSES, TASK_TYPES, VIEWS } from "./constants";
import { isValidISODate } from "./dates";
import type { AppSettings, Space, Task } from "./types";

/* ---------- ולידציה ---------- */

const UUID = z.string().regex(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/);
const DATE = z.string().refine(isValidISODate, "תאריך לא תקין (YYYY-MM-DD)");
const COLOR = z.string().regex(/^#[0-9a-fA-F]{6}$/);

const taskFields = {
  spaceId: UUID,
  type: z.enum(TASK_TYPES),
  title: z.string().trim().min(1, "חסרה כותרת").max(300),
  description: z.string().max(10000),
  priority: z.enum(PRIORITIES),
  status: z.enum(STATUSES),
  dueDate: DATE.nullable(),
  position: z.number().finite(),
};

export const taskCreateSchema = z.object({
  spaceId: taskFields.spaceId,
  title: taskFields.title,
  type: taskFields.type.optional(),
  description: taskFields.description.optional(),
  priority: taskFields.priority.optional(),
  status: taskFields.status.optional(),
  dueDate: taskFields.dueDate.optional(),
});
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;

export const taskUpdateSchema = z.object(taskFields).partial();
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;

export const spaceCreateSchema = z.object({
  name: z.string().trim().min(1, "חסר שם למרחב").max(60),
  color: COLOR.optional(),
  view: z.enum(VIEWS).optional(),
});
export const spaceUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  color: COLOR,
  view: z.enum(VIEWS),
}).partial();

export const settingsSchema = z.object({
  dashboardSpaces: z.array(UUID).nullable(),
});

export function isUuid(s: unknown): s is string {
  return typeof s === "string" && UUID.safeParse(s).success;
}

/* ---------- מיפוי שורות ---------- */

interface TaskRow {
  id: string;
  space_id: string;
  type: Task["type"];
  title: string;
  description: string;
  priority: Task["priority"];
  status: Task["status"];
  due_date: string | null;
  position: number;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function mapTask(r: TaskRow): Task {
  return {
    id: r.id,
    spaceId: r.space_id,
    type: r.type,
    title: r.title,
    description: r.description,
    priority: r.priority,
    status: r.status,
    dueDate: r.due_date,
    position: Number(r.position),
    completedAt: r.completed_at ? r.completed_at.toISOString() : null,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

interface SpaceRow {
  id: string;
  name: string;
  color: string;
  view: Space["view"];
  position: number;
}

function mapSpace(r: SpaceRow): Space {
  return { id: r.id, name: r.name, color: r.color, view: r.view, position: r.position };
}

/* ---------- מרחבים ---------- */

export async function listSpaces(): Promise<Space[]> {
  const rows = await query<SpaceRow>("SELECT id, name, color, view, position FROM spaces ORDER BY position, created_at");
  return rows.map(mapSpace);
}

export async function createSpace(input: z.infer<typeof spaceCreateSchema>): Promise<Space> {
  const rows = await query<SpaceRow>(
    `INSERT INTO spaces (name, color, view, position)
     VALUES ($1, $2, $3, (SELECT COALESCE(MAX(position), -1) + 1 FROM spaces))
     RETURNING id, name, color, view, position`,
    [input.name, input.color ?? SPACE_COLORS[0], input.view ?? "kanban"],
  );
  return mapSpace(rows[0]);
}

export async function updateSpace(id: string, patch: z.infer<typeof spaceUpdateSchema>): Promise<Space | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const key of ["name", "color", "view"] as const) {
    if (patch[key] !== undefined) {
      params.push(patch[key]);
      sets.push(`${key} = $${params.length}`);
    }
  }
  if (sets.length === 0) {
    const rows = await query<SpaceRow>("SELECT id, name, color, view, position FROM spaces WHERE id = $1", [id]);
    return rows[0] ? mapSpace(rows[0]) : null;
  }
  params.push(id);
  const rows = await query<SpaceRow>(
    `UPDATE spaces SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING id, name, color, view, position`,
    params,
  );
  return rows[0] ? mapSpace(rows[0]) : null;
}

export async function deleteSpace(id: string): Promise<boolean> {
  const rows = await query("DELETE FROM spaces WHERE id = $1 RETURNING id", [id]);
  return rows.length > 0;
}

/* ---------- משימות ---------- */

const TASK_COLS =
  "id, space_id, type, title, description, priority, status, due_date, position, completed_at, created_at, updated_at";

export async function listTasks(opts: { spaceId?: string } = {}): Promise<Task[]> {
  const rows = opts.spaceId
    ? await query<TaskRow>(`SELECT ${TASK_COLS} FROM tasks WHERE space_id = $1 ORDER BY position, created_at`, [opts.spaceId])
    : await query<TaskRow>(`SELECT ${TASK_COLS} FROM tasks ORDER BY position, created_at`);
  return rows.map(mapTask);
}

export async function getTask(id: string): Promise<Task | null> {
  const rows = await query<TaskRow>(`SELECT ${TASK_COLS} FROM tasks WHERE id = $1`, [id]);
  return rows[0] ? mapTask(rows[0]) : null;
}

export async function createTask(input: TaskCreateInput): Promise<Task> {
  const status = input.status ?? "new";
  const rows = await query<TaskRow>(
    `INSERT INTO tasks (space_id, type, title, description, priority, status, due_date, position, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7,
       (SELECT COALESCE(MIN(position), 0) - 1 FROM tasks WHERE space_id = $1),
       CASE WHEN $6 = 'completed' THEN now() ELSE NULL END)
     RETURNING ${TASK_COLS}`,
    [
      input.spaceId,
      input.type ?? "task",
      input.title,
      input.description ?? "",
      input.priority ?? "medium",
      status,
      input.dueDate ?? null,
    ],
  );
  return mapTask(rows[0]);
}

const COLUMN_FOR: Record<keyof TaskUpdateInput, string> = {
  spaceId: "space_id",
  type: "type",
  title: "title",
  description: "description",
  priority: "priority",
  status: "status",
  dueDate: "due_date",
  position: "position",
};

export async function updateTask(id: string, patch: TaskUpdateInput): Promise<Task | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  let statusIdx = 0;
  const add = (col: string, value: unknown) => {
    params.push(value);
    sets.push(`${col} = $${params.length}`);
    return params.length;
  };

  for (const key of Object.keys(COLUMN_FOR) as (keyof TaskUpdateInput)[]) {
    if (patch[key] !== undefined) {
      const idx = add(COLUMN_FOR[key], patch[key]);
      if (key === "status") statusIdx = idx;
    }
  }

  if (patch.status !== undefined) {
    const idx = statusIdx;
    sets.push(
      `completed_at = CASE WHEN $${idx} = 'completed' THEN COALESCE(completed_at, now()) ELSE NULL END`,
    );
    if (patch.position === undefined) {
      // שינוי סטטוס בלי מיקום מפורש: המשימה עולה לראש העמודה החדשה
      sets.push(
        `position = CASE WHEN status <> $${idx} THEN (SELECT COALESCE(MIN(t.position), 0) - 1 FROM tasks t WHERE t.space_id = tasks.space_id) ELSE position END`,
      );
    }
  }

  if (sets.length === 0) return getTask(id);
  sets.push("updated_at = now()");
  params.push(id);
  const rows = await query<TaskRow>(
    `UPDATE tasks SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING ${TASK_COLS}`,
    params,
  );
  return rows[0] ? mapTask(rows[0]) : null;
}

export async function deleteTask(id: string): Promise<boolean> {
  const rows = await query("DELETE FROM tasks WHERE id = $1 RETURNING id", [id]);
  return rows.length > 0;
}

/* ---------- הגדרות ---------- */

export async function getSettings(): Promise<AppSettings> {
  const rows = await query<{ key: string; value: unknown }>("SELECT key, value FROM settings");
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const ds = map.get("dashboardSpaces");
  return { dashboardSpaces: Array.isArray(ds) ? (ds as string[]) : null };
}

export async function saveSettings(s: AppSettings): Promise<void> {
  await query(
    `INSERT INTO settings (key, value) VALUES ('dashboardSpaces', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(s.dashboardSpaces)],
  );
}
