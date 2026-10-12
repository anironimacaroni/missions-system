import { fail, guard, ok, readJson } from "@/lib/http";
import { deleteTask, isUuid, listSpaces, taskUpdateSchema, updateTask } from "@/lib/repo";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export function PATCH(req: Request, { params }: Ctx) {
  return guard(async () => {
    const { id } = await params;
    if (!isUuid(id)) return fail(404, "המשימה לא נמצאה");
    const { data, error } = await readJson(req, taskUpdateSchema);
    if (error) return error;
    if (data.spaceId) {
      const spaces = await listSpaces();
      if (!spaces.some((s) => s.id === data.spaceId)) return fail(400, "המרחב לא קיים");
    }
    const task = await updateTask(id, data);
    return task ? ok(task) : fail(404, "המשימה לא נמצאה");
  });
}

export function DELETE(_req: Request, { params }: Ctx) {
  return guard(async () => {
    const { id } = await params;
    if (!isUuid(id)) return fail(404, "המשימה לא נמצאה");
    return (await deleteTask(id)) ? ok({ ok: true }) : fail(404, "המשימה לא נמצאה");
  });
}
