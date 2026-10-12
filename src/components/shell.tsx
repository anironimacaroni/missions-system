"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, LayoutDashboard, LogOut, Plus, X } from "lucide-react";
import { DataProvider, useData } from "./data-provider";
import { SpaceDialogProvider, useSpaceDialog } from "./space-dialog";
import { TaskDialogProvider } from "./task-dialog";
import { ChatProvider, ChatWidget, useChatShell } from "./chat-widget";
import { Spinner, cx } from "./ui";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <DataProvider>
      <TaskDialogProvider>
        <SpaceDialogProvider>
          <ChatProvider>
            <ShellInner>{children}</ShellInner>
          </ChatProvider>
        </SpaceDialogProvider>
      </TaskDialogProvider>
    </DataProvider>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const { open } = useChatShell();
  const { loaded, loadError, refresh } = useData();

  return (
    <div className="min-h-dvh">
      <TopBar />
      <main
        className={cx(
          "mx-auto w-full max-w-[1440px] px-4 pb-28 pt-6 transition-[padding] duration-200 sm:px-6 sm:pt-8",
          open && "min-[1500px]:pe-[432px]",
        )}
      >
        {!loaded ? (
          <div className="flex justify-center py-24 text-muted">
            <Spinner size={26} />
          </div>
        ) : loadError ? (
          <div className="mx-auto mt-16 max-w-md rounded-2xl border border-[#f3c9ce] bg-[#fdecee] p-8 text-center">
            <h1 className="text-lg font-bold text-[#8e1f2d]">לא הצלחנו לטעון את הנתונים</h1>
            <p className="mt-1 text-[#8e1f2d]">{loadError}</p>
            <button
              type="button"
              onClick={() => void refresh()}
              className="mt-4 h-10 rounded-lg bg-brand px-4 font-medium text-white hover:bg-brand-hover"
            >
              ניסיון חוזר
            </button>
          </div>
        ) : (
          children
        )}
      </main>
      <ChatWidget />
      <Toasts />
    </div>
  );
}

function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { spaces } = useData();
  const { openNew } = useSpaceDialog();
  const navRef = useRef<HTMLElement>(null);

  // מביא את הלשונית הפעילה לתצוגה בנייד, שם הסרגל גולל אופקית
  useEffect(() => {
    const active = navRef.current?.querySelector<HTMLElement>("[aria-current=page]");
    active?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [pathname, spaces.length]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const onDashboard = pathname === "/";

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="מרחב - לדשבורד">
          <span className="grid h-8 w-8 grid-cols-2 gap-[3px] rounded-[10px] bg-brand p-[6px]" aria-hidden>
            <span className="rounded-[3px] bg-[#E5604D]" />
            <span className="rounded-[3px] bg-[#EE9B2F]" />
            <span className="rounded-[3px] bg-[#2FA566]" />
            <span className="rounded-[3px] bg-[#7C5CFC]" />
          </span>
          <span className="font-display text-xl font-black max-sm:hidden">מרחב</span>
        </Link>

        <nav ref={navRef} aria-label="ניווט ראשי" className="-mx-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1 py-1.5">
          <Link
            href="/"
            aria-current={onDashboard ? "page" : undefined}
            className={cx(
              "inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors",
              onDashboard ? "bg-surface shadow-sm ring-1 ring-line" : "text-ink-soft hover:bg-black/5",
            )}
          >
            <LayoutDashboard size={16} />
            דשבורד
          </Link>
          <span className="mx-1 h-5 w-px shrink-0 bg-line" aria-hidden />
          {spaces.map((s) => {
            const active = pathname === `/spaces/${s.id}`;
            return (
              <Link
                key={s.id}
                href={`/spaces/${s.id}`}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "inline-flex h-9 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors",
                  active ? "bg-surface shadow-sm ring-1 ring-line" : "text-ink-soft hover:bg-black/5",
                )}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                {s.name}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={openNew}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted transition-colors hover:bg-black/5 hover:text-ink"
          >
            <Plus size={16} />
            מרחב חדש
          </button>
        </nav>

        <button
          type="button"
          onClick={() => void logout()}
          aria-label="התנתקות"
          title="התנתקות"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-black/5 hover:text-ink"
        >
          <LogOut size={17} />
        </button>
      </div>
    </header>
  );
}

function Toasts() {
  const { toasts, dismissToast } = useData();
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-5 left-5 z-[60] flex flex-col gap-2 max-sm:inset-x-4 max-sm:bottom-24" role="status">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cx(
            "anim-pop pointer-events-auto flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium shadow-lg",
            t.tone === "error" ? "bg-[#8e1f2d] text-white" : "bg-brand text-white",
          )}
        >
          {t.tone === "error" ? <AlertCircle size={17} /> : <CheckCircle2 size={17} />}
          <span className="flex-1">{t.text}</span>
          <button type="button" onClick={() => dismissToast(t.id)} aria-label="סגירה" className="opacity-70 hover:opacity-100">
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}
