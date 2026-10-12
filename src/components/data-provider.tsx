"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client-api";
import { todayISO } from "@/lib/dates";
import type { Priority, Status, TaskType, View } from "@/lib/constants";
import type { AppSettings, BootstrapData, Space, Task } from "@/lib/types";

export interface NewTaskInput {
  spaceId: string;
  title: string;
  type?: TaskType;
  description?: string;
  priority?: Priority;
  status?: Status;
  dueDate?: string | null;
}

export type TaskPatch = Partial<
  Pick<Task, "title" | "description" | "priority" | "status" | "type" | "dueDate" | "position" | "spaceId">
>;

interface Toast {
  id: number;
  text: string;
  tone: "info" | "error";
}

interface DataContextValue {
  loaded: boolean;
  loadError: string | null;
  spaces: Space[];
  tasks: Task[];
  settings: AppSettings;
  today: string;
  toasts: Toast[];
  notify: (text: string, tone?: Toast["tone"]) => void;
  dismissToast: (id: number) => void;
  refresh: () => Promise<void>;
  createTask: (input: NewTaskInput) => Promise<Task | null>;
  updateTask: (id: string, patch: TaskPatch) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  createSpace: (input: { name: string; color: string; view: View }) => Promise<Space | null>;
  updateSpace: (id: string, patch: Partial<Pick<Space, "name" | "color" | "view">>) => Promise<void>;
  deleteSpace: (id: string) => Promise<void>;
  setDashboardSpaces: (ids: string[] | null) => Promise<void>;
}

const Ctx = createContext<DataContextValue | null>(null);

export function useData(): DataContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useData חייב לפעול בתוך DataProvider");
  return v;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "הפעולה נכשלה";
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [settings, setSettings] = useState<AppSettings>({ dashboardSpaces: null });
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [today, setToday] = useState(() => todayISO());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const notify = useCallback((text: string, tone: Toast["tone"] = "info") => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-3), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 6000 : 3200);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const refresh = useCallback(async () => {
    try {
      const data = await api<BootstrapData>("/api/bootstrap");
      setSpaces(data.spaces);
      setTasks(data.tasks);
      setSettings(data.settings);
      setToday(todayISO());
      setLoadError(null);
    } catch (e) {
      setLoadError(errMsg(e));
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  const createTask = useCallback<DataContextValue["createTask"]>(
    async (input) => {
      try {
        const task = await api<Task>("/api/tasks", { body: input });
        setTasks((prev) => [task, ...prev]);
        return task;
      } catch (e) {
        notify(errMsg(e), "error");
        return null;
      }
    },
    [notify],
  );

  const updateTask = useCallback<DataContextValue["updateTask"]>(
    async (id, patch) => {
      setTasks((prev) => {
        const cur = prev.find((t) => t.id === id);
        if (!cur) return prev;
        const next: Task = { ...cur, ...patch, updatedAt: new Date().toISOString() };
        if (patch.status && patch.status !== cur.status) {
          next.completedAt = patch.status === "completed" ? new Date().toISOString() : null;
          if (patch.position === undefined) {
            const siblings = prev.filter((t) => t.spaceId === cur.spaceId).map((t) => t.position);
            next.position = (siblings.length ? Math.min(...siblings) : 0) - 1;
          }
        }
        return prev.map((t) => (t.id === id ? next : t));
      });
      try {
        const saved = await api<Task>(`/api/tasks/${id}`, { method: "PATCH", body: patch });
        setTasks((prev) => prev.map((t) => (t.id === id ? saved : t)));
      } catch (e) {
        notify(errMsg(e), "error");
        void refresh();
      }
    },
    [notify, refresh],
  );

  const deleteTask = useCallback<DataContextValue["deleteTask"]>(
    async (id) => {
      const snapshot = tasks;
      setTasks((prev) => prev.filter((t) => t.id !== id));
      try {
        await api(`/api/tasks/${id}`, { method: "DELETE" });
      } catch (e) {
        setTasks(snapshot);
        notify(errMsg(e), "error");
      }
    },
    [tasks, notify],
  );

  const createSpace = useCallback<DataContextValue["createSpace"]>(
    async (input) => {
      try {
        const space = await api<Space>("/api/spaces", { body: input });
        setSpaces((prev) => [...prev, space]);
        return space;
      } catch (e) {
        notify(errMsg(e), "error");
        return null;
      }
    },
    [notify],
  );

  const updateSpace = useCallback<DataContextValue["updateSpace"]>(
    async (id, patch) => {
      setSpaces((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
      try {
        const saved = await api<Space>(`/api/spaces/${id}`, { method: "PATCH", body: patch });
        setSpaces((prev) => prev.map((s) => (s.id === id ? saved : s)));
      } catch (e) {
        notify(errMsg(e), "error");
        void refresh();
      }
    },
    [notify, refresh],
  );

  const deleteSpace = useCallback<DataContextValue["deleteSpace"]>(
    async (id) => {
      try {
        await api(`/api/spaces/${id}`, { method: "DELETE" });
        setSpaces((prev) => prev.filter((s) => s.id !== id));
        setTasks((prev) => prev.filter((t) => t.spaceId !== id));
        setSettings((s) =>
          s.dashboardSpaces ? { ...s, dashboardSpaces: s.dashboardSpaces.filter((x) => x !== id) } : s,
        );
      } catch (e) {
        notify(errMsg(e), "error");
      }
    },
    [notify],
  );

  const setDashboardSpaces = useCallback<DataContextValue["setDashboardSpaces"]>(
    async (ids) => {
      setSettings({ dashboardSpaces: ids });
      try {
        await api("/api/settings", { method: "PUT", body: { dashboardSpaces: ids } });
      } catch (e) {
        notify(errMsg(e), "error");
      }
    },
    [notify],
  );

  const value = useMemo<DataContextValue>(
    () => ({
      loaded,
      loadError,
      spaces,
      tasks,
      settings,
      today,
      toasts,
      notify,
      dismissToast,
      refresh,
      createTask,
      updateTask,
      deleteTask,
      createSpace,
      updateSpace,
      deleteSpace,
      setDashboardSpaces,
    }),
    [loaded, loadError, spaces, tasks, settings, today, toasts, notify, dismissToast, refresh, createTask, updateTask, deleteTask, createSpace, updateSpace, deleteSpace, setDashboardSpaces],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
