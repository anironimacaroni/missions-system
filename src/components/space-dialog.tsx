"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Trash2 } from "lucide-react";
import { SPACE_COLORS, VIEWS, VIEW_META, type View } from "@/lib/constants";
import { Button, Modal, ModalHeader, cx } from "./ui";
import { useData } from "./data-provider";

type DialogState = { mode: "new" } | { mode: "edit"; spaceId: string } | null;

interface SpaceDialogApi {
  openNew: () => void;
  openEdit: (id: string) => void;
}

const Ctx = createContext<SpaceDialogApi | null>(null);

export function useSpaceDialog(): SpaceDialogApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSpaceDialog חייב לפעול בתוך SpaceDialogProvider");
  return v;
}

export function SpaceDialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DialogState>(null);
  const api = useMemo<SpaceDialogApi>(
    () => ({ openNew: () => setState({ mode: "new" }), openEdit: (id) => setState({ mode: "edit", spaceId: id }) }),
    [],
  );
  const close = useCallback(() => setState(null), []);
  return (
    <Ctx.Provider value={api}>
      {children}
      {state && <SpaceForm key={state.mode === "edit" ? state.spaceId : "new"} state={state} onClose={close} />}
    </Ctx.Provider>
  );
}

function ViewPreview({ view }: { view: View }) {
  const line = "#c9cfdb";
  const fill = "#e6e9f0";
  if (view === "kanban") {
    return (
      <svg viewBox="0 0 96 60" className="h-14 w-full" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <g key={i} transform={`translate(${6 + i * 22} 6)`}>
            <rect width="19" height="48" rx="3" fill={fill} />
            <rect x="3" y="5" width="13" height="8" rx="2" fill="#fff" stroke={line} />
            {i % 2 === 0 && <rect x="3" y="16" width="13" height="8" rx="2" fill="#fff" stroke={line} />}
            {i < 2 && <rect x="3" y="27" width="13" height="8" rx="2" fill="#fff" stroke={line} />}
          </g>
        ))}
      </svg>
    );
  }
  if (view === "todo") {
    return (
      <svg viewBox="0 0 96 60" className="h-14 w-full" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <g key={i} transform={`translate(8 ${6 + i * 13})`}>
            <rect x="0" y="0" width="80" height="10" rx="3" fill={fill} />
            <circle cx="72" cy="5" r="3.2" fill={i === 0 ? "#2FA566" : "#fff"} stroke={i === 0 ? "#2FA566" : line} />
            <rect x={i === 0 ? 30 : 22} y="3.5" width={i === 0 ? 36 : 44} height="3" rx="1.5" fill={line} />
          </g>
        ))}
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 96 60" className="h-14 w-full" aria-hidden>
      <rect x="6" y="5" width="84" height="50" rx="4" fill={fill} />
      {[0, 1, 2, 3, 4, 5, 6].map((c) =>
        [0, 1, 2].map((r) => (
          <rect key={`${c}-${r}`} x={10 + c * 11.5} y={10 + r * 14} width="9.5" height="11" rx="2" fill="#fff" stroke={line} strokeWidth="0.6" />
        )),
      )}
      <rect x="21.5" y="12" width="9.5" height="3.5" rx="1.5" fill="#3B7BEA" />
      <rect x="56.5" y="26" width="9.5" height="3.5" rx="1.5" fill="#E5604D" />
      <rect x="33" y="40" width="9.5" height="3.5" rx="1.5" fill="#2FA566" />
    </svg>
  );
}

function SpaceForm({ state, onClose }: { state: NonNullable<DialogState>; onClose: () => void }) {
  const router = useRouter();
  const { spaces, tasks, createSpace, updateSpace, deleteSpace } = useData();
  const existing = state.mode === "edit" ? spaces.find((s) => s.id === state.spaceId) : undefined;

  const [name, setName] = useState(existing?.name ?? "");
  const [color, setColor] = useState<string>(existing?.color ?? SPACE_COLORS[spaces.length % SPACE_COLORS.length]);
  const [view, setView] = useState<View>(existing?.view ?? "kanban");
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (state.mode === "edit" && !existing) return null;
  const taskCount = existing ? tasks.filter((t) => t.spaceId === existing.id).length : 0;

  async function save() {
    if (!name.trim()) {
      setError(true);
      return;
    }
    setSaving(true);
    if (existing) {
      await updateSpace(existing.id, { name: name.trim(), color, view });
      onClose();
    } else {
      const created = await createSpace({ name: name.trim(), color, view });
      setSaving(false);
      if (created) {
        onClose();
        router.push(`/spaces/${created.id}`);
      }
    }
  }

  return (
    <Modal open onClose={onClose} label={existing ? "עריכת מרחב" : "מרחב חדש"} maxWidth="max-w-lg">
      <ModalHeader title={existing ? "עריכת מרחב" : "מרחב חדש"} onClose={onClose} />
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div>
            <label htmlFor="space-name" className="mb-2 block text-sm font-medium text-muted">
              שם המרחב
            </label>
            <input
              id="space-name"
              autoFocus
              value={name}
              maxLength={60}
              onChange={(e) => {
                setName(e.target.value);
                setError(false);
              }}
              placeholder="למשל: בית, עבודה, לימודים"
              aria-invalid={error}
              className={cx(
                "h-11 w-full rounded-lg border bg-surface px-3 text-[16px] placeholder:text-faint focus:border-focus focus:outline-none",
                error ? "border-[#d92d3f]" : "border-line",
              )}
            />
            {error && <p className="mt-1 text-sm text-[#c0293a]">צריך לתת שם למרחב</p>}
          </div>

          <div>
            <div className="mb-2 text-sm font-medium text-muted">צבע</div>
            <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="צבע">
              {SPACE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  aria-label={c}
                  onClick={() => setColor(c)}
                  className={cx(
                    "flex h-9 w-9 items-center justify-center rounded-full ring-offset-2 transition-all",
                    color === c ? "scale-105 ring-2" : "hover:scale-105",
                  )}
                  style={{ background: c, ["--tw-ring-color" as string]: c }}
                >
                  {color === c && <Check size={16} className="text-white" strokeWidth={3} />}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-medium text-muted">תצוגה</div>
            <div className="grid grid-cols-3 gap-2.5" role="radiogroup" aria-label="תצוגה">
              {VIEWS.map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={view === v}
                  onClick={() => setView(v)}
                  className={cx(
                    "rounded-xl border p-2.5 text-start transition-all",
                    view === v ? "border-brand bg-[#f1f3fa] ring-1 ring-brand" : "border-line hover:bg-wash",
                  )}
                >
                  <ViewPreview view={v} />
                  <div className="mt-1.5 text-sm font-semibold">{VIEW_META[v].label}</div>
                </button>
              ))}
            </div>
            <p className="mt-2 text-sm text-muted">{VIEW_META[view].hint}. אפשר להחליף תצוגה בכל רגע.</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line-soft bg-wash px-5 py-3">
          <div className="flex items-center gap-2">
            <Button variant="primary" type="submit" disabled={saving}>
              {existing ? "שמירה" : "יצירת מרחב"}
            </Button>
            <Button variant="ghost" onClick={onClose}>
              ביטול
            </Button>
          </div>
          {existing &&
            (confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted">{taskCount > 0 ? `יימחקו גם ${taskCount} משימות.` : "למחוק את המרחב?"}</span>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={async () => {
                    const id = existing.id;
                    onClose();
                    await deleteSpace(id);
                    router.push("/");
                  }}
                >
                  מחק
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                  לא
                </Button>
              </div>
            ) : (
              <Button variant="ghost" className="text-[#c0293a]" onClick={() => setConfirmDelete(true)}>
                <Trash2 size={16} />
                מחיקת מרחב
              </Button>
            ))}
        </div>
      </form>
    </Modal>
  );
}
