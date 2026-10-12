import { fail, guard, ok, readJson } from "@/lib/http";
import { createSpace, listSpaces, spaceCreateSchema } from "@/lib/repo";

export const dynamic = "force-dynamic";

export function GET() {
  return guard(async () => ok(await listSpaces()));
}

export function POST(req: Request) {
  return guard(async () => {
    const { data, error } = await readJson(req, spaceCreateSchema);
    if (error) return error;
    return ok(await createSpace(data), 201);
  });
}
