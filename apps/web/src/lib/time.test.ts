import assert from "node:assert/strict";
import test from "node:test";
import { bangkokDate, formatBuddhistDate, bangkokTimeToIso, chooseBackAt, formatTime } from "./time.ts";

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

const SESSION = {
  onDate: "2026-10-05",
  startsAt: "2026-10-05T02:00:00Z",
  endsAt: "2026-10-05T05:00:00Z",
};

test("ไม่แก้เวลากลับ ส่งค่าเดิมทั้งวินาที", () => {
  const original = "2026-10-05T03:16:20.000Z"; // 10:16 ไทย
  assert.equal(chooseBackAt(original, "10:16", SESSION), original);
});

test("เวลาที่กล้องประตูเสนอแล้วรับไว้ตามเดิม ยังมีวินาที", () => {
  const suggested = "2026-10-05T03:05:45.000Z";
  assert.equal(chooseBackAt(suggested, formatTime(suggested), SESSION), suggested);
});

test("แก้เวลากลับ แปลงจาก HH:mm", () => {
  const original = "2026-10-05T03:16:20.000Z";
  assert.equal(chooseBackAt(original, "10:20", SESSION), "2026-10-05T03:20:00.000Z");
  assert.equal(chooseBackAt(null, "10:20", SESSION), "2026-10-05T03:20:00.000Z");
});

test("วันที่ไทยหลัง 07:00 UTC ของวันก่อนนับเป็นวันถัดไป", () => {
  assert.equal(bangkokDate(new Date("2026-10-28T19:00:00Z")), "2026-10-29");
  assert.equal(bangkokDate(new Date("2026-10-28T16:59:00Z")), "2026-10-28");
});

test("แสดงวันที่เป็น พ.ศ.", () => {
  assert.equal(formatBuddhistDate("2026-11-07"), "7 พ.ย. 2569");
  assert.equal(formatBuddhistDate("ไม่ใช่วันที่"), "ไม่ใช่วันที่");
});
