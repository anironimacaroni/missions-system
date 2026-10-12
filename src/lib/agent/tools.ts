import { z } from "zod";
import {
  PRIORITIES,
  PRIORITY_META,
  STATUSES,
  STATUS_META,
  TASK_TYPES,
  TYPE_META,
} from "../constants";
import { addDays, isValidISODate, startOfWeek } from "../dates";
import { tasksLabel } from "../plural";
import { createTask, deleteTask, listTasks, updateTask, type TaskUpdateInput } from "../repo";
import type { AgentScope, Space, Task } from "../types";

/** מעל מספר זה של משימות נדרש אישור מהמשתמש. מחיקה דורשת אישור תמיד. */
export const CONFIRM_THRESHOLD = 3;

/* ---------- הגדרת הכלים עבור המודל ---------- */

const whereProps = {
  ids: { type: "array", items: { type: "string" }, description: "מזהי משימות מדויקים (מתוך read_tasks)" },
  space: { type: "string", description: "שם מרחב. רלוונטי רק כשהבחירה היא כל המרחבים" },
  status: { type: "string", enum: [...STATUSES], description: "new=חדשה, working=בעבודה, paused=בהשהייה, completed=הושלמה" },
  priority: {
    type: "string",
    enum: [...PRIORITIES],
    description: "urgent=דחוף, high=גבוהה, medium=בינונית, low=נמוכה, irrelevant=לא רלוונטי",
  },
  type: { type: "string", enum: [...TASK_TYPES], description: "task=משימה, event=אירוע" },
  overdue: { type: "boolean", description: "true = רק משימות פתוחות שתאריך היעד שלהן עבר" },
  due_on: { type: "string", description: "תאריך יעד מדויק, YYYY-MM-DD" },
  due_before: { type: "string", description: "תאריך יעד לפני (לא כולל), YYYY-MM-DD" },
  due_after: { type: "string", description: "תאריך יעד אחרי (לא כולל), YYYY-MM-DD" },
  no_due_date: { type: "boolean", description: "true = רק משימות ללא תאריך יעד" },
  search: { type: "string", description: "חיפוש טקסט בכותרת או בתיאור" },
  include_completed: {
    type: "boolean",
    description: "ברירת מחדל: משימות שהושלמו לא נכללות, אלא אם סטטוס=completed או שנבחרו לפי ids",
  },
  all: { type: "boolean", description: "true = כל המשימות בבחירה הנוכחית (שימוש מפורש בלבד)" },
} as const;

const whereSchema = {
  type: "object",
  description: "מסנן שבוחר משימות. לפחות שדה אחד נדרש בפעולות כתיבה.",
  properties: whereProps,
  additionalProperties: false,
} as const;

export const TOOL_DEFINITIONS = [
  {
    type: "function" as const,
    function: {
      name: "read_tasks",
      description: "קורא משימות לפי מסנן (בתוך הבחירה הנוכחית בלבד). השתמש לפני כל תשובה על תוכן המשימות.",
      parameters: {
        type: "object",
        properties: {
          where: { ...whereSchema, description: "מסנן. ריק = כל המשימות הפתוחות בבחירה" },
          limit: { type: "integer", description: "מקסימום משימות להחזרה (ברירת מחדל 60)" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_tasks",
      description: "מוסיף משימה אחת או יותר. תאריכים בפורמט YYYY-MM-DD.",
      parameters: {
        type: "object",
        properties: {
          tasks: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                space: { type: "string", description: "שם המרחב. חובה כשהבחירה היא כל המרחבים" },
                type: { type: "string", enum: [...TASK_TYPES] },
                priority: { type: "string", enum: [...PRIORITIES] },
                status: { type: "string", enum: [...STATUSES] },
                due_date: { type: "string", description: "YYYY-MM-DD" },
                description: { type: "string" },
              },
              required: ["title"],
              additionalProperties: false,
            },
          },
        },
        required: ["tasks"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_tasks",
      description:
        "מעדכן שדות במשימות שנבחרו לפי מסנן. עובד גם על קבוצה גדולה בקריאה אחת. " +
        "פעולה על יותר מ-3 משימות דורשת אישור משתמש - המערכת תטפל בזה.",
      parameters: {
        type: "object",
        properties: {
          where: whereSchema,
          changes: {
            type: "object",
            description: "השדות לשינוי. due_date: null מוחק את תאריך היעד.",
            properties: {
              title: { type: "string" },
              description: { type: "string" },
              priority: { type: "string", enum: [...PRIORITIES] },
              status: { type: "string", enum: [...STATUSES] },
              type: { type: "string", enum: [...TASK_TYPES] },
              due_date: { type: ["string", "null"], description: "YYYY-MM-DD או null" },
              space: { type: "string", description: "העברה למרחב אחר (רק כשהבחירה היא כל המרחבים)" },
            },
            additionalProperties: false,
          },
        },
        required: ["where", "changes"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "delete_tasks",
      description: "מוחק משימות שנבחרו לפי מסנן. תמיד דורש אישור משתמש - המערכת תטפל בזה.",
      parameters: {
        type: "object",
        properties: { where: whereSchema },
        required: ["where"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "summarize_tasks",
      description:
        "מחזיר סיכום מספרי של המשימות בבחירה: פתוחות, באיחור, להיום, השבוע, לפי מרחב/עדיפות/סטטוס, ורשימת מה שדורש תשומת לב.",
      parameters: {
        type: "object",
        properties: { where: { ...whereSchema, description: "אופציונלי: לסכם רק קבוצה מסוימת" } },
        additionalProperties: false,
      },
    },
  },
];

/* ---------- ולידציה של קלט המודל ---------- */

const DATE = z.string().refine(isValidISODate, "תאריך חייב להיות בפורמט YYYY-MM-DD");

const whereZ = z
  .object({
    ids: z.array(z.string()).optional(),
    space: z.string().optional(),
    status: z.enum(STATUSES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    type: z.enum(TASK_TYPES).optional(),
    overdue: z.boolean().optional(),
    due_on: DATE.optional(),
    due_before: DATE.optional(),
    due_after: DATE.optional(),
    no_due_date: z.boolean().optional(),
    search: z.string().optional(),
    include_completed: z.boolean().optional(),
    all: z.boolean().optional(),
  })
  .strict();
type Where = z.infer<typeof whereZ>;

const changesZ = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    description: z.string().max(10000).optional(),
    priority: z.enum(PRIORITIES).optional(),
    status: z.enum(STATUSES).optional(),
    type: z.enum(TASK_TYPES).optional(),
    due_date: DATE.nullable().optional(),
    space: z.string().optional(),
  })
  .strict();

const addZ = z.object({
  tasks: z
    .array(
      z
        .object({
          title: z.string().trim().min(1).max(300),
          space: z.string().optional(),
          type: z.enum(TASK_TYPES).optional(),
          priority: z.enum(PRIORITIES).optional(),
          status: z.enum(STATUSES).optional(),
          due_date: DATE.optional(),
          description: z.string().max(10000).optional(),
        })
        .strict(),
    )
    .min(1)
    .max(50),
});

/** מסיר null/מחרוזות ריקות משדות המסנן, כי מודלים אוהבים לשלוח null לשדות אופציונליים */
function clean(value: unknown, keepNullKeys: string[] = []): unknown {
  if (Array.isArray(value)) return value.map((v) => clean(v));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === null && !keepNullKeys.includes(k)) continue;
      if (v === "") continue;
      out[k] = k === "changes" ? clean(v, ["due_date"]) : clean(v);
    }
    return out;
  }
  return value;
}

/* ---------- הקשר והרצה ---------- */

export type PendingOp =
  | { tool: "update_tasks"; ids: string[]; patch: TaskUpdateInput; titles: string[] }
  | { tool: "delete_tasks"; ids: string[]; titles: string[] }
  | {
      tool: "add_tasks";
      tasks: { spaceId: string; title: string; type?: Task["type"]; priority?: Task["priority"]; status?: Task["status"]; dueDate?: string; description?: string }[];
      titles: string[];
    };

export interface AgentContext {
  scope: AgentScope;
  today: string;
  spaces: Space[];
  /** true כשמריצים פעולה שכבר אושרה על ידי המשתמש */
  confirmed: boolean;
  pending: PendingOp[];
  mutated: boolean;
}

export function pendingCount(op: PendingOp): number {
  return op.tool === "add_tasks" ? op.tasks.length : op.ids.length;
}

class ToolError extends Error {}

function scopeSpaces(ctx: AgentContext): Space[] {
  if (ctx.scope.type === "space") {
    const id = ctx.scope.spaceId;
    return ctx.spaces.filter((s) => s.id === id);
  }
  return ctx.spaces;
}

function resolveSpace(name: string, ctx: AgentContext): Space {
  const allowed = scopeSpaces(ctx);
  const n = name.trim().toLowerCase();
  const exact = allowed.filter((s) => s.name.trim().toLowerCase() === n);
  if (exact.length === 1) return exact[0];
  const partial = allowed.filter((s) => s.name.toLowerCase().includes(n) || n.includes(s.name.toLowerCase()));
  if (partial.length === 1) return partial[0];
  if (allowed.length === 1 && ctx.scope.type === "space") {
    throw new ToolError(`המרחב "${name}" מחוץ לבחירה הנוכחית. הסוכן פועל רק על "${allowed[0].name}".`);
  }
  const names = allowed.map((s) => `"${s.name}"`).join(", ");
  if (partial.length > 1) throw new ToolError(`השם "${name}" מתאים ליותר ממרחב אחד. המרחבים: ${names}`);
  throw new ToolError(`לא נמצא מרחב בשם "${name}". המרחבים הזמינים: ${names}`);
}

function isOpen(t: Task) {
  return t.status !== "completed";
}

function select(where: Where, ctx: AgentContext, all: Task[], opts: { requireSpecific: boolean }): Task[] {
  const specific =
    where.ids?.length ||
    where.space ||
    where.status ||
    where.priority ||
    where.type ||
    where.overdue !== undefined ||
    where.due_on ||
    where.due_before ||
    where.due_after ||
    where.no_due_date !== undefined ||
    where.search ||
    where.all;
  if (opts.requireSpecific && !specific) {
    throw new ToolError("חסר מסנן. ציין ids, או מסנן אחר, או all=true אם הכוונה לכל המשימות בבחירה.");
  }

  const allowedIds = new Set(scopeSpaces(ctx).map((s) => s.id));
  let list = all.filter((t) => allowedIds.has(t.spaceId));

  if (where.space) {
    const sp = resolveSpace(where.space, ctx);
    list = list.filter((t) => t.spaceId === sp.id);
  }
  if (where.ids?.length) {
    const wanted = new Set(where.ids);
    list = list.filter((t) => wanted.has(t.id));
  }
  if (where.status) list = list.filter((t) => t.status === where.status);
  if (where.priority) list = list.filter((t) => t.priority === where.priority);
  if (where.type) list = list.filter((t) => t.type === where.type);
  if (where.overdue) list = list.filter((t) => isOpen(t) && t.dueDate !== null && t.dueDate < ctx.today);
  if (where.due_on) list = list.filter((t) => t.dueDate === where.due_on);
  if (where.due_before) list = list.filter((t) => t.dueDate !== null && t.dueDate < where.due_before!);
  if (where.due_after) list = list.filter((t) => t.dueDate !== null && t.dueDate > where.due_after!);
  if (where.no_due_date) list = list.filter((t) => t.dueDate === null);
  if (where.search) {
    const q = where.search.toLowerCase();
    list = list.filter((t) => (t.title + " " + t.description).toLowerCase().includes(q));
  }
  const includeCompleted = where.include_completed || where.status === "completed" || !!where.ids?.length;
  if (!includeCompleted) list = list.filter(isOpen);
  return list;
}

function brief(t: Task, ctx: AgentContext) {
  const space = ctx.spaces.find((s) => s.id === t.spaceId);
  return {
    id: t.id,
    space: space?.name ?? "",
    type: t.type,
    title: t.title,
    priority: t.priority,
    status: t.status,
    due_date: t.dueDate,
    overdue: isOpen(t) && t.dueDate !== null && t.dueDate < ctx.today,
    ...(t.description ? { description: t.description.slice(0, 160) } : {}),
  };
}

function sortForAttention(a: Task, b: Task, today: string) {
  const rank = (t: Task) => {
    const overdue = t.dueDate !== null && t.dueDate < today;
    return [overdue ? 0 : 1, t.priority === "urgent" ? 0 : 1, PRIORITY_META[t.priority].rank, t.dueDate ?? "9999-99-99"] as const;
  };
  const ra = rank(a);
  const rb = rank(b);
  for (let i = 0; i < ra.length; i++) {
    if (ra[i] < rb[i]) return -1;
    if (ra[i] > rb[i]) return 1;
  }
  return 0;
}

function describeChanges(patch: TaskUpdateInput, ctx: AgentContext): string {
  const parts: string[] = [];
  if (patch.status) parts.push(`סטטוס ← ${STATUS_META[patch.status].label}`);
  if (patch.priority) parts.push(`עדיפות ← ${PRIORITY_META[patch.priority].label}`);
  if (patch.dueDate !== undefined) parts.push(patch.dueDate ? `תאריך יעד ← ${patch.dueDate}` : "מחיקת תאריך יעד");
  if (patch.type) parts.push(`סוג ← ${TYPE_META[patch.type].label}`);
  if (patch.title) parts.push(`כותרת ← ${patch.title}`);
  if (patch.spaceId) parts.push(`מרחב ← ${ctx.spaces.find((s) => s.id === patch.spaceId)?.name ?? ""}`);
  if (patch.description !== undefined) parts.push("עדכון תיאור");
  return parts.join(", ");
}

/** מבצע בפועל פעולה שאושרה (או שלא דרשה אישור). מחזיר את מספר המשימות שהושפעו. */
export async function applyOp(op: PendingOp): Promise<number> {
  if (op.tool === "add_tasks") {
    for (const t of op.tasks) await createTask(t);
    return op.tasks.length;
  }
  if (op.tool === "delete_tasks") {
    let n = 0;
    for (const id of op.ids) if (await deleteTask(id)) n++;
    return n;
  }
  let n = 0;
  for (const id of op.ids) if (await updateTask(id, op.patch)) n++;
  return n;
}

function needsConfirmation(op: PendingOp): boolean {
  return op.tool === "delete_tasks" || pendingCount(op) > CONFIRM_THRESHOLD;
}

async function commitOrQueue(op: PendingOp, ctx: AgentContext): Promise<Record<string, unknown>> {
  const count = pendingCount(op);
  if (!ctx.confirmed && needsConfirmation(op)) {
    ctx.pending.push(op);
    return {
      status: "pending_user_approval",
      tasks_affected: count,
      note:
        "הפעולה עדיין לא בוצעה. בממשק מוצגים למשתמש כפתורי אישור/ביטול. " +
        `כתוב משפט קצר אחד בעברית: כמה משימות ישתנו (${tasksLabel(count)}) ובקש אישור. אל תקרא שוב לכלי הזה.`,
    };
  }
  const applied = await applyOp(op);
  ctx.mutated = true;
  return { status: "done", tasks_affected: applied };
}

export async function executeTool(name: string, rawArgs: unknown, ctx: AgentContext): Promise<Record<string, unknown>> {
  try {
    const args = (clean(rawArgs) ?? {}) as Record<string, unknown>;
    switch (name) {
      case "read_tasks": {
        const where = whereZ.parse(args.where ?? {});
        const limit = Math.min(Math.max(Number(args.limit) || 60, 1), 150);
        const tasks = select(where, ctx, await listTasks(), { requireSpecific: false });
        tasks.sort((a, b) => sortForAttention(a, b, ctx.today));
        return {
          total_matching: tasks.length,
          returned: Math.min(tasks.length, limit),
          tasks: tasks.slice(0, limit).map((t) => brief(t, ctx)),
        };
      }

      case "add_tasks": {
        const { tasks } = addZ.parse(args);
        const allowed = scopeSpaces(ctx);
        if (allowed.length === 0) throw new ToolError("אין מרחבים. יש ליצור מרחב לפני הוספת משימות.");
        const items = tasks.map((t) => {
          let space: Space;
          if (t.space) space = resolveSpace(t.space, ctx);
          else if (allowed.length === 1) space = allowed[0];
          else
            throw new ToolError(
              `חסר מרחב למשימה "${t.title}". שאל את המשתמש לאיזה מרחב להוסיף. המרחבים: ${allowed.map((s) => `"${s.name}"`).join(", ")}`,
            );
          return {
            spaceId: space.id,
            title: t.title,
            type: t.type,
            priority: t.priority,
            status: t.status,
            dueDate: t.due_date,
            description: t.description,
          };
        });
        const result = await commitOrQueue({ tool: "add_tasks", tasks: items, titles: items.map((i) => i.title) }, ctx);
        return result;
      }

      case "update_tasks": {
        const where = whereZ.parse(args.where ?? {});
        const changes = changesZ.parse(args.changes ?? {});
        const patch: TaskUpdateInput = {};
        if (changes.title !== undefined) patch.title = changes.title;
        if (changes.description !== undefined) patch.description = changes.description;
        if (changes.priority) patch.priority = changes.priority;
        if (changes.status) patch.status = changes.status;
        if (changes.type) patch.type = changes.type;
        if (changes.due_date !== undefined) patch.dueDate = changes.due_date;
        if (changes.space) patch.spaceId = resolveSpace(changes.space, ctx).id;
        if (Object.keys(patch).length === 0) throw new ToolError("לא צוינו שינויים ב-changes.");

        const targets = select(where, ctx, await listTasks(), { requireSpecific: true });
        const toChange = targets.filter((t) =>
          (Object.keys(patch) as (keyof TaskUpdateInput)[]).some((k) => (t as unknown as Record<string, unknown>)[k] !== patch[k]),
        );
        if (targets.length === 0) return { status: "no_match", tasks_affected: 0, note: "לא נמצאו משימות שמתאימות למסנן." };
        if (toChange.length === 0) return { status: "no_change", tasks_affected: 0, note: "המשימות שנבחרו כבר במצב המבוקש." };
        return await commitOrQueue(
          { tool: "update_tasks", ids: toChange.map((t) => t.id), patch, titles: toChange.map((t) => t.title) },
          ctx,
        );
      }

      case "delete_tasks": {
        const where = whereZ.parse(args.where ?? {});
        const targets = select(where, ctx, await listTasks(), { requireSpecific: true });
        if (targets.length === 0) return { status: "no_match", tasks_affected: 0, note: "לא נמצאו משימות שמתאימות למסנן." };
        return await commitOrQueue(
          { tool: "delete_tasks", ids: targets.map((t) => t.id), titles: targets.map((t) => t.title) },
          ctx,
        );
      }

      case "summarize_tasks": {
        const where = whereZ.parse(args.where ?? {});
        const base = select({ ...where, include_completed: true }, ctx, await listTasks(), { requireSpecific: false });
        const open = base.filter(isOpen);
        const weekStart = startOfWeek(ctx.today);
        const weekEnd = addDays(weekStart, 6);
        const inDays = addDays(ctx.today, 7);
        const completedThisWeek = base.filter(
          (t) => t.completedAt && t.completedAt.slice(0, 10) >= weekStart && t.completedAt.slice(0, 10) <= weekEnd,
        );
        const bySpace = scopeSpaces(ctx).map((s) => {
          const mine = base.filter((t) => t.spaceId === s.id);
          const o = mine.filter(isOpen);
          return {
            space: s.name,
            open: o.length,
            overdue: o.filter((t) => t.dueDate !== null && t.dueDate < ctx.today).length,
            completed: mine.length - o.length,
          };
        });
        const countBy = <K extends string>(keys: readonly K[], pick: (t: Task) => K) =>
          Object.fromEntries(keys.map((k) => [k, open.filter((t) => pick(t) === k).length]));
        return {
          today: ctx.today,
          total: base.length,
          open: open.length,
          completed: base.length - open.length,
          completed_this_week: completedThisWeek.length,
          overdue: open.filter((t) => t.dueDate !== null && t.dueDate < ctx.today).length,
          due_today: open.filter((t) => t.dueDate === ctx.today).length,
          due_next_7_days: open.filter((t) => t.dueDate !== null && t.dueDate >= ctx.today && t.dueDate <= inDays).length,
          no_due_date: open.filter((t) => t.dueDate === null).length,
          open_by_priority: countBy(PRIORITIES, (t) => t.priority),
          open_by_status: countBy(STATUSES, (t) => t.status),
          by_space: bySpace,
          needs_attention: open
            .filter((t) => t.priority !== "irrelevant")
            .sort((a, b) => sortForAttention(a, b, ctx.today))
            .slice(0, 8)
            .map((t) => brief(t, ctx)),
        };
      }

      default:
        throw new ToolError(`כלי לא מוכר: ${name}`);
    }
  } catch (err) {
    if (err instanceof ToolError) return { status: "error", error: err.message };
    if (err instanceof z.ZodError) {
      return { status: "error", error: "קלט לא תקין: " + err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
    }
    console.error("[agent tool]", name, err);
    return { status: "error", error: "שגיאה פנימית בהרצת הכלי." };
  }
}

/** תיאור קריא של פעולות ממתינות, לכרטיס האישור */
export function describePending(ops: PendingOp[], ctx: AgentContext) {
  const count = ops.reduce((n, o) => n + pendingCount(o), 0);
  const kind: "add" | "update" | "delete" = ops.some((o) => o.tool === "delete_tasks")
    ? "delete"
    : ops.every((o) => o.tool === "add_tasks")
      ? "add"
      : "update";
  const lines = ops.map((o) => {
    const n = pendingCount(o);
    if (o.tool === "delete_tasks") return `מחיקת ${tasksLabel(n)}`;
    if (o.tool === "add_tasks") return `הוספת ${tasksLabel(n)}`;
    return `עדכון ${tasksLabel(n)}: ${describeChanges(o.patch, ctx)}`;
  });
  const sample = ops.flatMap((o) => o.titles).slice(0, 5);
  return { count, kind, summary: lines.join(" · "), sample };
}
