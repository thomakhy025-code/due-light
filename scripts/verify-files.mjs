import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.BASE_URL ?? "http://127.0.0.1:8765/due-light/";
const outDir = "/tmp/due-light-verify";
await mkdir(outDir, { recursive: true });

function pdfBytes(text) {
  const stream = `BT /F1 24 Tf 72 700 Td (${text}) Tj ET\n`;
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n",
    `4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}endstream\nendobj\n`,
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(body.length);
    body += object;
  }
  const xref = body.length;
  body += `xref\n0 6\n0000000000 65535 f \n`;
  for (let index = 1; index <= 5; index += 1) {
    body += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body);
}

await writeFile(`${outDir}/essay.pdf`, pdfBytes("Essay due November 14"));

const failures = [];
function check(name, ok, detail = "") {
  if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ""}`);
  console.log(`${ok ? "ok" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const sheet = await browser.newPage({ viewport: { width: 1000, height: 700 } });
await sheet.setContent(`<!doctype html><html><body style="margin:48px;background:#fff;color:#111;font:42px/1.45 Georgia,serif;width:900px">
<p style="font-size:56px;margin:0 0 28px">Cell respiration</p>
<p style="margin:0 0 22px">Glycolysis splits glucose into pyruvate in the cytoplasm and does not need oxygen.</p>
<p style="margin:0 0 22px">The Krebs cycle turns pyruvate into carbon dioxide in the mitochondria.</p>
<p style="margin:0">Osmosis: water moves across a membrane from a dilute solution to a more concentrated one.</p>
</body></html>`);
await sheet.screenshot({ path: `${outDir}/notes.png` });
await sheet.close();

const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
const leaked = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("request", (request) => {
  const url = request.url();
  if (url.includes("api.openai.com") || url.includes("/api/extract") || url.includes("/api/study")) leaked.push(url);
});
await page.goto(base, { waitUntil: "networkidle" });
await page.waitForSelector("#calendar");
await page.getByLabel("Deadline note").fill(`Cell respiration
- Glycolysis splits glucose into pyruvate in the cytoplasm and does not need oxygen.
- The Krebs cycle turns pyruvate into carbon dioxide in the mitochondria.
- The electron transport chain uses oxygen to make most of the ATP.

Osmosis: water moves across a membrane from a dilute solution to a more concentrated one.`);
await page.getByRole("button", { name: "Send" }).click();
await page.locator("[data-kind='notes']").waitFor();
const notesChat = await page.locator("#chat").innerText();
check("notes summary names the material", /glycolysis/i.test(notesChat) && /does not need oxygen/i.test(notesChat), notesChat.slice(0, 300));
check("questions are not the old template", !/an exam describes a new situation|you have not revised/i.test(notesChat));
check("questions use oxygen and glycolysis", /oxygen/i.test(notesChat) && /glycolysis/i.test(notesChat));
await page.screenshot({ path: `${outDir}/notes-questions.png`, fullPage: true });

await page.getByLabel("Deadline note").fill("Why doesn't glycolysis need oxygen?");
await page.getByRole("button", { name: "Send" }).click();
await page.locator("[data-kind='followup']").waitFor();
const follow = await page.locator("[data-kind='followup']").innerText();
check("follow-up stays on the notes", /follow-up/i.test(follow) && /oxygen/i.test(follow) && /cytoplasm/i.test(follow), follow.slice(0, 300));
check("follow-up is not the same card", !/highlighted points/i.test(follow));
await page.screenshot({ path: `${outDir}/follow-up.png`, fullPage: true });

await page.locator("#chat input[type='file']").setInputFiles(`${outDir}/essay.pdf`);
await page.getByRole("button", { name: "Send" }).click();
await page.getByRole("button", { name: "Add to calendar" }).waitFor({ timeout: 30000 });
const chat = await page.locator("#chat").innerText();
check("pdf text becomes a deadline", /essay/i.test(chat) && /read the file/i.test(chat), chat.slice(0, 240));
await page.screenshot({ path: `${outDir}/pdf-deadline.png`, fullPage: true });

await page.locator("#tab-study").click();
await page.locator("#study input[type='file']").setInputFiles(`${outDir}/notes.png`);
await page.locator("#summarise").click();
await page.waitForSelector("[data-study-title]", { timeout: 90000 });
const title = await page.locator("[data-study-title]").innerText();
const points = await page.locator("[data-point]").allInnerTexts();
const joined = points.join(" | ");
check("photo becomes a study set", /cell respiration/i.test(title) && /cytoplasm/i.test(joined) && /mitochondria/i.test(joined), `${title} | ${joined}`);
check("photo questions use the notes", /oxygen|glycolysis|osmosis|krebs/i.test(await page.locator("#study").innerText()));
check("photo questions are not a fixed template", !/an exam describes a new situation/i.test(await page.locator("#study").innerText()));
check("photo made flashcards and questions", (await page.locator(".flip").count()) === 1 && (await page.locator("[data-question]").count()) >= 2);
await page.getByRole("button", { name: "Summarise" }).waitFor();
await page.screenshot({ path: `${outDir}/photo-study.png`, fullPage: true });
check("files stay in the browser", leaked.length === 0, leaked.join(" "));
check("no page errors", errors.length === 0, errors.join(" | "));

await browser.close();
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("files verified");
