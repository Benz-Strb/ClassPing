import assert from "node:assert/strict";
import test from "node:test";
import { bangkokTimeToIso, formatTime } from "./time.ts";

test("เวลาในคาบปกติเป็นวันเดียวกันตามเวลาไทย", () => {
  const iso = bangkokTimeToIso(
    "2026-10-05",
    "10:12",
    "2026-10-05T02:00:00Z",
    "2026-10-05T05:00:00Z",
  );
  assert.equal(iso, "2026-10-05T03:12:00.000Z");
});

test("คาบข้ามเที่ยงคืน เวลาหลังเที่ยงคืนเป็นวันถัดไป", () => {
  const startsAt = "2026-10-05T16:00:00Z"; // 23:00 ไทย
  const endsAt = "2026-10-05T18:00:00Z"; // 01:00 ไทย
  const late = bangkokTimeToIso("2026-10-05", "23:30", startsAt, endsAt);
  const next = bangkokTimeToIso("2026-10-05", "00:10", startsAt, endsAt);
  assert.equal(formatTime(late), "23:30");
  assert.equal(next, "2026-10-05T17:10:00.000Z");
  assert.equal(formatTime(next), "00:10");
});

test("เวลาก่อนเริ่มคาบในคาบปกติไม่ถูกเลื่อนไปวันถัดไป", () => {
  const iso = bangkokTimeToIso(
    "2026-10-05",
    "07:00",
    "2026-10-05T02:00:00Z",
    "2026-10-05T05:00:00Z",
  );
  assert.equal(iso, "2026-10-05T00:00:00.000Z");
});
