import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const outDir = "/tmp/due-light-verify";
await mkdir(outDir, { recursive: true });

function shanghaiIso(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type) => Number(parts.find((part) => part.type === type)?.value);
  const date = new Date(Date.UTC(get("year"), get("month") - 1, get("day") + offsetDays));
  return date.toISOString().slice(0, 10);
}

const today = shanghaiIso(0);
const tomorrow = shanghaiIso(1);
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
const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error)));

await page.goto(base, { waitUntil: "networkidle" });
await page.waitForSelector("#calendar");
await page.screenshot({ path: `${outDir}/desktop-empty.png`, fullPage: true });

await page.getByLabel("Deadline note").fill("Math homework due 2026-11-14");
await page.getByRole("button", { name: "Mark dates" }).click();
await page.getByRole("button", { name: "Add to calendar" }).waitFor();
await page.screenshot({ path: `${outDir}/desktop-confirm.png`, fullPage: true });
check("confirm before save", await page.getByText("Check it, then add it.").count() > 0);
const before = await page.locator('[data-date="2026-11-14"]').getAttribute("data-count");
check("not saved before confirm", before === "0", `count=${before}`);
await page.getByRole("button", { name: "Add to calendar" }).click();
await page.waitForFunction(() => document.querySelector('[data-date="2026-11-14"]')?.getAttribute("data-count") === "1");
await page.locator('[data-date="2026-11-14"]').click();
const homeworkTitle = await page.locator(".day-card input").first().inputValue();
check("day detail lists the homework", homeworkTitle === "Math homework", homeworkTitle);

await page.getByLabel("Deadline note").fill("Essay due tomorrow");
await page.getByRole("button", { name: "Mark dates" }).click();
await page.getByRole("button", { name: "Add to calendar" }).last().click();
await page.waitForFunction(
  (iso) => document.querySelector(`[data-date="${iso}"]`)?.getAttribute("data-count") === "1",
  tomorrow,
);
const coming = await page.locator("#coming-up").innerText();
check("coming up lists tomorrow", /essay/i.test(coming) && /tomorrow/i.test(coming), coming);
check("reminder due badge", coming.includes("Reminder due"));

await page.locator("#coming-up select").selectOption("none");
await page.waitForFunction(() => !document.querySelector("#coming-up")?.innerText.includes("Reminder due"));
check("reminder can be turned off", true);

await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector("#calendar");
check(
  "refresh keeps the homework",
  (await page.locator('[data-date="2026-11-14"]').getAttribute("data-count")) === "1",
);
check("refresh keeps tomorrow", (await page.locator("#coming-up").innerText()).includes("Essay"));
check("refresh keeps the edited reminder", (await page.locator("#coming-up select").inputValue()) === "none");

await page.getByLabel("Deadline note").fill("Homework 1 due Nov 21. Quiz Nov 18 10am");
await page.getByRole("button", { name: "Mark dates" }).click();
await page.getByRole("button", { name: "Add all" }).click();
await page.waitForFunction(() => document.querySelector('[data-date="2026-11-21"]')?.getAttribute("data-count") === "1");
check("second date from one note", (await page.locator('[data-date="2026-11-18"]').getAttribute("data-count")) === "1");
await page.locator('[data-date="2026-11-18"]').click();
check("quiz time is on the day", (await page.locator(".day-card").innerText()).includes("10:00"));

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
await writeFile(`${outDir}/sheet.png`, png);
await page.locator('input[type="file"]').setInputFiles(`${outDir}/sheet.png`);
await page.getByRole("button", { name: "Mark dates" }).click();
await page.getByText("OPENAI_API_KEY").last().waitFor();
check("photo without a key explains the secret", (await page.locator("#chat").innerText()).includes("Nothing from the picture was saved"));

await page.getByLabel("Deadline note").fill("Reading due 2026-11-19");
await page.locator('input[type="file"]').setInputFiles(`${outDir}/sheet.png`);
await page.getByRole("button", { name: "Mark dates" }).click();
await page.getByRole("button", { name: "Add to calendar" }).last().waitFor();
check("typed date still offered when the photo cannot be read", (await page.locator("#chat").innerText()).includes("photo was not read"));
await page.getByRole("button", { name: "Add to calendar" }).last().click();
await page.waitForFunction(() => document.querySelector('[data-date="2026-11-19"]')?.getAttribute("data-count") === "1");

await page.getByLabel("Deadline note").fill("the thing for chem is kinda soon I think");
await page.getByRole("button", { name: "Mark dates" }).click();
await page.getByText(/OPENAI_API_KEY/).last().waitFor();

await context.grantPermissions(["notifications"]);
await page.getByRole("button", { name: "Turn on reminders" }).click();
await page.getByText("Reminders on while this tab is open").waitFor();
check("reminder permission can be turned on", true);

await page.screenshot({ path: `${outDir}/desktop-filled.png`, fullPage: true });

const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
const phone = await mobile.newPage();
await phone.goto(base, { waitUntil: "networkidle" });
await phone.waitForSelector("#calendar");
await phone.getByRole("button", { name: "Essay due tomorrow" }).click();
await phone.getByRole("button", { name: "Add to calendar" }).click();
await phone.waitForFunction(
  (iso) => document.querySelector(`[data-date="${iso}"]`)?.getAttribute("data-count") === "1",
  tomorrow,
);
const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("mobile has no horizontal overflow", overflow <= 1, `overflow=${overflow}`);
check("mobile shows calendar, coming up, and chat", (await phone.locator("#calendar").isVisible()) && (await phone.locator("#coming-up").isVisible()) && (await phone.locator("#chat").isVisible()));
await phone.screenshot({ path: `${outDir}/mobile-filled.png`, fullPage: true });

check("no page errors", pageErrors.length === 0, pageErrors.join(" | "));
check("today is Shanghai", Boolean(today));

await browser.close();
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("verified", { today, tomorrow });
