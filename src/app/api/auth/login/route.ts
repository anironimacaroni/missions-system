import { z } from "zod";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_MAX_AGE, createSessionToken, passwordMatches } from "@/lib/auth";
import { query } from "@/lib/db";
import { fail, guard, readJson } from "@/lib/http";

export const dynamic = "force-dynamic";

const MAX_FAILURES = 8;
const WINDOW_MINUTES = 10;

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] || req.headers.get("x-real-ip") || "unknown").trim();
}

export function POST(req: Request) {
  return guard(async () => {
    if (!process.env.APP_PASSWORD) {
      return fail(503, "לא הוגדרה סיסמה למערכת (APP_PASSWORD).");
    }
    const { data, error } = await readJson(req, z.object({ password: z.string().max(200) }));
    if (error) return error;

    const ip = clientIp(req);
    let limited = false;
    try {
      const rows = await query<{ n: string }>(
        `SELECT count(*)::text AS n FROM login_attempts WHERE ip = $1 AND at > now() - ($2 || ' minutes')::interval`,
        [ip, String(WINDOW_MINUTES)],
      );
      limited = Number(rows[0]?.n ?? 0) >= MAX_FAILURES;
    } catch {
      // אם מסד הנתונים לא זמין, לא חוסמים את הכניסה בגלל הגבלת הקצב
    }
    if (limited) return fail(429, "יותר מדי ניסיונות. נסה שוב בעוד כמה דקות.");

    if (!(await passwordMatches(data.password))) {
      try {
        await query("INSERT INTO login_attempts (ip) VALUES ($1)", [ip]);
      } catch {}
      await new Promise((r) => setTimeout(r, 400));
      return fail(401, "הסיסמה שגויה");
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, await createSessionToken(), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
    return res;
  });
}
