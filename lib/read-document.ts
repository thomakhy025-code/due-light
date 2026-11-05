import { EMPTY_FILE, READER_FAILED, UNSUPPORTED_FILE, isPdf, isPhoto, readableText } from "./document-files";

type PdfTextItem = { str?: string; transform?: number[] };

const assetBase = process.env.NEXT_PUBLIC_BASE_PATH || "";

function cleanRead(text: string): string {
  return text.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function reflow(text: string): string {
  const lines = text.replace(/\r/g, "").split("\n").map((line) => line.trim()).filter(Boolean);
  const paragraphs: string[] = [];
  let current = "";
  const bullet = /^(?:[-*•]|\d+[.)])\s/;
  const shortTitle = (line: string) => {
    const bare = line.replace(/:$/, "").trim();
    return bare.length >= 3 && bare.length <= 48 && bare.split(/\s+/).length <= 6 && !/[.?!。？！]$/.test(bare);
  };
  for (const line of lines) {
    if (!current) {
      current = line;
      continue;
    }
    const finished = /[.?!。？！:]$/.test(current);
    if (bullet.test(line) || shortTitle(current) || finished) {
      paragraphs.push(current);
      current = line;
    } else {
      current = `${current} ${line}`;
    }
  }
  if (current) paragraphs.push(current);
  return paragraphs.join("\n");
}

function linesFromPdfItems(items: PdfTextItem[]): string {
  const rows: Array<{ y: number; text: string }> = [];
  for (const item of items) {
    const str = item.str?.replace(/\s+/g, " ").trim();
    if (!str) continue;
    const y = item.transform?.[5] ?? 0;
    const last = rows[rows.length - 1];
    if (last && Math.abs(last.y - y) < 3) last.text = `${last.text} ${str}`;
    else rows.push({ y, text: str });
  }
  return rows.map((row) => row.text.trim()).filter(Boolean).join("\n");
}

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const response = await fetch(`${assetBase}/pdf.worker.min.mjs`);
    if (!response.ok) throw new Error("pdf-worker");
    const source = await response.text();
    pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  }
  return pdfjs;
}

type OcrWorker = {
  recognize: (image: Blob) => Promise<{ data: { text?: string; confidence?: number } }>;
};

let workerPromise: Promise<OcrWorker> | null = null;

function ocrWorker(): Promise<OcrWorker> {
  if (!workerPromise) {
    workerPromise = import("tesseract.js").then(({ createWorker }) =>
      createWorker("eng", 1, {
        workerPath: `${assetBase}/tesseract/worker.min.js`,
        corePath: `${assetBase}/tesseract`,
        langPath: `${assetBase}/tessdata`,
        gzip: true,
        workerBlobURL: true,
      }),
    );
  }
  return workerPromise;
}

async function ocrBlob(blob: Blob): Promise<string> {
  const worker = await ocrWorker();
  const result = await worker.recognize(blob);
  const text = cleanRead(result.data.text ?? "");
  const confidence = result.data.confidence ?? 0;
  if (!readableText(text)) return "";
  if (confidence > 0 && confidence < 30) return "";
  return text;
}

async function blobFromCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("canvas");
  return blob;
}

async function imageFileToPng(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const maxWidth = 1600;
  const scale = bitmap.width > maxWidth ? maxWidth / bitmap.width : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return blobFromCanvas(canvas);
}

async function textFromPdf(file: File): Promise<string> {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const pageCount = Math.min(doc.numPages, 4);
  const parts: string[] = [];
  for (let number = 1; number <= pageCount; number += 1) {
    const page = await doc.getPage(number);
    const content = await page.getTextContent();
    const text = linesFromPdfItems(content.items as PdfTextItem[]);
    if (text) parts.push(text);
  }
  const embedded = cleanRead(parts.join("\n"));
  if (readableText(embedded)) {
    await doc.destroy();
    return embedded;
  }
  const scans: string[] = [];
  for (let number = 1; number <= pageCount; number += 1) {
    const page = await doc.getPage(number);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2, 1400 / base.width);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) continue;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;
    const text = await ocrBlob(await blobFromCanvas(canvas));
    if (text) scans.push(text);
  }
  await doc.destroy();
  return cleanRead(scans.join("\n"));
}

export async function readDocument(file: File): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  if (!isPdf(file) && !isPhoto(file)) return { ok: false, message: UNSUPPORTED_FILE };
  try {
    const raw = isPdf(file) ? await textFromPdf(file) : await ocrBlob(await imageFileToPng(file));
    const text = reflow(raw);
    if (!readableText(text)) return { ok: false, message: EMPTY_FILE };
    return { ok: true, text };
  } catch {
    workerPromise = null;
    return { ok: false, message: READER_FAILED };
  }
}
