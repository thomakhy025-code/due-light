import { clientAddress, isAllowedExtractRequest } from "@/lib/extract-guard";
import { completeJson, readImage, visionConfigured } from "@/lib/model-gateway";
import { draftsFromModelContent } from "@/lib/model-events";
import { allowRequest, appRateState } from "@/lib/rate-limit";
import { shanghaiNow } from "@/lib/shanghai";
import type { ExtractResult } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_TEXT = 6000;

function json(body: ExtractResult | { vision: boolean }, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function failure(reason: string, message: string, status: number): Response {
  return json({ ok: false, reason, message }, status);
}

export async function GET(request: Request): Promise<Response> {
  if (!isAllowedExtractRequest(request.headers)) {
    return failure("forbidden", "That request was rejected.", 403);
  }
  return json({ vision: visionConfigured() });
}

export async function POST(request: Request): Promise<Response> {
  if (!isAllowedExtractRequest(request.headers)) {
    return failure("forbidden", "That request was rejected.", 403);
  }
  if (!visionConfigured()) {
    return json({
      ok: false,
      reason: "no_key",
      message:
        "Photo reading and messy notes need an OpenAI key named OPENAI_API_KEY. Nothing was sent to a model. Type a clear date, like “Quiz Friday 10am”, and it will still save.",
    });
  }
  const length = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(length) && length > 5_000_000) {
    return failure("bad_image", "That photo is too large. Use one under 3 MB, or type the date.", 413);
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return failure("bad_json", "Send the note as JSON.", 415);
  }
  if (!allowRequest(appRateState, clientAddress(request.headers), Date.now())) {
    return failure("rate", "Too many reads just now. Wait a little, or type the date.", 429);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return failure("bad_json", "That upload could not be read.", 400);
  }
  if (!payload || typeof payload !== "object") {
    return failure("bad_json", "That upload could not be read.", 400);
  }
  const record = payload as Record<string, unknown>;
  const text = typeof record.text === "string" ? record.text.replace(/\u0000/g, "").slice(0, MAX_TEXT).trim() : "";
  const image = readImage(record.image);
  if (image === "bad") {
    return failure("bad_image", "That file isn't a JPEG, PNG, WEBP, or GIF photo I can read.", 400);
  }
  if (!text && image === "missing") {
    return failure("empty", "Add a note or a photo.", 400);
  }

  const key = process.env.OPENAI_API_KEY?.trim() ?? "";
  const clock = shanghaiNow();
  const prompt =
    `Timezone is Asia/Shanghai. Today is ${clock.iso} (${clock.weekday}). ` +
    (text ? `The student wrote:\n${text}` : "The student sent a photo and no typed note.");
  const content: unknown[] = [{ type: "text", text: prompt }];
  if (image !== "missing") {
    content.push({
      type: "image_url",
      image_url: { url: `data:${image.mime};base64,${image.data}`, detail: "auto" },
    });
  }

  const result = await completeJson({
    key,
    maxTokens: 800,
    userContent: content,
    system:
      "You extract school deadlines. Reply with JSON only: {\"events\":[{\"title\":string,\"date\":\"YYYY-MM-DD\",\"time\":\"HH:mm\" or null,\"kind\":\"homework\" or \"test\"}]}. " +
      "Include only deadlines, due dates, quizzes, tests, and exams that are actually written. Do not invent dates. " +
      "kind is test for tests, quizzes, midterms, finals, and exams. Everything else due is homework. " +
      "time is 24-hour local time or null. title is short and does not repeat the date. If nothing qualifies, return {\"events\":[]}.",
  });
  if (result.status === "auth") {
    return json({
      ok: false,
      reason: "rejected_key",
      message: "The OpenAI key was rejected. Check the OPENAI_API_KEY secret for this app. Typed dates still work.",
    });
  }
  if (result.status === "rate") {
    return json({
      ok: false,
      reason: "upstream_rate",
      message: "The reader is busy. Try again in a minute, or type the date.",
    });
  }
  if (result.status !== "ok") {
    return json({
      ok: false,
      reason: "upstream",
      message: "The reader couldn't finish. Typed dates still work.",
    });
  }
  const events = draftsFromModelContent(result.content, clock);
  if (events.length === 0) {
    return json({
      ok: false,
      reason: "empty",
      message: "I couldn't find a deadline in that. Try a line like “Essay due Nov 14”.",
    });
  }
  return json({ ok: true, events });
}
