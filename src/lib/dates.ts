import { DEFAULT_TIMEZONE } from "./constants";

// כל חישובי התאריכים מבוססים על מחרוזות YYYY-MM-DD ועל אזור הזמן של ישראל,
// כך שהשרת (UTC) והדפדפן מסכימים מהו "היום".

export function toISODate(d: Date, timeZone: string = DEFAULT_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

function parse(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function format(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, n: number): string {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return format(d);
}

export function addMonths(iso: string, n: number): string {
  const d = parse(iso);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  return format(d);
}

/** 0 = ראשון ... 6 = שבת */
export function weekday(iso: string): number {
  return parse(iso).getUTCDay();
}

export function startOfWeek(iso: string): string {
  return addDays(iso, -weekday(iso));
}

export function startOfMonth(iso: string): string {
  return iso.slice(0, 8) + "01";
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);
}

export function isValidISODate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return format(parse(s)) === s;
}

/** רשת חודש מלאה (שבועות שלמים, ראשון עד שבת) */
export function monthGrid(anchorISO: string): string[] {
  const first = startOfMonth(anchorISO);
  const start = startOfWeek(first);
  const lastDay = addDays(addMonths(first, 1), -1);
  const end = addDays(startOfWeek(lastDay), 6);
  const days: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return days;
}

const HE = "he-IL";
const TZ = "UTC";

export function formatMonthTitle(iso: string): string {
  return new Intl.DateTimeFormat(HE, { month: "long", year: "numeric", timeZone: TZ }).format(parse(iso));
}

export function formatDayLong(iso: string): string {
  return new Intl.DateTimeFormat(HE, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: TZ,
  }).format(parse(iso));
}

export function formatDayShort(iso: string): string {
  return new Intl.DateTimeFormat(HE, { day: "numeric", month: "short", timeZone: TZ }).format(parse(iso));
}

export function formatWeekdayName(iso: string): string {
  return new Intl.DateTimeFormat(HE, { weekday: "long", timeZone: TZ }).format(parse(iso));
}

export function formatMonthName(iso: string): string {
  return new Intl.DateTimeFormat(HE, { month: "long", timeZone: TZ }).format(parse(iso));
}

export function dayOfMonth(iso: string): number {
  return Number(iso.slice(8, 10));
}

/** תיאור יחסי קצר: היום / מחר / אתמול / לפני 3 ימים / בעוד 4 ימים / תאריך */
export function relativeDue(iso: string, today: string): string {
  const diff = daysBetween(today, iso);
  if (diff === 0) return "היום";
  if (diff === 1) return "מחר";
  if (diff === -1) return "אתמול";
  if (diff < 0 && diff >= -14) return `לפני ${-diff} ימים`;
  if (diff > 1 && diff <= 6) return `בעוד ${diff} ימים`;
  return formatDayShort(iso);
}
