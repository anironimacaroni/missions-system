import { z } from "zod";
import { resolvePending } from "@/lib/agent/run";
import { fail, guard, ok, readJson } from "@/lib/http";
import { isUuid } from "@/lib/repo";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  id: z.string().refine(isUuid, "מזהה לא תקין"),
  approve: z.boolean(),
});

export function POST(req: Request) {
  return guard(async () => {
    const { data, error } = await readJson(req, bodySchema);
    if (error) return error;
    const result = await resolvePending(data.id, data.approve);
    return result.ok ? ok(result) : fail(409, result.message);
  });
}
