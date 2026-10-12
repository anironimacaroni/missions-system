import { fail, guard, ok, readJson } from "@/lib/http";
import { createTask, listSpaces, listTasks, taskCreateSchema } from "@/lib/repo";

export const dynamic = "force-dynamic";

export function GET() {
  return guard(async () => ok(await listTasks()));
}

export function POST(req: Request) {
  return guard(async () => {
    const { data, error } = await readJson(req, taskCreateSchema);
    if (error) return error;
    const spaces = await listSpaces();
    if (!spaces.some((s) => s.id === data.spaceId)) return fail(400, "המרחב לא קיים");
    return ok(await createTask(data), 201);
  });
}
