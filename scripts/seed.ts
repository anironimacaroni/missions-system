// מכניס נתוני דוגמה: שלושה מרחבים וכ-17 משימות. ירוץ רק אם אין עדיין מרחבים.
// שימוש: npm run seed   (נדרש DATABASE_URL בסביבה או בקובץ .env)

import { closePool, ensureSchema, query } from "../src/lib/db";
import { addDays, todayISO } from "../src/lib/dates";
import { createSpace, createTask, listSpaces } from "../src/lib/repo";
import type { Priority, Status, TaskType, View } from "../src/lib/constants";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile?.(file);
  } catch {
    // אין קובץ כזה: משתמשים במשתני הסביבה הקיימים
  }
}

interface SeedTask {
  title: string;
  priority: Priority;
  status?: Status;
  type?: TaskType;
  /** הזזה בימים מהיום. undefined = בלי תאריך יעד */
  offset?: number;
  description?: string;
}

interface SeedSpace {
  name: string;
  color: string;
  view: View;
  tasks: SeedTask[];
}

const SPACES: SeedSpace[] = [
  {
    name: "בית",
    color: "#2FA566",
    view: "todo",
    tasks: [
      { title: "לשלם ארנונה", priority: "urgent", offset: 2, description: "התשלום עד סוף השבוע, דרך האתר של העירייה." },
      { title: "לקנות חלב וביצים", priority: "high", offset: 0 },
      { title: "להתקשר לסבתא", priority: "medium", offset: 1, description: "לשאול גם מה שלומה אחרי הבדיקות." },
      { title: "לתקן את הברז במטבח", priority: "medium", status: "working", offset: -2 },
      { title: "לתאם טיפול שנתי לרכב", priority: "low", status: "paused", offset: 9 },
      { title: "לסדר את המחסן", priority: "irrelevant" },
    ],
  },
  {
    name: "עבודה",
    color: "#3B7BEA",
    view: "kanban",
    tasks: [
      { title: "להגיש הצעת מחיר ללקוח", priority: "urgent", status: "working", offset: 0, description: "כולל פירוט שלבים ולוח זמנים." },
      { title: "פגישת צוות שבועית", priority: "high", type: "event", offset: 1 },
      { title: "לסכם את דוח הרבעון", priority: "high", offset: 4 },
      { title: "לענות למיילים שהצטברו", priority: "medium", status: "working", offset: -1 },
      { title: "לעדכן את אתר החברה", priority: "low", status: "paused", offset: 12 },
      { title: "לשלוח חשבונית ללקוח", priority: "medium", status: "completed", offset: -3 },
    ],
  },
  {
    name: "לימודים",
    color: "#7C5CFC",
    view: "calendar",
    tasks: [
      { title: "להגיש עבודה בסטטיסטיקה", priority: "urgent", status: "working", offset: 2 },
      { title: "שיעור חזרה עם קבוצת הלימוד", priority: "medium", type: "event", offset: 2 },
      { title: "מבחן באלגברה", priority: "high", type: "event", offset: 8 },
      { title: "לקרוא פרקים 4-5 בספר", priority: "medium", offset: 3 },
      { title: "לרכוש את הספר לקורס", priority: "low", offset: -1 },
      { title: "לסכם את הרצאה 3", priority: "medium", status: "completed", offset: -2 },
    ],
  },
];

async function main() {
  await ensureSchema();
  const existing = await listSpaces();
  if (existing.length > 0) {
    console.log(`כבר קיימים ${existing.length} מרחבים. לא נוסף דבר.`);
    return;
  }
  const today = todayISO();
  let tasks = 0;
  for (const s of SPACES) {
    const space = await createSpace({ name: s.name, color: s.color, view: s.view });
    // מוסיפים בסדר הפוך כדי שהמשימה הראשונה תהיה בראש העמודה
    for (const t of [...s.tasks].reverse()) {
      await createTask({
        spaceId: space.id,
        title: t.title,
        priority: t.priority,
        status: t.status ?? "new",
        type: t.type ?? "task",
        description: t.description ?? "",
        dueDate: t.offset === undefined ? null : addDays(today, t.offset),
      });
      tasks++;
    }
  }
  const [{ n }] = await query<{ n: string }>("SELECT count(*)::text AS n FROM tasks");
  console.log(`נוצרו ${SPACES.length} מרחבים ו-${tasks} משימות (סה"כ במסד: ${n}).`);
}

main()
  .catch((err) => {
    console.error("הזרעת הנתונים נכשלה:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closePool());
