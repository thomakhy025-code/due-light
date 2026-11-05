import { clientAddress, isAllowedExtractRequest } from "@/lib/extract-guard";
import { completeJson, readImage, visionConfigured } from "@/lib/model-gateway";
import { allowRequest, appRateState } from "@/lib/rate-limit";
import { studyFromModelContent } from "@/lib/study-notes";
import type { ExtractFailure, StudyResult } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_TEXT = 6000;
const NO_KEY =
  "Photo reading and messy notes need an OpenAI key named OPENAI_API_KEY. Nothing was sent to a model. Clear notes with headings or bullet points still summarise on this device.";

function json(body: StudyResult | ExtractFailure, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!isAllowedExtractRequest(request.headers)) {
    return json({ ok: false, reason: "forbidden", message: "That request was rejected." }, 403);
  }
  if (!visionConfigured()) {
    return json({ ok: false, reason: "no_key", message: NO_KEY });
  }
  const length = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(length) && length > 5_000_000) {
    return json({ ok: false, reason: "bad_image", message: "That photo is too large. Use one under 3 MB, or paste the notes." }, 413);
  }
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return json({ ok: false, reason: "bad_json", message: "Send the notes as JSON." }, 415);
  }
  if (!allowRequest(appRateState, clientAddress(request.headers), Date.now())) {
    return json({ ok: false, reason: "rate", message: "Too many reads just now. Wait a little, or use bullet points." }, 429);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, reason: "bad_json", message: "That upload could not be read." }, 400);
  }
  if (!payload || typeof payload !== "object") {
    return json({ ok: false, reason: "bad_json", message: "That upload could not be read." }, 400);
  }
  const record = payload as Record<string, unknown>;
  const text = typeof record.text === "string" ? record.text.replace(/\u0000/g, "").slice(0, MAX_TEXT).trim() : "";
  const image = readImage(record.image);
  if (image === "bad") {
    return json({ ok: false, reason: "bad_image", message: "That file isn't a JPEG, PNG, WEBP, or GIF photo I can read." }, 400);
  }
  if (!text && image === "missing") {
    return json({ ok: false, reason: "empty", message: "Add course notes or a photo." }, 400);
  }

  const key = process.env.OPENAI_API_KEY?.trim() ?? "";
  const prompt = text
    ? `Course material from the student:\n${text}`
    : "The student sent a photo of course material and no typed note.";
  const content: unknown[] = [{ type: "text", text: prompt }];
  if (image !== "missing") {
    content.push({
      type: "image_url",
      image_url: { url: `data:${image.mime};base64,${image.data}`, detail: "auto" },
    });
  }

  const result = await completeJson({
    key,
    maxTokens: 1400,
    userContent: content,
    system:
      "You turn course material into revision aids. Reply with JSON only: " +
      "{\"title\":string,\"points\":string[],\"flashcards\":[{\"front\":string,\"back\":string}],\"questions\":[{\"prompt\":string,\"approach\":string}]}. " +
      "points are the important ideas only, 3 to 8 of them, specific, not a copy of the whole note. " +
      "flashcards revise those points: front is a short cue, back is the answer. " +
      "questions are exam-style and must ask the student to APPLY an idea to a new situation. " +
      "Do not write simple recall such as \"What is X?\" or \"Define X\". " +
      "Each prompt includes a small scenario. approach is 2 to 4 sentences on how to use the notes, not a single memorised sentence. " +
      "Do not invent facts that are not in the material. If there is nothing to study, return empty arrays.",
  });
  if (result.status === "auth") {
    return json({
      ok: false,
      reason: "rejected_key",
      message: "The OpenAI key was rejected. Check the OPENAI_API_KEY secret for this app. Clear bullet notes still summarise on this device.",
    });
  }
  if (result.status === "rate") {
    return json({
      ok: false,
      reason: "upstream_rate",
      message: "The reader is busy. Try again in a minute, or use bullet points.",
    });
  }
  if (result.status !== "ok") {
    return json({
      ok: false,
      reason: "upstream",
      message: "The reader couldn't finish. Clear bullet notes still summarise on this device.",
    });
  }
  const study = studyFromModelContent(result.content);
  if (!study) {
    return json({
      ok: false,
      reason: "empty",
      message: "I couldn't find study points in that. Try headings and bullet points.",
    });
  }
  return json({ ok: true, study });
}
