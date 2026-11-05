const STOP = new Set(
  "a an the of to and or in on at for from with into by is are was were be been being this that these those it its as not do does did can could will would about than then so if when where how why what which who your you we they their our also most most doesn".split(
    " ",
  ),
);

const VERB =
  /\b(splits|uses|turns|moves|makes|needs|releases|happens|means|converts|produces|requires|captures|donates|accepts|breaks|forms|carries|stores|occurs|creates|changes|crosses|diffuses|gives|takes)\b/i;

export function contentWords(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const word of words) {
    const bare = word.replace(/'s$/, "");
    if (STOP.has(bare) || seen.has(bare)) continue;
    seen.add(bare);
    out.push(bare);
  }
  return out;
}

const EXTRA_WORDS = new Set(["notes", "step", "process", "because", "without", "across", "still", "line"]);

export function groundedInSource(output: string, source: string): boolean {
  const sourceWords = new Set(contentWords(source));
  const used = contentWords(output).filter((word) => word.length >= 4);
  if (used.length < 3) return false;
  const invented = used.filter((word) => !sourceWords.has(word) && !EXTRA_WORDS.has(word));
  if (invented.length > 0) return false;
  return used.filter((word) => sourceWords.has(word)).length >= 2;
}

export function subjectOf(point: string): string {
  const defined = /^([^:]{2,48}):\s+\S/.exec(point);
  if (defined && defined[1].trim().split(/\s+/).length <= 6) return defined[1].trim();
  const verb = VERB.exec(point);
  if (verb && verb.index >= 2 && verb.index <= 64) {
    return point
      .slice(0, verb.index)
      .replace(/^(?:the|a|an)\s+/i, "")
      .trim()
      .replace(/[,:;]$/, "");
  }
  return point.split(/\s+/).slice(0, 4).join(" ");
}

function joinAnd(items: string[]): string {
  if (items.length === 0) return "these lines";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function longEnough(text: string, point: string): string {
  if (text.length > 40) return text;
  return `${text} Stay with this line: “${point}”.`;
}

function avoidedThing(point: string): string | null {
  const match = /\b(?:does not|doesn't|do not|don't)\s+(?:need\s+|use\s+|require\s+)?([^.,;]+)/i.exec(point);
  const thing = match?.[1]?.trim().replace(/\s+/g, " ");
  if (!thing || thing.length > 40) return null;
  return thing;
}

export function contrastSentence(points: string[]): string | null {
  const negative = points.find((point) => avoidedThing(point));
  const positive = points.find((point) => point !== negative && /\buses\b/i.test(point));
  if (!negative || !positive) return null;
  const thing = avoidedThing(negative);
  if (!thing) return null;
  if (!new RegExp(thing.split(/\s+/)[0], "i").test(positive)) return null;
  return `${subjectOf(negative)} does not need ${thing}; ${subjectOf(positive)} does.`;
}

export function deskSummary(title: string, points: string[]): string {
  const names: string[] = [];
  for (const point of points) {
    const name = subjectOf(point);
    if (name && !names.some((item) => item.toLowerCase() === name.toLowerCase())) names.push(name);
  }
  const lead = title ? `${title}: the useful parts are ${joinAnd(names.slice(0, 4))}.` : `The useful parts are ${joinAnd(names.slice(0, 4))}.`;
  const contrast = contrastSentence(points);
  return contrast ? `${lead} ${contrast}` : lead;
}

function questionForPoint(point: string, sibling: string | null): { prompt: string; approach: string } {
  const subject = subjectOf(point);
  const defined = /^([^:]{2,48}):\s+(.{8,})$/.exec(point);
  if (defined && defined[1].trim().split(/\s+/).length <= 6) {
    const term = defined[1].trim();
    const meaning = defined[2].trim();
    return {
      prompt: `${term} in these notes: ${meaning} Which words say what moves or changes, and what is the result they name?`,
      approach: longEnough(`Keep the term ${term} and answer with words from “${meaning}”.`, point),
    };
  }
  const place = /\b(in|inside|across)\s+((?:the|a|an)\s+)?([a-z]+(?:\s+[a-z]+)?)/i.exec(point);
  if (place) {
    const words = place[3].split(/\s+/);
    const noun = words[1] && /^(?:and|but|or|to|of|from|that|which|when|does|do|is|not)$/i.test(words[1]) ? words[0] : place[3];
    const where = `${place[1]} ${place[2] ?? ""}${noun}`.replace(/\s+/g, " ").trim();
    return {
      prompt: `${subject} — these notes place it “${where}”. What does ${subject} do there, and what result does the sentence name?`,
      approach: longEnough(`Start with ${subject} and the place “${where}”. Finish with the result in “${point}”.`, point),
    };
  }
  const other = sibling ? subjectOf(sibling) : "a different line";
  return {
    prompt: `${subject} is named in the notes. The line is: “${point}” What does ${subject} act on, and what does that line say comes out of it?`,
    approach: longEnough(`Quote the verb and the objects from “${point}”. Do not swap in ${other}.`, point),
  };
}

function contrastQuestion(points: string[]): { prompt: string; approach: string } | null {
  const negative = points.find((point) => avoidedThing(point));
  const positive = points.find((point) => point !== negative && /\buses\b/i.test(point));
  if (!negative || !positive) return null;
  const thing = avoidedThing(negative);
  if (!thing || !new RegExp(thing.split(/\s+/)[0], "i").test(positive)) return null;
  const without = subjectOf(negative);
  const withIt = subjectOf(positive);
  return {
    prompt: `${without} does not need ${thing}, while ${withIt} uses ${thing}. Which step in these notes needs ${thing}, and what does ${without} still do without it?`,
    approach: longEnough(`Say ${withIt} needs ${thing}. Then use this line for the step that does not: “${negative}”.`, negative),
  };
}

export function materialQuestions(points: string[]): Array<{ prompt: string; approach: string }> {
  const questions: Array<{ prompt: string; approach: string }> = [];
  const contrast = contrastQuestion(points);
  if (contrast) questions.push(contrast);
  for (const point of points) {
    if (questions.length >= 3) break;
    const sibling = points.find((item) => item !== point) ?? null;
    const next = questionForPoint(point, sibling);
    if (questions.some((question) => question.prompt === next.prompt)) continue;
    questions.push(next);
  }
  return questions.slice(0, 3);
}

export function answerFromNotes(question: string, points: string[], title: string, usedPrompts: string[]): string {
  const ranked = points
    .map((point) => ({ point, score: contentWords(question).filter((word) => contentWords(point).includes(word)).length }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score < 1) {
    return `I don’t see that in ${title || "the notes"} we already read. Ask with a word from those notes, or paste the next section.`;
  }
  const other = ranked.find((item) => item.point !== best.point);
  const avoided = avoidedThing(best.point);
  let answer: string;
  if (/\bwhy\b/i.test(question) && avoided) {
    answer = `You asked why. The note on ${subjectOf(best.point)} says it does not need ${avoided}. That line is: “${best.point}”`;
  } else if (/\bwhere\b|\bwhich part\b/i.test(question)) {
    const place = /\b(?:in|inside|across)\s+(?:the\s+)?[^.,]+/i.exec(best.point);
    answer = place
      ? `The place in the notes is “${place[0]}”. The full line: “${best.point}”`
      : `The closest line doesn’t name a place. It says: “${best.point}”`;
  } else {
    answer = `The line that matches what you asked is: “${best.point}”`;
  }
  if (other) answer += ` Keep it apart from this other line: “${other.point}”`;
  const freshSource = points.find((point) => point !== best.point);
  if (freshSource) {
    const freshSubject = subjectOf(freshSource);
    const bestSubject = subjectOf(best.point);
    const fresh = `Set ${bestSubject} aside. Using only “${freshSource}”, what does ${freshSubject} do that ${bestSubject} does not?`;
    if (!usedPrompts.includes(fresh)) {
      answer += `\n\nA different question from the same notes:\n${fresh}`;
    }
  }
  return answer;
}
