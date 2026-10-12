import OpenAI from "openai";
import { formatDayLong, todayISO } from "../dates";
import { query } from "../db";
import { tasksLabel } from "../plural";
import { listSpaces } from "../repo";
import type { AgentScope, PendingAction, Space } from "../types";
import {
  TOOL_DEFINITIONS,
  applyOp,
  describePending,
  executeTool,
  pendingCount,
  type AgentContext,
  type PendingOp,
} from "./tools";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export type AgentEvent =
  | { type: "status"; text: string }
  | { type: "mutated" }
  | { type: "done"; reply: string; pending: PendingAction | null }
  | { type: "error"; message: string };

const MAX_STEPS = 8;
const PENDING_TTL_MINUTES = 60;

const TOOL_STATUS: Record<string, string> = {
  read_tasks: "קורא משימות…",
  add_tasks: "מוסיף משימות…",
  update_tasks: "מעדכן משימות…",
  delete_tasks: "מכין מחיקה…",
  summarize_tasks: "מסכם משימות…",
};

export function getModel(): string {
  const raw = (process.env.OPENAI_MODEL || "gpt-6-luna").trim();
  // "openai/gpt-6-luna" הוא פורמט של שערי AI. מול OpenAI ישירות שם המודל הוא בלי התחילית.
  return process.env.OPENAI_BASE_URL ? raw : raw.replace(/^openai\//, "");
}

function buildSystemPrompt(ctx: AgentContext): string {
  const scopeSpaces =
    ctx.scope.type === "space"
      ? ctx.spaces.filter((s) => s.id === (ctx.scope as { spaceId: string }).spaceId)
      : ctx.spaces;
  const scopeLine =
    ctx.scope.type === "space"
      ? `המשתמש נמצא כעת במרחב "${scopeSpaces[0]?.name}". אתה רואה ופועל רק על המשימות של המרחב הזה.`
      : `הבחירה הנוכחית: כל המרחבים (${scopeSpaces.map((s) => `"${s.name}"`).join(", ") || "אין מרחבים"}).`;

  return `אתה "העוזר החכם" של מערכת ניהול משימות אישית בעברית, ומנהל את המשימות של המשתמש דרך כלים.

הקשר:
- היום: ${formatDayLong(ctx.today)} (${ctx.today}).
- ${scopeLine}
- כל הכלים פועלים אך ורק על הבחירה הנוכחית. אל תנסה לגעת במשימות מחוץ לה.

כללים:
1. ענה תמיד בעברית, קצר וענייני: משפט או שניים, ואם צריך רשימה קצרה. בלי הקדמות ובלי סיכום חוזר.
2. לפני כל תשובה על תוכן המשימות, קרא אותן בעזרת הכלים. אל תנחש ואל תמציא משימות.
3. בקשת פעולה = בצע אותה בכלי המתאים, בלי לשאול "האם לבצע?". את אישור המשתמש לפעולות רחבות או למחיקה המערכת מבקשת בעצמה.
4. כשכלי מחזיר pending_user_approval, הפעולה לא בוצעה. אמור בקצרה כמה משימות ישתנו וביקש אישור בכפתורים. אל תנסה לבצע שוב.
5. לפעולות על קבוצה (למשל "כל מה שבאיחור") השתמש במסנן (where) בקריאה אחת, ולא בעשרות קריאות.
6. תאריכים: המר ביטויים יחסיים ל-YYYY-MM-DD לפי התאריך של היום. "מחר" = היום + 1. "עד ה-10" = ה-10 הקרוב בחודש (בחודש הנוכחי אם טרם עבר, אחרת בבא). "ביום ראשון" = הראשון הקרוב.
7. כשמוסיפים משימה בלי עדיפות, העדיפות היא בינונית. "אירוע" ו"פגישה" הם type=event, והשאר type=task.
8. כשהבחירה היא כל המרחבים ולא ברור לאיזה מרחב להוסיף משימה, שאל שאלה אחת קצרה. כשהבחירה היא מרחב אחד, הוסף אליו.
9. אחרי פעולה, אמור מה עשית במספרים ("עדכנתי 4 משימות להושלמה"). מקסימום שני משפטים.
10. עדיפויות בעברית: דחוף, גבוהה, בינונית, נמוכה, לא רלוונטי. סטטוסים: חדשה, בעבודה, בהשהייה, הושלמה. תמיד כתוב אותם בעברית ולא בקודים באנגלית.
11. שאלות המלצה ("מה הכי חשוב?"): קרא משימות, וענה עם 3-5 משימות לפי דחיפות, איחור ותאריך, עם משפט הנמקה קצר. אל תשנה כלום אם לא התבקשת.
12. אם הבקשה לא קשורה לניהול המשימות, אמור בקצרה שאתה כאן כדי לעזור עם המשימות.`;
}

async function savePending(ops: PendingOp[], scope: AgentScope, ctx: AgentContext): Promise<PendingAction> {
  const d = describePending(ops, ctx);
  const rows = await query<{ id: string }>(
    `INSERT INTO agent_pending (scope, ops, kind, count, summary, sample)
     VALUES ($1::jsonb, $2::jsonb, $3, $4, $5, $6::jsonb) RETURNING id`,
    [JSON.stringify(scope), JSON.stringify(ops), d.kind, d.count, d.summary, JSON.stringify(d.sample)],
  );
  return { id: rows[0].id, kind: d.kind, count: d.count, summary: d.summary, sample: d.sample };
}

export async function runAgent(opts: {
  history: ChatTurn[];
  scope: AgentScope;
  emit: (e: AgentEvent) => void;
}): Promise<void> {
  const { emit } = opts;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    emit({ type: "error", message: "הסוכן לא מחובר עדיין: חסר מפתח OPENAI_API_KEY בהגדרות השרת." });
    return;
  }

  const spaces: Space[] = await listSpaces();
  if (opts.scope.type === "space" && !spaces.some((s) => s.id === (opts.scope as { spaceId: string }).spaceId)) {
    emit({ type: "error", message: "המרחב שנבחר לא קיים יותר. בחר מרחב אחר." });
    return;
  }

  const ctx: AgentContext = {
    scope: opts.scope,
    today: todayISO(),
    spaces,
    confirmed: false,
    pending: [],
    mutated: false,
  };

  const client = new OpenAI({ apiKey, baseURL: process.env.OPENAI_BASE_URL || undefined, timeout: 50_000, maxRetries: 1 });
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: buildSystemPrompt(ctx) },
    ...opts.history.slice(-20).map((m) => ({ role: m.role, content: m.content }) as OpenAI.Chat.Completions.ChatCompletionMessageParam),
  ];

  let reply = "";
  for (let step = 0; step < MAX_STEPS; step++) {
    const completion = await client.chat.completions.create({
      model: getModel(),
      messages,
      tools: TOOL_DEFINITIONS,
      tool_choice: "auto",
    });
    const msg = completion.choices[0]?.message;
    if (!msg) break;
    messages.push(msg);

    const calls = (msg.tool_calls ?? []).filter((c) => c.type === "function");
    if (calls.length === 0) {
      reply = (msg.content ?? "").trim();
      break;
    }

    for (const call of calls) {
      emit({ type: "status", text: TOOL_STATUS[call.function.name] ?? "עובד על זה…" });
      let args: unknown = {};
      try {
        args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
      } catch {
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ status: "error", error: "ארגומנטים אינם JSON תקין" }) });
        continue;
      }
      const before = ctx.mutated;
      const result = await executeTool(call.function.name, args, ctx);
      if (ctx.mutated && !before) emit({ type: "mutated" });
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }

  let pending: PendingAction | null = null;
  if (ctx.pending.length > 0) {
    pending = await savePending(ctx.pending, opts.scope, ctx);
    if (!reply) reply = `לפני שאבצע: ${tasksLabel(pending.count)} ישתנו. לאשר?`;
  }
  if (!reply) reply = ctx.mutated ? "בוצע." : "לא הצלחתי להשלים את הבקשה. נסה לנסח אותה מחדש.";
  emit({ type: "done", reply, pending });
}

/** מבצע פעולה ממתינה לאחר אישור המשתמש (או מבטל אותה) */
export async function resolvePending(id: string, approve: boolean): Promise<{ ok: boolean; message: string; mutated: boolean }> {
  const rows = await query<{ ops: PendingOp[]; kind: string; count: number; created_at: Date }>(
    `UPDATE agent_pending SET status = $2
     WHERE id = $1 AND status = 'pending'
     RETURNING ops, kind, count, created_at`,
    [id, approve ? "approved" : "rejected"],
  );
  const row = rows[0];
  if (!row) return { ok: false, message: "הפעולה כבר טופלה או שפג תוקפה.", mutated: false };
  if (!approve) return { ok: true, message: "ביטלתי. לא שיניתי כלום.", mutated: false };

  const ageMin = (Date.now() - new Date(row.created_at).getTime()) / 60000;
  if (ageMin > PENDING_TTL_MINUTES) {
    await query("UPDATE agent_pending SET status = 'expired' WHERE id = $1", [id]);
    return { ok: false, message: "פג תוקף האישור. בקש מהסוכן שוב.", mutated: false };
  }

  let done = 0;
  for (const op of row.ops) done += await applyOp(op);
  const skipped = row.ops.reduce((n, o) => n + pendingCount(o), 0) - done;
  const verb = row.kind === "delete" ? "נמחקו" : row.kind === "add" ? "נוספו" : "עודכנו";
  const message = `בוצע: ${verb} ${tasksLabel(done)}.` + (skipped > 0 ? ` (${skipped} כבר לא קיימות.)` : "");
  return { ok: true, message, mutated: true };
}
