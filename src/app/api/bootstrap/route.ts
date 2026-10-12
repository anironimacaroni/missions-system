import { guard, ok } from "@/lib/http";
import { getSettings, listSpaces, listTasks } from "@/lib/repo";

export const dynamic = "force-dynamic";

export function GET() {
  return guard(async () => {
    const [spaces, tasks, settings] = await Promise.all([listSpaces(), listTasks(), getSettings()]);
    return ok({ spaces, tasks, settings });
  });
}
