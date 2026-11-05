import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const outDir = "/tmp/due-light-verify";
await mkdir(outDir, { recursive: true });

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
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));
let studyPosts = 0;
page.on("request", (request) => {
  if (request.method() === "POST" && request.url().includes("/api/study")) studyPosts += 1;
});

await page.goto(base, { waitUntil: "networkidle" });
await page.waitForSelector("#calendar");
check("calendar is the default view", await page.locator("#calendar").isVisible());

await page.locator("#tab-study").click();
await page.waitForSelector("#course-notes");
await page.getByRole("button", { name: "Use a sample" }).click();
await page.locator("#summarise").click();
await page.waitForSelector("[data-study-title]");
const title = await page.locator("[data-study-title]").innerText();
check("sample notes get a title", title === "Cell respiration", title);
const points = await page.locator("[data-point]").allInnerTexts();
check("important points are highlighted", points.length >= 3 && points.some((point) => /glycolysis/i.test(point)), points.join(" | "));
check("clear notes do not call the model", studyPosts === 0, `posts=${studyPosts}`);

await page.locator(".flip").click();
check("flashcard flips to the answer", (await page.locator(".flip").getAttribute("data-side")) === "back");
const back = await page.locator(".flip strong").innerText();
check("flashcard answer is the point", back.length > 20, back);

await page.getByRole("button", { name: "Show how to answer" }).first().click();
const question = await page.locator("[data-question]").first().innerText();
check("practice question uses the notes", /glycolysis|oxygen|krebs|osmosis|electron|pyruvate|mitochondria/i.test(question), question.slice(0, 220));
check("practice question is not a fixed template", !/an exam describes a new situation|fresh example|you have not revised/i.test(question));
check("practice question is not bare recall", !/^\s*\d+\.\s*(what is|define)\b/i.test(question));
check("approach is visible", /how to answer/i.test(question) && question.length > 180);

await page.screenshot({ path: `${outDir}/study-desktop.png`, fullPage: true });

await page.reload({ waitUntil: "networkidle" });
await page.locator("#tab-study").click();
await page.waitForSelector("[data-study-title]");
check("refresh keeps the study set", (await page.locator("[data-study-title]").innerText()) === "Cell respiration");

const beforeMessy = studyPosts;
await page.locator("#course-notes").fill("so like cells do this energy thing and water moves around idk it's kinda important");
await page.locator("#summarise").click();
await page.getByText(/clear date|bullet notes|study model/i).waitFor();
check("messy notes stay in the browser", studyPosts === beforeMessy, `posts=${studyPosts}`);

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
await writeFile(`${outDir}/notes.png`, png);
const beforePhoto = studyPosts;
await page.locator("#course-notes").fill("");
await page.locator("#study input[type='file']").setInputFiles(`${outDir}/notes.png`);
await page.locator("#summarise").click();
await page.getByText(/readable text/i).waitFor({ timeout: 60000 });
check("blank photo is not uploaded", studyPosts === beforePhoto, `posts=${studyPosts}`);
check("blank photo says no readable text", (await page.locator("#study").innerText()).includes("readable text"));

await page.locator("#tab-calendar").click();
await page.waitForSelector("#chat");
await page.getByLabel("Deadline note").fill("Please summarise these notes:\n- Mitosis makes two identical nuclei.\n- Meiosis makes four nuclei with half the chromosomes.");
await page.getByRole("button", { name: "Send" }).click();
await page.getByRole("button", { name: "Open study set" }).click();
await page.waitForSelector("[data-study-title]");
check("chat summarise opens a study set", /mitosis|meiosis|identical/i.test(await page.locator("#study").innerText()));
await page.locator("#tab-calendar").click();
check("chat keeps an open study set button", await page.getByRole("button", { name: "Open study set" }).isVisible());

const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
const phone = await mobile.newPage();
const phoneErrors = [];
phone.on("pageerror", (error) => phoneErrors.push(String(error)));
await phone.goto(base, { waitUntil: "networkidle" });
await phone.locator("#tab-study").click();
await phone.getByRole("button", { name: "Use a sample" }).click();
await phone.locator("#summarise").click();
await phone.waitForSelector("[data-study-title]");
const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("mobile study has no horizontal overflow", overflow <= 1, `overflow=${overflow}`);
check("mobile study shows points and a card", (await phone.locator("[data-point]").count()) >= 3 && (await phone.locator(".flip").isVisible()));
await phone.screenshot({ path: `${outDir}/study-mobile.png`, fullPage: true });

check("no page errors", pageErrors.length === 0 && phoneErrors.length === 0, [...pageErrors, ...phoneErrors].join(" | "));
await browser.close();
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("study verified");
