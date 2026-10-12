// אימות בסיסמה אחת. העוגייה חתומה ב-HMAC, כך שאפשר לאמת אותה גם ב-proxy וגם בנתיבי API.

export const SESSION_COOKIE = "mrchv_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 יום

function secret(): string {
  return process.env.AUTH_SECRET || process.env.APP_PASSWORD || "";
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE;
  return `${exp}.${await sign(String(exp))}`;
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token || !secret()) return false;
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!sig || !Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  return safeEqual(sig, await sign(expStr));
}

export async function passwordMatches(input: string): Promise<boolean> {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  // השוואה בזמן קבוע, דרך גיבוב של שני הצדדים
  const [a, b] = await Promise.all([sign("pw:" + input), sign("pw:" + expected)]);
  return safeEqual(a, b);
}
