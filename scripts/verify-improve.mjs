import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.BASE_URL ?? "http://127.0.0.1:8765/due-light/";
const media = "/cursor/stores/bc-93f9217e-a8c7-44a8-ac5d-fb0a20a1b7ad/media";
const outDir = "/tmp/due-light-verify";
await mkdir(outDir, { recursive: true });
await mkdir(media, { recursive: true });

function pdfBytes(text) {
  const stream = `BT /F1 24 Tf 72 720 Td (${text}) Tj ET\n`;
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

await writeFile(`${outDir}/lang3030.pdf`, pdfBytes("i have math2011 on 8 nov 1530"));

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

const sheet = await browser.newPage({ viewport: { width: 1100, height: 360 } });
await sheet.setContent(`<!doctype html><html><body style="margin:40px;background:#fff;color:#111;font:64px/1.3 Georgia,serif">
i have biol1001 on 9 nov 0800
</body></html>`);
await sheet.screenshot({ path: `${outDir}/biol1001.png` });
await sheet.close();

async function shot(page, name) {
  const log = page.locator("#study .messages, #chat .messages").last();
  if (await log.count()) {
    await log.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });
  }
  const path = `${media}/${name}`;
  await page.screenshot({ path, fullPage: true });
  console.log(`saved ${path}`);
}

const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors = [];
const leaked = [];
const wiki = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("request", (request) => {
  const url = request.url();
  if (url.includes("api.openai.com") || url.includes("/api/extract") || url.includes("/api/study")) leaked.push(url);
  if (url.includes("wikipedia.org")) wiki.push(url);
});

await page.goto(base, { waitUntil: "networkidle" });
await page.waitForSelector("#calendar");
await page.getByLabel("Deadline note").fill("i have lang3030 on 7 nov 0440");
await page.getByRole("button", { name: "Send" }).click();
const card = page.locator(".proposal[data-status='pending']");
await card.waitFor({ timeout: 30000 });
const title = await card.getByLabel("Title").inputValue().catch(async () => card.locator("input").first().inputValue());
const date = await card.locator("input[type='date']").inputValue();
const time = await card.locator("input[type='time']").inputValue();
const reply = await page.locator("#chat [data-kind='deadline']").innerText();
check("typed course code title is LANG3030", title === "LANG3030", title);
check("typed course code date is 7 Nov 2026", date === "2026-11-07", date);
check("typed course code time is 04:40", time === "04:40", time);
check("reply keeps the code and the time", /LANG3030/.test(reply) && /04:40/.test(reply) && /November 7, 2026/.test(reply), reply.slice(0, 240));
check("title is not the lead-in sentence", title !== "I have lang3030" && !/I have lang3030/i.test(title), title);
check("confirm card has no Kind control", (await page.getByText("Kind", { exact: true }).count()) === 0);
check("no Homework or Test toggle", (await page.getByRole("button", { name: "Homework", exact: true }).count()) === 0 && (await page.getByRole("button", { name: "Test", exact: true }).count()) === 0);
check("no kind dots before save", (await page.locator(".mark-homework, .mark-test").count()) === 0);
await shot(page, "due-light-course-code.png");

await card.getByRole("button", { name: "Add to calendar" }).click();
await page.locator(".proposal[data-status='added']").waitFor();
await page.locator("#calendar [data-date='2026-11-07']").click();
const dayTitle = await page.locator(".day-card input").first().inputValue();
const dayTime = await page.locator(".day-card input[type='time']").inputValue();
check("saved title is LANG3030", dayTitle === "LANG3030", dayTitle);
check("saved time is 04:40", dayTime === "04:40", dayTime);
check("saved day has no Kind control", (await page.locator(".day-card").getByText("Kind", { exact: true }).count()) === 0);
check("calendar uses one deadline dot", (await page.locator(".mark-due").count()) >= 1 && (await page.locator(".mark-homework, .mark-test").count()) === 0);
await shot(page, "due-light-saved-deadline.png");

await page.locator("#tab-study").click();
await page.waitForSelector("#study");
check("study is a chat", (await page.locator("#study textarea").count()) === 1 && (await page.locator("#course-notes, #summarise").count()) === 0);
check("study has suggestion chips", (await page.locator("#study .chip").count()) >= 3);
await shot(page, "due-light-study-chat.png");

const wikiBeforeNotes = wiki.length;
await page.getByRole("button", { name: "Read the cell notes" }).click();
await page.waitForSelector("[data-study-title]", { timeout: 90000 });
const studyTitle = await page.locator("[data-study-title]").innerText();
const notesReply = await page.locator("#study [data-kind='notes']").innerText();
check("cell notes become a study set", studyTitle === "Cell respiration", studyTitle);
check("notes reply is not an echo", !notesReply.startsWith(await page.locator("#study [data-role='user']").first().innerText()) && /Course notes/i.test(notesReply), notesReply.slice(0, 180));
check("notes reply does not ask the old fixed question", !/an exam describes a new situation|you have not revised/i.test(notesReply));
check("reading notes does not call wikipedia", wiki.length === wikiBeforeNotes, String(wiki.length));

await page.getByLabel("Study note").fill("Why doesn't glycolysis need oxygen?");
await page.locator("#study").getByRole("button", { name: "Send" }).click();
await page.locator("#study [data-kind='followup']").waitFor({ timeout: 90000 });
const follow = await page.locator("#study [data-kind='followup']").innerText();
check("follow-up uses the notes", /cytoplasm/i.test(follow) && /oxygen/i.test(follow) && /Cell respiration/i.test(follow), follow.slice(0, 320));
check("follow-up is not an echo", !/^Why doesn't glycolysis need oxygen\?/i.test(follow.trim()) && !/Highlighted points/i.test(follow));
check("follow-up does not look up the web", wiki.length === wikiBeforeNotes, wiki.join(" "));
await shot(page, "due-light-study-follow-up.png");

const beforeLookup = await page.locator("#study .msg-assistant").count();
await page.getByRole("button", { name: "What is photosynthesis?" }).click();
await page.waitForFunction(
  (count) => document.querySelectorAll("#study .msg-assistant").length > count,
  beforeLookup,
  { timeout: 30000 },
);
await page.locator("#study").getByRole("button", { name: "Send" }).waitFor();
const looked = await page.locator("#study .msg-assistant").last().innerText();
const factOk = /Public page/i.test(looked) && /photosynthesis/i.test(looked) && /Wikipedia/i.test(looked);
const failOk = /public page/i.test(looked) && /Cell respiration|notes/i.test(looked);
check("public lookup returns a fact or a clear failure", factOk || failOk, looked.slice(0, 360));
check("lookup does not send the private notes", wiki.every((url) => !/glycolysis|cytoplasm|krebs/i.test(decodeURIComponent(url))), wiki.join(" "));
console.log(`lookup outcome: ${factOk ? "fact" : failOk ? "failure" : "neither"}`);
await shot(page, "due-light-public-fact.png");

const filePage = await context.newPage();
const fileErrors = [];
filePage.on("pageerror", (error) => fileErrors.push(String(error)));
await filePage.goto(base, { waitUntil: "networkidle" });
await filePage.locator("#chat input[type='file']").setInputFiles(`${outDir}/lang3030.pdf`);
await filePage.getByRole("button", { name: "Send" }).click();
const pdfCard = filePage.locator(".proposal[data-status='pending']");
await pdfCard.waitFor({ timeout: 30000 });
check("pdf course code title is MATH2011", (await pdfCard.locator("input").first().inputValue()) === "MATH2011");
check("pdf course code time is 15:30", (await pdfCard.locator("input[type='time']").inputValue()) === "15:30");
check("pdf course code date is 8 Nov 2026", (await pdfCard.locator("input[type='date']").inputValue()) === "2026-11-08");
await shot(filePage, "due-light-pdf-course-code.png");

await filePage.locator("#chat input[type='file']").setInputFiles(`${outDir}/biol1001.png`);
await filePage.getByRole("button", { name: "Send" }).click();
await filePage.locator(".proposal[data-status='pending']").nth(1).waitFor({ timeout: 90000 });
const photoCard = filePage.locator(".proposal[data-status='pending']").nth(1);
const photoTitle = await photoCard.locator("input").first().inputValue();
const photoTime = await photoCard.locator("input[type='time']").inputValue();
const photoDate = await photoCard.locator("input[type='date']").inputValue();
check("photo course code title is BIOL1001", photoTitle === "BIOL1001", photoTitle);
check("photo course code time is 08:00", photoTime === "08:00", photoTime);
check("photo course code date is 9 Nov 2026", photoDate === "2026-11-09", photoDate);
await shot(filePage, "due-light-photo-course-code.png");

const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
const mobile = await phone.newPage();
await mobile.goto(base, { waitUntil: "networkidle" });
await mobile.locator("#tab-study").click();
await mobile.waitForSelector("#study textarea");
const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("mobile study chat has no horizontal overflow", overflow <= 1, `overflow=${overflow}`);
await shot(mobile, "due-light-study-chat-mobile.png");

check("no secret requests", leaked.length === 0, leaked.join(" "));
check("no page errors", errors.length === 0 && fileErrors.length === 0, [...errors, ...fileErrors].join(" | "));

await browser.close();
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("improve verified");
