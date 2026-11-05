import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { copyStudyModel } from "./copy-study-model.mjs";

export async function copyReaders(root = process.cwd()) {
  const pub = path.join(root, "public");
  const tesseract = path.join(pub, "tesseract");
  const tessdata = path.join(pub, "tessdata");
  await mkdir(tesseract, { recursive: true });
  await mkdir(tessdata, { recursive: true });
  await cp(path.join(root, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs"), path.join(pub, "pdf.worker.min.mjs"));
  await cp(path.join(root, "node_modules/tesseract.js/dist/worker.min.js"), path.join(tesseract, "worker.min.js"));
  await cp(
    path.join(root, "node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js"),
    path.join(tesseract, "tesseract-core-simd-lstm.wasm.js"),
  );
  await cp(
    path.join(root, "node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js"),
    path.join(tesseract, "tesseract-core-lstm.wasm.js"),
  );
  await cp(
    path.join(root, "node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz"),
    path.join(tessdata, "eng.traineddata.gz"),
  );
  await copyStudyModel(root);
}
