const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_BASE64 = 4_800_000;
const MAX_IMAGE_BYTES = 3_500_000;

export type ImageInput = { mime: string; data: string };

export function visionConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function readImage(value: unknown): ImageInput | "missing" | "bad" {
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

export type ModelCall =
  | { status: "ok"; content: string }
  | { status: "missing" }
  | { status: "auth" }
  | { status: "rate" }
  | { status: "fail" };

async function once(key: string, model: string, system: string, userContent: unknown[], maxTokens: number): Promise<ModelCall> {
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
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent },
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
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) return { status: "fail" };
  return { status: "ok", content };
}

export async function completeJson(options: {
  key: string;
  system: string;
  userContent: unknown[];
  maxTokens: number;
}): Promise<ModelCall> {
  const first = await once(options.key, "gpt-4o-mini", options.system, options.userContent, options.maxTokens);
  if (first.status !== "missing") return first;
  return once(options.key, "gpt-4o", options.system, options.userContent, options.maxTokens);
}
