import type { ExtractResult, StudyResult } from "./types";

export async function visionEnabled(): Promise<boolean> {
  const response = await fetch("/api/extract", {
    headers: { "x-due-light": "1" },
    cache: "no-store",
  });
  if (!response.ok) return false;
  const data = (await response.json()) as { vision?: boolean };
  return data.vision === true;
}

export async function extractDeadlines(body: {
  text?: string;
  image?: { mime: string; data: string };
}): Promise<ExtractResult> {
  const response = await fetch("/api/extract", {
    method: "POST",
    headers: { "content-type": "application/json", "x-due-light": "1" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  const data = (await response.json().catch(() => null)) as ExtractResult | null;
  if (data && typeof data === "object" && "ok" in data) return data;
  return {
    ok: false,
    reason: "upstream",
    message: "The reader didn't answer. Typed dates still work when the day is clear.",
  };
}

export async function summariseMaterial(body: {
  text?: string;
  image?: { mime: string; data: string };
}): Promise<StudyResult> {
  const response = await fetch("/api/study", {
    method: "POST",
    headers: { "content-type": "application/json", "x-due-light": "1" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
  });
  const data = (await response.json().catch(() => null)) as StudyResult | null;
  if (data && typeof data === "object" && "ok" in data) return data;
  return {
    ok: false,
    reason: "upstream",
    message: "The reader didn't answer. Clear bullet notes still summarise on this device.",
  };
}

export function readImageFile(file: File): Promise<{ name: string; mime: string; base64: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const match = /^data:([^;,]+);base64,(.+)$/.exec(result);
      if (!match) {
        reject(new Error("unreadable"));
        return;
      }
      resolve({ name: file.name || "photo", mime: match[1] || file.type, base64: match[2] });
    };
    reader.onerror = () => reject(reader.error ?? new Error("unreadable"));
    reader.readAsDataURL(file);
  });
}
