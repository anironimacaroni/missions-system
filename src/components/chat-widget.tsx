"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  ArrowUp,
  Check,
  ChevronDown,
  Globe,
  RotateCcw,
  ShieldQuestion,
  Sparkles,
  X,
} from "lucide-react";
import type { AgentScope, PendingAction } from "@/lib/types";
import { api } from "@/lib/client-api";
import { tasksLabel } from "@/lib/plural";
import { useData } from "./data-provider";
import { IconButton, cx } from "./ui";

/* ---------- מצב משותף (פתוח/סגור) ---------- */

interface ChatShell {
  open: boolean;
  setOpen: (v: boolean) => void;
}
const ShellCtx = createContext<ChatShell | null>(null);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const v = useMemo(() => ({ open, setOpen }), [open]);
  return <ShellCtx.Provider value={v}>{children}</ShellCtx.Provider>;
}

export function useChatShell(): ChatShell {
  const v = useContext(ShellCtx);
  if (!v) throw new Error("useChatShell חייב לפעול בתוך ChatProvider");
  return v;
}

/* ---------- סוגי הודעות ---------- */

type PendingState = "waiting" | "working" | "approved" | "rejected" | "failed";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "note";
  content: string;
  error?: boolean;
  pending?: PendingAction & { state: PendingState; resultNote?: string };
}

const STORAGE_KEY = "mrchv_chat_v1";
let seq = 0;
const uid = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`;

function loadMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMessage[];
    // כרטיסי אישור שנשארו באמצע פעולה לא חוזרים לחיים אחרי רענון
    return parsed.map((m) =>
      m.pending && (m.pending.state === "working" || m.pending.state === "waiting")
        ? { ...m, pending: { ...m.pending, state: "waiting" as PendingState } }
        : m,
    );
  } catch {
    return [];
  }
}

function saveMessages(messages: ChatMessage[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40)));
  } catch {}
}

/* ---------- רכיב הצ'אט ---------- */

export function ChatWidget() {
  const { open, setOpen } = useChatShell();
  const { spaces, refresh, notify } = useData();
  const pathname = usePathname();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [override, setOverride] = useState<AgentScope | null>(null);
  const [scopeMenu, setScopeMenu] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastScopeKey = useRef<string | null>(null);

  // בחירה אוטומטית: בתוך מרחב = המרחב, אחרת כל המרחבים
  const autoScope = useMemo<AgentScope>(() => {
    const m = pathname.match(/^\/spaces\/([^/]+)/);
    if (m && spaces.some((s) => s.id === m[1])) return { type: "space", spaceId: m[1] };
    return { type: "all" };
  }, [pathname, spaces]);

  useEffect(() => {
    setOverride(null);
    setScopeMenu(false);
  }, [pathname]);

  const scope = override ?? autoScope;
  const scopeSpace = scope.type === "space" ? spaces.find((s) => s.id === scope.spaceId) : undefined;
  const scopeLabel = scopeSpace ? scopeSpace.name : "כל המרחבים";
  const scopeKey = scope.type === "space" ? scope.spaceId : "all";

  useEffect(() => {
    setMessages(loadMessages());
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (hydrated) saveMessages(messages);
  }, [messages, hydrated]);

  // מסמן בשיחה מתי הבחירה השתנתה, כדי שיהיה ברור על מה כל תשובה
  useEffect(() => {
    if (!hydrated || !open) return;
    if (lastScopeKey.current !== null && lastScopeKey.current !== scopeKey && messages.length > 0) {
      setMessages((m) => [...m, { id: uid(), role: "note", content: `עכשיו עובד על: ${scopeLabel}` }]);
    }
    lastScopeKey.current = scopeKey;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeKey, hydrated, open]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, sending, open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  const autoGrow = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }, []);

  async function send(text: string) {
    const content = text.trim();
    if (!content || sending) return;
    setInput("");
    requestAnimationFrame(autoGrow);

    const userMsg: ChatMessage = { id: uid(), role: "user", content };
    const history = [...messages, userMsg]
      .filter((m) => (m.role === "user" || m.role === "assistant") && !m.error)
      .slice(-20)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
    setMessages((m) => [...m, userMsg]);
    setSending(true);
    setStatusText("חושב…");

    let mutated = false;
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, scope }),
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!res.ok || !res.body) {
        let msg = "הסוכן לא זמין כרגע.";
        try {
          msg = ((await res.json()) as { error?: string }).error || msg;
        } catch {}
        throw new Error(msg);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;

      const handle = (line: string) => {
        if (!line.trim()) return;
        const ev = JSON.parse(line) as
          | { type: "status"; text: string }
          | { type: "mutated" }
          | { type: "done"; reply: string; pending: PendingAction | null }
          | { type: "error"; message: string };
        if (ev.type === "status") setStatusText(ev.text);
        else if (ev.type === "mutated") {
          mutated = true;
          void refresh();
        } else if (ev.type === "done") {
          finished = true;
          setMessages((m) => [
            ...m,
            {
              id: uid(),
              role: "assistant",
              content: ev.reply,
              pending: ev.pending ? { ...ev.pending, state: "waiting" } : undefined,
            },
          ]);
        } else if (ev.type === "error") {
          finished = true;
          setMessages((m) => [...m, { id: uid(), role: "assistant", content: ev.message, error: true }]);
        }
      };

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          handle(buffer.slice(0, nl));
          buffer = buffer.slice(nl + 1);
        }
      }
      if (buffer.trim()) handle(buffer);
      if (!finished) {
        setMessages((m) => [
          ...m,
          { id: uid(), role: "assistant", content: "החיבור לסוכן נותק לפני שסיים. נסה שוב.", error: true },
        ]);
      }
    } catch (e) {
      setMessages((m) => [
        ...m,
        { id: uid(), role: "assistant", content: e instanceof Error ? e.message : "משהו השתבש. נסה שוב.", error: true },
      ]);
    } finally {
      setSending(false);
      setStatusText("");
      if (mutated) void refresh();
    }
  }

  async function resolvePending(msgId: string, approve: boolean) {
    const target = messages.find((m) => m.id === msgId)?.pending;
    if (!target) return;
    const setState = (state: PendingState, resultNote?: string) =>
      setMessages((ms) =>
        ms.map((m) => (m.id === msgId && m.pending ? { ...m, pending: { ...m.pending, state, resultNote } } : m)),
      );
    setState("working");
    try {
      const res = await api<{ ok: boolean; message: string; mutated: boolean }>("/api/agent/confirm", {
        body: { id: target.id, approve },
      });
      setState(approve ? "approved" : "rejected", res.message);
      if (res.mutated) await refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : "הפעולה נכשלה";
      setState("failed", message);
      notify(message, "error");
    }
  }

  const suggestions = scopeSpace
    ? ["מה הכי דחוף כאן?", "סכם לי את המרחב", "תדחה את כל מה שבאיחור למחר"]
    : [
        "מה המשימות הכי חשובות שצריך לתת להן עדיפות?",
        "תסכם לי את מצב המשימות",
        "תדחה את כל מה שבאיחור למחר",
      ];

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="פתיחת צ'אט עם העוזר החכם"
        className="group fixed bottom-5 right-5 z-40 flex h-14 items-center gap-2.5 rounded-full bg-brand ps-4 pe-5 text-white shadow-[0_10px_30px_rgba(38,50,90,0.35)] transition-all hover:-translate-y-0.5 hover:bg-brand-hover hover:shadow-[0_14px_36px_rgba(38,50,90,0.42)] max-sm:bottom-4 max-sm:right-4"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15">
          <Sparkles size={18} />
        </span>
        <span className="text-[15px] font-semibold">דברו עם העוזר</span>
      </button>
    );
  }

  return (
    <section
      aria-label="צ'אט עם העוזר החכם"
      className="anim-pop fixed z-50 flex flex-col overflow-hidden border border-line bg-surface shadow-[0_24px_60px_rgba(16,24,40,0.28)] max-sm:inset-0 sm:bottom-4 sm:right-4 sm:h-[min(700px,calc(100dvh-2rem))] sm:w-[400px] sm:rounded-2xl"
    >
      {/* כותרת */}
      <header className="border-b border-line-soft bg-wash">
        <div className="flex items-center justify-between gap-2 px-4 pt-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white">
              <Sparkles size={18} />
            </span>
            <div className="leading-tight">
              <h2 className="font-bold">העוזר החכם</h2>
              <p className="text-xs text-muted">שואלים, מבקשים, והמסך מתעדכן</p>
            </div>
          </div>
          <div className="flex items-center">
            <IconButton
              label="שיחה חדשה"
              disabled={sending || messages.length === 0}
              onClick={() => {
                setMessages([]);
                lastScopeKey.current = scopeKey;
              }}
            >
              <RotateCcw size={17} />
            </IconButton>
            <IconButton label="סגירת הצ'אט" onClick={() => setOpen(false)}>
              <X size={19} />
            </IconButton>
          </div>
        </div>

        {/* על מה הסוכן עובד */}
        <div className="relative px-4 pb-3 pt-2.5">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted">עובד על:</span>
            <button
              type="button"
              onClick={() => setScopeMenu((v) => !v)}
              aria-haspopup="listbox"
              aria-expanded={scopeMenu}
              className="inline-flex h-8 items-center gap-2 rounded-full border border-line bg-surface px-3 font-semibold transition-colors hover:border-[#c3c9d6]"
            >
              {scopeSpace ? (
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: scopeSpace.color }} />
              ) : (
                <Globe size={14} className="text-muted" />
              )}
              {scopeLabel}
              <ChevronDown size={14} className="text-muted" />
            </button>
            {override && (
              <button
                type="button"
                onClick={() => setOverride(null)}
                className="text-xs text-muted underline-offset-2 hover:underline"
              >
                חזרה לאוטומטי
              </button>
            )}
          </div>
          {scopeMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setScopeMenu(false)} aria-hidden />
              <ul
                role="listbox"
                aria-label="בחירת מרחב לסוכן"
                className="anim-pop absolute inset-x-4 top-full z-20 -mt-1 max-h-64 overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-xl"
              >
                {[{ id: "all", name: "כל המרחבים", color: "" }, ...spaces].map((o) => {
                  const active = scopeKey === o.id;
                  return (
                    <li key={o.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => {
                          const next: AgentScope = o.id === "all" ? { type: "all" } : { type: "space", spaceId: o.id };
                          const same = (next.type === "all" && autoScope.type === "all") ||
                            (next.type === "space" && autoScope.type === "space" && next.spaceId === autoScope.spaceId);
                          setOverride(same ? null : next);
                          setScopeMenu(false);
                        }}
                        className={cx(
                          "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm font-medium hover:bg-wash",
                          active && "bg-wash",
                        )}
                      >
                        {o.id === "all" ? (
                          <Globe size={14} className="text-muted" />
                        ) : (
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: o.color }} />
                        )}
                        <span className="flex-1">{o.name}</span>
                        {active && <Check size={15} className="text-brand" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </header>

      {/* הודעות */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-[#fbfbfd] px-4 py-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="pt-4">
            <div className="rounded-2xl rounded-ss-md border border-line bg-surface p-4">
              <p className="font-semibold">היי, אני כאן לנהל איתך את המשימות.</p>
              <p className="mt-1 text-sm text-muted">
                אפשר לשאול אותי מה חשוב, להוסיף משימות, לעדכן או למחוק. אני פועל על &quot;{scopeLabel}&quot;.
              </p>
            </div>
            <div className="mt-3 flex flex-col items-start gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="rounded-full border border-line bg-surface px-3.5 py-2 text-start text-sm font-medium text-ink-soft transition-colors hover:border-brand hover:text-brand"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => {
          if (m.role === "note") {
            return (
              <div key={m.id} className="flex items-center gap-2 py-1 text-xs text-muted">
                <span className="h-px flex-1 bg-line" />
                {m.content}
                <span className="h-px flex-1 bg-line" />
              </div>
            );
          }
          if (m.role === "user") {
            return (
              <div key={m.id} className="flex justify-start">
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-ss-md bg-brand px-3.5 py-2.5 text-[15px] leading-relaxed text-white">
                  {m.content}
                </div>
              </div>
            );
          }
          return (
            <div key={m.id} className="flex flex-col items-end gap-2">
              <div
                className={cx(
                  "max-w-[92%] self-end rounded-2xl rounded-se-md border px-3.5 py-2.5 text-[15px] leading-relaxed",
                  m.error ? "border-[#f3c9ce] bg-[#fdecee] text-[#8e1f2d]" : "border-line bg-surface",
                )}
              >
                <RichText text={m.content} />
              </div>
              {m.pending && (
                <PendingCard
                  pending={m.pending}
                  onApprove={() => void resolvePending(m.id, true)}
                  onReject={() => void resolvePending(m.id, false)}
                />
              )}
            </div>
          );
        })}

        {sending && (
          <div className="flex items-center gap-2.5 self-end text-sm text-muted" role="status">
            <span className="inline-flex items-center gap-1 rounded-2xl rounded-se-md border border-line bg-surface px-3 py-2.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="h-1.5 w-1.5 rounded-full bg-muted"
                  style={{ animation: `dot-bounce 1s ${i * 0.15}s infinite ease-in-out` }}
                />
              ))}
            </span>
            <span>{statusText}</span>
          </div>
        )}
      </div>

      {/* שורת קלט */}
      <form
        className="border-t border-line-soft bg-surface p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <div className="flex items-end gap-2 rounded-2xl border border-line bg-wash p-1.5 focus-within:border-focus focus-within:bg-surface">
          <textarea
            ref={inputRef}
            value={input}
            rows={1}
            onChange={(e) => {
              setInput(e.target.value);
              autoGrow();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send(input);
              }
            }}
            placeholder={`כתבו לעוזר… (${scopeLabel})`}
            aria-label="הודעה לעוזר"
            maxLength={2000}
            className="max-h-36 min-h-9 flex-1 resize-none bg-transparent px-2.5 py-2 text-[15px] leading-snug placeholder:text-faint focus:outline-none"
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            aria-label="שליחה"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-white transition-colors hover:bg-brand-hover disabled:bg-[#cfd4de]"
          >
            <ArrowUp size={18} strokeWidth={2.6} />
          </button>
        </div>
      </form>
    </section>
  );
}

/* ---------- כרטיס אישור ---------- */

function PendingCard({
  pending,
  onApprove,
  onReject,
}: {
  pending: ChatMessage["pending"] & object;
  onApprove: () => void;
  onReject: () => void;
}) {
  const { state } = pending;
  const resolved = state === "approved" || state === "rejected";
  const kindLabel = pending.kind === "delete" ? "מחיקה" : pending.kind === "add" ? "הוספה" : "עדכון";
  return (
    <div
      className={cx(
        "w-full max-w-[92%] self-end rounded-2xl border p-3.5",
        resolved ? "border-line bg-surface" : "border-[#f1d9a6] bg-[#fff9ec]",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cx(
            "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
            resolved ? "bg-line-soft text-muted" : "bg-[#fbe7b8] text-[#7a5200]",
          )}
        >
          {state === "approved" ? <Check size={16} /> : state === "rejected" ? <X size={16} /> : <ShieldQuestion size={16} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">
            {state === "approved"
              ? "אושר"
              : state === "rejected"
                ? "בוטל"
                : `${kindLabel} של ${tasksLabel(pending.count)} מחכה לאישור`}
          </div>
          <div className="mt-0.5 text-sm text-ink-soft">{pending.summary}</div>
          {pending.sample.length > 0 && !resolved && (
            <ul className="mt-2 space-y-0.5 text-sm text-muted">
              {pending.sample.map((t, i) => (
                <li key={i} className="truncate">
                  • {t}
                </li>
              ))}
              {pending.count > pending.sample.length && <li>ועוד {pending.count - pending.sample.length}…</li>}
            </ul>
          )}
          {pending.resultNote && (
            <div className={cx("mt-2 text-sm font-medium", state === "failed" ? "text-[#c0293a]" : "text-[#1b7a4f]")}>
              {pending.resultNote}
            </div>
          )}
        </div>
      </div>

      {!resolved && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onApprove}
            disabled={state === "working"}
            className={cx(
              "inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-[15px] font-semibold text-white transition-colors disabled:opacity-60",
              pending.kind === "delete" ? "bg-[#c0293a] hover:bg-[#a52332]" : "bg-brand hover:bg-brand-hover",
            )}
          >
            <Check size={17} />
            {state === "working" ? "מבצע…" : pending.kind === "delete" ? "אשר מחיקה" : "אשר"}
          </button>
          <button
            type="button"
            onClick={onReject}
            disabled={state === "working"}
            className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-surface text-[15px] font-semibold text-ink-soft transition-colors hover:bg-wash disabled:opacity-60"
          >
            <X size={17} />
            לא מאשר
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- טקסט עשיר מינימלי: **מודגש**, רשימות, שורות ---------- */

function RichText({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      blocks.push(
        <ul key={`l${blocks.length}`} className="my-1 list-disc space-y-0.5 ps-5">
          {list.map((li, i) => (
            <li key={i}>{inline(li)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  lines.forEach((line, i) => {
    const m = line.match(/^\s*(?:[-•*]|\d+[.)])\s+(.*)$/);
    if (m) {
      list.push(m[1]);
      return;
    }
    flush();
    if (line.trim() === "") return;
    blocks.push(
      <p key={`p${i}`} className="[&:not(:first-child)]:mt-1.5">
        {inline(line)}
      </p>,
    );
  });
  flush();
  return <>{blocks}</>;
}

function inline(s: string): React.ReactNode[] {
  return s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
  );
}
