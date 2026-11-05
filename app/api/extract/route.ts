import { clientAddress, isAllowedExtractRequest } from "@/lib/extract-guard";
import { draftsFromModelContent } from "@/lib/model-events";
import { allowRequest, createRateState } from "@/lib/rate-limit";
import { shanghaiNow } from "@/lib/shanghai";
import type { ExtractResult } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_TEXT = 6000;
const MAX_BASE64 = 4_800_000;
const MAX_IMAGE_BYTES = 3_500_000;
const rateState = createRateState();

function json(body: ExtractResult | { vision: boolean }, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function failure(reason: string, message: string, status: number): Response {
  return json({ ok: false, reason, message }, status);
}

function visionConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

type ImageInput = { mime: string; data: string };

function readImage(value: unknown): ImageInput | "missing" | "bad" {
  if (value == null) return "missing";
  if (!value || typeof value !== "object") return "bad";
  const record = value as Record<string, unknown>;
  if (typeof record.mime !== "string" || typeof record.data !== "string") return "bad";
  const mime = record.mime.toLowerCase().split(";")[0]?.trim() ?? "";
  const data = record.data.replace(/\s/g, "");
  if (!IMAGE_TYPES.has(mime)) return "bad";
  if (!data || data.length > MAX_BASE64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return "bad";
  const bytes = Math.floor((data.length * 3) / 4) - (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0);
  if (bytes > MAX_IMAGE_BYTES) return "bad";
  return { mime, data };
}

type ModelCall =
  | { status: "ok"; content: string }
  | { status: "missing" }
  | { status: "auth" }
  | { status: "rate" }
  | { status: "fail" };

async function callModel(key: string, model: string, content: unknown[]): Promise<ModelCall> {
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 800,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You extract school deadlines. Reply with JSON only: {\"events\":[{\"title\":string,\"date\":\"YYYY-MM-DD\",\"time\":\"HH:mm\" or null,\"kind\":\"homework\" or \"test\"}]}. " +
              "Include only deadlines, due dates, quizzes, tests, and exams that are actually written. Do not invent dates. " +
              "kind is test for tests, quizzes, midterms, finals, and exams. Everything else due is homework. " +
              "time is 24-hour local time or null. title is short and does not repeat the date. If nothing qualifies, return {\"events\":[]}.",
          },
          { role: "user", content },
        ],
      }),
      signal: AbortSignal.timeout(22_000),
    });
  } catch {
    return { status: "fail" };
  }
  if (response.status === 401 || response.status === 403) return { status: "auth" };
  if (response.status === 429) return { status: "rate" };
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { code?: string } } | null;
    if (body?.error?.code === "model_not_found" || response.status === 404) return { status: "missing" };
    return { status: "fail" };
  }
  const body = (await response.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: string } }>;
  } | null;
  const contentText = body?.choices?.[0]?.message?.content;
  if (typeof contentText !== "string" || !contentText.trim()) return { status: "fail" };
  return { status: "ok", content: contentText };
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
  if (!allowRequest(rateState, clientAddress(request.headers), Date.now())) {
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

  let result = await callModel(key, "gpt-4o-mini", content);
  if (result.status === "missing") result = await callModel(key, "gpt-4o", content);
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
