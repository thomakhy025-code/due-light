import assert from "node:assert/strict";
import test from "node:test";
import { parseDeadlines } from "./parse-deadlines";
import type { WallClock } from "./shanghai";

const clock: WallClock = {
  year: 2026,
  month: 11,
  day: 5,
  hour: 23,
  minute: 25,
  weekday: "Thu",
  iso: "2026-11-05",
};

function titles(text: string) {
  return parseDeadlines(text, clock).map((event) => ({
    title: event.title,
    date: event.date,
    time: event.time,
    kind: event.kind,
  }));
}

test("reads obvious English deadlines in Asia/Shanghai", () => {
  assert.deepEqual(titles("Math homework due Nov 14"), [
    { title: "Math homework", date: "2026-11-14", time: null, kind: "homework" },
  ]);
  assert.deepEqual(titles("Biology test on Friday at 9:00"), [
    { title: "Biology test", date: "2026-11-06", time: "09:00", kind: "test" },
  ]);
  assert.deepEqual(titles("Essay due tomorrow"), [
    { title: "Essay", date: "2026-11-06", time: null, kind: "homework" },
  ]);
  assert.deepEqual(titles("CS midterm December 2, 2026 2pm"), [
    { title: "CS midterm", date: "2026-12-02", time: "14:00", kind: "test" },
  ]);
  assert.deepEqual(titles("Problem set 3 due 2026-11-20"), [
    { title: "Problem set 3", date: "2026-11-20", time: null, kind: "homework" },
  ]);
  assert.deepEqual(titles("Physics quiz next Monday 10:30"), [
    { title: "Physics quiz", date: "2026-11-09", time: "10:30", kind: "test" },
  ]);
  assert.deepEqual(titles("Quiz Friday 10:00"), [
    { title: "Quiz", date: "2026-11-06", time: "10:00", kind: "test" },
  ]);
  assert.deepEqual(titles("Final exam Jan 8"), [
    { title: "Final exam", date: "2027-01-08", time: null, kind: "test" },
  ]);
});

test("keeps today's month name on today instead of rolling a year", () => {
  assert.deepEqual(titles("homework due Nov 5"), [
    { title: "Homework", date: "2026-11-05", time: null, kind: "homework" },
  ]);
});

test("splits two deadlines in one note", () => {
  assert.deepEqual(titles("Math hw due Nov 14. Bio quiz on Nov 16 at 9am"), [
    { title: "Math hw", date: "2026-11-14", time: null, kind: "homework" },
    { title: "Bio quiz", date: "2026-11-16", time: "09:00", kind: "test" },
  ]);
  assert.deepEqual(titles("homework due Friday and test on Monday"), [
    { title: "Homework", date: "2026-11-06", time: null, kind: "homework" },
    { title: "Test", date: "2026-11-09", time: null, kind: "test" },
  ]);
});

test("reads ordinals, relative days, and syllabus lines", () => {
  assert.deepEqual(titles("essay due on the 14th at 3:30pm"), [
    { title: "Essay", date: "2026-11-14", time: "15:30", kind: "homework" },
  ]);
  assert.deepEqual(titles("the 2nd problem set due Friday"), [
    { title: "2nd problem set", date: "2026-11-06", time: null, kind: "homework" },
  ]);
  assert.deepEqual(titles("HW due tmrw 8pm"), [
    { title: "HW", date: "2026-11-06", time: "20:00", kind: "homework" },
  ]);
  assert.deepEqual(
    titles("Math\nHomework 1 due Nov 14\nHomework 2 due Nov 21\nQuiz Nov 18 10am").map((event) => event.date),
    ["2026-11-14", "2026-11-21", "2026-11-18"],
  );
});

test("reads Chinese dates and weekdays without calling a model", () => {
  assert.deepEqual(titles("数学作业11月14日"), [
    { title: "数学作业", date: "2026-11-14", time: null, kind: "homework" },
  ]);
  assert.deepEqual(titles("物理测验下周一上午10点"), [
    { title: "物理测验", date: "2026-11-09", time: "10:00", kind: "test" },
  ]);
  assert.equal(titles("后天交作业")[0]?.date, "2026-11-07");
});

test("a course code becomes the title and 0440 stays 04:40", () => {
  assert.deepEqual(titles("i have lang3030 on 7 nov 0440"), [
    { title: "LANG3030", date: "2026-11-07", time: "04:40", kind: "homework" },
  ]);
  assert.equal(titles("LANG3030 quiz on November 9 at 15:30")[0]?.title, "LANG3030");
  assert.equal(titles("Essay due Nov 14")[0]?.title, "Essay");
});

test("ignores notes with no date and bare times", () => {
  assert.deepEqual(titles("hello there"), []);
  assert.deepEqual(titles("see you at 5"), []);
  assert.deepEqual(titles("the thing for chem is kinda soon I think"), []);
});
