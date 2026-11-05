export const FILE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,application/pdf,.pdf";

export const MAX_FILE_BYTES = 8_000_000;

const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export const UNSUPPORTED_FILE = "Use a JPEG, PNG, WEBP, GIF, or PDF.";
export const EMPTY_FILE = "I couldn't find any readable text in that file. Try a clearer photo, or type the words.";
export const TOO_BIG_FILE = "That file is over 8 MB. Try a smaller one, or type the words.";
export const READER_FAILED = "I couldn't read that file in this browser. Type the words instead.";

export function isPdf(file: File): boolean {
  const type = file.type.toLowerCase().split(";")[0]?.trim() ?? "";
  return type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function isPhoto(file: File): boolean {
  const type = file.type.toLowerCase().split(";")[0]?.trim() ?? "";
  if (PHOTO_TYPES.has(type)) return true;
  return /\.(jpe?g|png|webp|gif)$/i.test(file.name);
}

export function readableText(text: string): boolean {
  const letters = text.match(/[A-Za-z0-9\u4e00-\u9fff]/g);
  return (letters?.length ?? 0) >= 8;
}
