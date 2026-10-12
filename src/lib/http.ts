import { NextResponse } from "next/server";
import type { z } from "zod";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

export async function readJson<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<{ data: z.infer<S>; error?: undefined } | { data?: undefined; error: Response }> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { error: fail(400, "גוף הבקשה אינו JSON תקין") };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { error: fail(400, first?.message || "נתונים לא תקינים") };
  }
  return { data: parsed.data };
}

/** עוטף נתיב API: שגיאות לא צפויות חוזרות כ-500 בעברית, בלי לחשוף פרטים */
export function guard(handler: () => Promise<Response>): Promise<Response> {
  return handler().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[api]", msg);
    if (/DATABASE_URL/.test(msg)) return fail(503, "מסד הנתונים לא מוגדר. הוסף DATABASE_URL.");
    return fail(500, "שגיאה בשרת. נסה שוב.");
  });
}
