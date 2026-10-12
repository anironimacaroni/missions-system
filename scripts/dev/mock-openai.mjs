// שרת OpenAI מדומה לבדיקות מקומיות בלבד (בלי מפתח אמיתי).
// מממש POST /v1/chat/completions עם תסריטים פשוטים לפי מילות מפתח.
// הרצה: node scripts/dev/mock-openai.mjs   ואז OPENAI_BASE_URL=http://127.0.0.1:5599/v1

import http from "node:http";

const PORT = Number(process.env.MOCK_PORT || 5599);

function addDaysISO(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

function reply(message) {
  return {
    id: "chatcmpl-mock",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: "mock",
    choices: [{ index: 0, finish_reason: message.tool_calls ? "tool_calls" : "stop", message }],
  };
}

function toolCall(name, args) {
  return {
    role: "assistant",
    content: null,
    tool_calls: [
      { id: "call_" + Math.random().toString(36).slice(2, 8), type: "function", function: { name, arguments: JSON.stringify(args) } },
    ],
  };
}

function handle(body) {
  const msgs = body.messages ?? [];
  const system = msgs.find((m) => m.role === "system")?.content ?? "";
  const today = (system.match(/\((\d{4}-\d{2}-\d{2})\)/) ?? [])[1] ?? "2026-01-01";
  const last = msgs[msgs.length - 1];

  if (last?.role === "tool") {
    let data = {};
    try {
      data = JSON.parse(last.content);
    } catch {}
    if (data.status === "pending_user_approval")
      return reply({ role: "assistant", content: `לפני שאבצע: ${data.tasks_affected} משימות ישתנו. לאשר?` });
    if (data.status === "done") return reply({ role: "assistant", content: `בוצע. ${data.tasks_affected} משימות הושפעו.` });
    if (data.status === "error") return reply({ role: "assistant", content: `לא הצלחתי: ${data.error}` });
    if (data.status === "no_match" || data.status === "no_change") return reply({ role: "assistant", content: data.note });
    if (Array.isArray(data.tasks)) {
      const top = data.tasks.slice(0, 3).map((t) => `- ${t.title} (${t.space})`).join("\n");
      return reply({ role: "assistant", content: `נמצאו ${data.total_matching} משימות פתוחות. הכי חשובות:\n${top}` });
    }
    if (typeof data.open === "number")
      return reply({ role: "assistant", content: `פתוחות: ${data.open}, באיחור: ${data.overdue}, להיום: ${data.due_today}.` });
    return reply({ role: "assistant", content: "בוצע." });
  }

  const text = String(last?.content ?? "");
  if (/תוסיף|הוסף/.test(text)) {
    const tasks = [
      { title: "לקנות חלב" },
      { title: "להתקשר לסבתא", due_date: addDaysISO(today, 1) },
      { title: "לשלם ארנונה", due_date: addDaysISO(today, 3), priority: "high" },
    ];
    if (/ארבע|4 משימות/.test(text)) tasks.push({ title: "משימה רביעית" });
    // בבחירה של כל המרחבים חייבים לציין מרחב
    if (/בית/.test(text)) tasks.forEach((t) => (t.space = "בית"));
    return reply(toolCall("add_tasks", { tasks }));
  }
  if (/מחק/.test(text)) return reply(toolCall("delete_tasks", { where: { status: "completed" } }));
  if (/הושלם|הושלמה/.test(text)) return reply(toolCall("update_tasks", { where: { all: true }, changes: { status: "completed" } }));
  if (/דחה|תדחה/.test(text))
    return reply(toolCall("update_tasks", { where: { overdue: true }, changes: { due_date: addDaysISO(today, 1) } }));
  if (/סכם|תסכם/.test(text)) return reply(toolCall("summarize_tasks", {}));
  return reply(toolCall("read_tasks", { where: {} }));
}

http
  .createServer((req, res) => {
    if (req.method === "POST" && req.url?.endsWith("/chat/completions")) {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        try {
          const out = handle(JSON.parse(raw));
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(out));
        } catch (e) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: { message: String(e) } }));
        }
      });
      return;
    }
    res.writeHead(404);
    res.end();
  })
  .listen(PORT, "127.0.0.1", () => console.log(`mock openai on :${PORT}`));
