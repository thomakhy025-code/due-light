import { spawn } from "node:child_process";
import { cp, mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

const MODEL = "Xenova/flan-t5-small";
const FILES = [
  ["config.json", 500],
  ["generation_config.json", 40],
  ["tokenizer.json", 1_000_000],
  ["tokenizer_config.json", 100],
  ["special_tokens_map.json", 100],
  ["onnx/encoder_model_quantized.onnx", 30_000_000],
  ["onnx/decoder_model_merged_quantized.onnx", 50_000_000],
];

function curl(url, dest) {
  return new Promise((resolve, reject) => {
    const child = spawn("curl", ["-fL", "--retry", "3", "--retry-delay", "2", "-o", dest, url], { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`curl exited ${code} for ${url}`))));
  });
}

async function bigEnough(file, bytes) {
  try {
    const info = await stat(file);
    return info.size >= bytes;
  } catch {
    return false;
  }
}

export async function copyStudyModel(root = process.cwd()) {
  const runtime = path.join(root, "public", "study-runtime");
  await mkdir(runtime, { recursive: true });
  await cp(path.join(root, "node_modules/@huggingface/transformers/dist/transformers.min.js"), path.join(runtime, "transformers.min.js"));
  await cp(
    path.join(root, "node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.wasm"),
    path.join(runtime, "ort-wasm-simd-threaded.jsep.wasm"),
  );
  await cp(
    path.join(root, "node_modules/@huggingface/transformers/dist/ort-wasm-simd-threaded.jsep.mjs"),
    path.join(runtime, "ort-wasm-simd-threaded.jsep.mjs"),
  );
  await cp(path.join(root, "node_modules/onnxruntime-web/dist/ort.bundle.min.mjs"), path.join(runtime, "ort.bundle.min.mjs"));

  const modelDir = path.join(root, "public", "study-model", "Xenova", "flan-t5-small");
  for (const [name, minBytes] of FILES) {
    const dest = path.join(modelDir, name);
    if (await bigEnough(dest, minBytes)) continue;
    await mkdir(path.dirname(dest), { recursive: true });
    const part = `${dest}.part`;
    await rm(part, { force: true });
    const url = `https://huggingface.co/${MODEL}/resolve/main/${name}`;
    await curl(url, part);
    if (!(await bigEnough(part, minBytes))) throw new Error(`${name} downloaded smaller than ${minBytes} bytes`);
    await rename(part, dest);
  }
}
