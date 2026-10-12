import { z } from "zod";
import { runAgent, type AgentEvent } from "@/lib/agent/run";
import { fail, readJson } from "@/lib/http";
import { isUuid } from "@/lib/repo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(8000) }))
    .min(1)
    .max(60),
  scope: z.union([
    z.object({ type: z.literal("all") }),
    z.object({ type: z.literal("space"), spaceId: z.string().refine(isUuid, "מזהה מרחב לא תקין") }),
  ]),
});

export async function POST(req: Request) {
  const { data, error } = await readJson(req, bodySchema);
  if (error) return error;
  if (data.messages[data.messages.length - 1].role !== "user") return fail(400, "ההודעה האחרונה חייבת להיות מהמשתמש");

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: AgentEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        await runAgent({ history: data.messages, scope: data.scope, emit });
      } catch (err) {
        console.error("[agent]", err instanceof Error ? err.message : err);
        const status = (err as { status?: number })?.status;
        let message = "הסוכן לא הצליח לענות כרגע. נסה שוב בעוד רגע.";
        if (status === 401) message = "מפתח ה-OpenAI נדחה. בדוק את OPENAI_API_KEY.";
        else if (status === 404) message = "המודל שהוגדר לא נמצא בחשבון OpenAI. בדוק את OPENAI_MODEL.";
        else if (status === 429 && (err as { type?: string }).type === "insufficient_quota")
          message = "אזל הקרדיט בחשבון OpenAI. יש להוסיף קרדיט בהגדרות החיוב ב-platform.openai.com.";
        else if (status === 429) message = "יותר מדי בקשות ל-OpenAI. נסה שוב בעוד רגע.";
        else if (err instanceof Error && /DATABASE_URL/.test(err.message)) message = "מסד הנתונים לא מוגדר.";
        emit({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
