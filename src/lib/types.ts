import type { Priority, Status, TaskType, View } from "./constants";

export interface Space {
  id: string;
  name: string;
  color: string;
  view: View;
  position: number;
}

export interface Task {
  id: string;
  spaceId: string;
  type: TaskType;
  title: string;
  description: string;
  priority: Priority;
  status: Status;
  /** YYYY-MM-DD או null */
  dueDate: string | null;
  position: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  /** מזהי המרחבים שמוצגים בדשבורד. null = כולם */
  dashboardSpaces: string[] | null;
}

export interface BootstrapData {
  spaces: Space[];
  tasks: Task[];
  settings: AppSettings;
}

export type AgentScope = { type: "all" } | { type: "space"; spaceId: string };

export interface PendingAction {
  id: string;
  kind: "update" | "delete" | "add";
  count: number;
  summary: string;
  /** כותרות של חלק מהמשימות שישתנו */
  sample: string[];
}
