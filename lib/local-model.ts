export const MODEL_FAILED =
  "The study model could not load in this browser. Clear dates and bullet notes still work on this device.";
export const MODEL_LOADING = "The study model is loading in this browser.";
export const MODEL_READY = "The study model is running in this browser. Your notes stay on this device.";

export type ModelState = "idle" | "loading" | "ready" | "failed";

type Generator = (prompt: string) => Promise<string>;

let state: ModelState = "idle";
let generator: Generator | null = null;
let task: Promise<void> | null = null;
const listeners = new Set<(line: string) => void>();

function lineFor(next: ModelState): string {
  if (next === "ready") return MODEL_READY;
  if (next === "failed") return MODEL_FAILED;
  return MODEL_LOADING;
}

function setState(next: ModelState) {
  state = next;
  const line = lineFor(next);
  for (const listener of listeners) listener(line);
}

export function studyModelLine(): string {
  return lineFor(state);
}

export function studyModelState(): ModelState {
  return state;
}

export function subscribeStudyModel(listener: (line: string) => void): () => void {
  listeners.add(listener);
  listener(lineFor(state));
  void prepareStudyModel();
  return () => listeners.delete(listener);
}

export function prepareStudyModel(): Promise<void> {
  if (!task) task = run();
  return task;
}

async function run(): Promise<void> {
  if (typeof window === "undefined") {
    setState("failed");
    return;
  }
  setState("loading");
  try {
    const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
    const runtime = new URL(`${base}/study-runtime/transformers.min.js`, window.location.origin).href;
    const load = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<{
      pipeline: (taskName: string, model: string, options: Record<string, unknown>) => Promise<
        (input: string, options?: { max_new_tokens?: number }) => Promise<{ generated_text?: string } | Array<{ generated_text?: string }>>
      >;
      env: {
        allowLocalModels: boolean;
        allowRemoteModels: boolean;
        localModelPath: string;
        backends: { onnx: { wasm: { numThreads?: number } } };
      };
    }>;
    const mod = await load(runtime);
    mod.env.allowLocalModels = true;
    mod.env.allowRemoteModels = false;
    mod.env.localModelPath = `${base}/study-model/`;
    const onnx = mod.env.backends.onnx ?? (mod.env.backends.onnx = { wasm: {} });
    onnx.wasm ??= {};
    onnx.wasm.numThreads = 1;
    const pipe = await mod.pipeline("text2text-generation", "Xenova/flan-t5-small", {
      device: "wasm",
      dtype: "q8",
      local_files_only: true,
    });
    generator = async (prompt: string) => {
      const result = await pipe(prompt, { max_new_tokens: 48 });
      const row = Array.isArray(result) ? result[0] : result;
      return String(row?.generated_text ?? "").trim();
    };
    setState("ready");
  } catch {
    generator = null;
    setState("failed");
  }
}

export async function studyModelSentence(prompt: string, timeoutMs = 12000): Promise<string | null> {
  if (state !== "ready" || !generator) return null;
  const current = generator;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const text = await Promise.race([
      current(prompt),
      new Promise<string>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
      }),
    ]);
    return text.replace(/\s+/g, " ").trim().slice(0, 280) || null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
