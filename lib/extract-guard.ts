export function isAllowedExtractRequest(headers: { get(name: string): string | null }): boolean {
  if (headers.get("x-due-light") !== "1") return false;
  const site = headers.get("sec-fetch-site");
  if (site === "cross-site") return false;
  return true;
}

export function clientAddress(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim() ?? "";
    if (first) return first.slice(0, 80);
  }
  const real = headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 80);
  return "local";
}
