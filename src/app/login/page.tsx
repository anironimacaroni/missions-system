"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.replace("/");
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error || "הכניסה נכשלה. נסו שוב.");
    } catch {
      setError("אין חיבור לשרת. בדקו את האינטרנט ונסו שוב.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <span className="mb-5 grid h-14 w-14 grid-cols-2 gap-[5px] rounded-2xl bg-brand p-[11px]" aria-hidden>
            <span className="rounded-[5px] bg-[#E5604D]" />
            <span className="rounded-[5px] bg-[#EE9B2F]" />
            <span className="rounded-[5px] bg-[#2FA566]" />
            <span className="rounded-[5px] bg-[#7C5CFC]" />
          </span>
          <h1 className="font-display text-4xl font-black">מרחב</h1>
          <p className="mt-1.5 text-muted">המשימות שלך, בכל המרחבים, במקום אחד.</p>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <label htmlFor="password" className="mb-2 block text-sm font-medium text-muted">
            סיסמה
          </label>
          <div className="relative">
            <Lock size={17} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              id="password"
              type="password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? "login-error" : undefined}
              className="h-12 w-full rounded-xl border border-line bg-surface ps-10 pe-3 text-[16px] focus:border-focus focus:outline-none"
            />
          </div>
          {error && (
            <p id="login-error" role="alert" className="mt-2 text-sm font-medium text-[#c0293a]">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={!password || busy}
            className="mt-4 h-12 w-full rounded-xl bg-brand text-[16px] font-semibold text-white transition-colors hover:bg-brand-hover disabled:opacity-50"
          >
            {busy ? "נכנס…" : "כניסה"}
          </button>
        </div>
      </form>
    </main>
  );
}
