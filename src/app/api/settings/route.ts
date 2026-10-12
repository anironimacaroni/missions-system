import { guard, ok, readJson } from "@/lib/http";
import { getSettings, saveSettings, settingsSchema } from "@/lib/repo";

export const dynamic = "force-dynamic";

export function GET() {
  return guard(async () => ok(await getSettings()));
}

export function PUT(req: Request) {
  return guard(async () => {
    const { data, error } = await readJson(req, settingsSchema);
    if (error) return error;
    await saveSettings(data);
    return ok(data);
  });
}
