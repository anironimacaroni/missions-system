import { fail, guard, ok, readJson } from "@/lib/http";
import { deleteSpace, isUuid, spaceUpdateSchema, updateSpace } from "@/lib/repo";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export function PATCH(req: Request, { params }: Ctx) {
  return guard(async () => {
    const { id } = await params;
    if (!isUuid(id)) return fail(404, "המרחב לא נמצא");
    const { data, error } = await readJson(req, spaceUpdateSchema);
    if (error) return error;
    const space = await updateSpace(id, data);
    return space ? ok(space) : fail(404, "המרחב לא נמצא");
  });
}

export function DELETE(_req: Request, { params }: Ctx) {
  return guard(async () => {
    const { id } = await params;
    if (!isUuid(id)) return fail(404, "המרחב לא נמצא");
    return (await deleteSpace(id)) ? ok({ ok: true }) : fail(404, "המרחב לא נמצא");
  });
}
