export type PublicFact = { ok: true; fact: string; source: string } | { ok: false; message: string };

const FAIL = "I looked for a public page and didn’t find one.";
const CODE = /\b[A-Za-z]{4}\d{4}\b/;

export function publicSearchQuery(question: string): string {
  const code = question.match(CODE);
  if (code) return `${code[0].toUpperCase()} university course`;
  const cleaned = question
    .replace(/[?？]/g, " ")
    .replace(/^(?:what|who|when|where|why|how|does|do|is|are|can|could)\b(?:\s+(?:is|are|does|do|did|a|an|the))*\s*/i, "")
    .replace(/\b(?:refer to|mean|means|stand for)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || question).slice(0, 120);
}

function relevant(question: string, query: string, title: string, body: string): boolean {
  const hay = `${title} ${body}`.toLowerCase();
  const code = question.match(CODE);
  if (code) return hay.includes(code[0].toLowerCase());
  const skip = new Set(["university", "course", "about", "refer", "means", "what", "when", "where", "which", "does"]);
  const keys = (query.toLowerCase().match(/[a-z][a-z'-]{4,}/g) ?? []).filter((word) => !skip.has(word));
  if (keys.length === 0) return false;
  return keys.some((word) => hay.includes(word));
}

function strip(value: unknown): string {
  return typeof value === "string" ? value.replace(/<[^>]+>/g, " ") : "";
}

async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) return null;
  const body = (await response.json()) as unknown;
  return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
}

export async function lookupPublicFact(question: string): Promise<PublicFact> {
  const query = publicSearchQuery(question).trim();
  if (!query) return { ok: false, message: FAIL };
  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=1&format=json&origin=*&srlimit=3`;
    const found = await fetchJson(searchUrl);
    const queryBody = found?.query;
    const hits =
      queryBody && typeof queryBody === "object" && Array.isArray((queryBody as { search?: unknown }).search)
        ? ((queryBody as { search: Array<{ title?: unknown; snippet?: unknown }> }).search)
        : [];
    const picked = hits.find((hit) => typeof hit.title === "string" && relevant(question, query, hit.title, strip(hit.snippet)));
    if (!picked || typeof picked.title !== "string") return { ok: false, message: FAIL };
    const summary = await fetchJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(picked.title)}`);
    const extract = typeof summary?.extract === "string" ? summary.extract.trim() : "";
    const title = typeof summary?.title === "string" ? summary.title : picked.title;
    if (!extract || !relevant(question, query, title, extract)) return { ok: false, message: FAIL };
    const fact = extract.split(/(?<=\.)\s+/).slice(0, 2).join(" ").slice(0, 420);
    return { ok: true, fact, source: `Wikipedia: ${title}` };
  } catch {
    return { ok: false, message: FAIL };
  }
}
