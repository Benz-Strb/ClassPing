import assert from "node:assert/strict";
import test from "node:test";
import { formatSession, type LeaveSession } from "./leave.ts";

const session: LeaveSession = {
  id: "session-1",
  courseId: "course-1",
  courseCode: "CS101",
  courseName: "พื้นฐานการเขียนโปรแกรม",
  section: "1",
  kind: "class",
  title: null,
  onDate: "2026-10-28",
  startsAt: "2026-10-28T02:00:00.000Z",
  endsAt: "2026-10-28T05:00:00.000Z",
  roomName: "LAB 1",
};

test("formatSession แสดงชื่อวิชา วันที่ และเวลาเริ่ม–จบตามเวลาไทย", () => {
  assert.equal(
    formatSession(session),
    "CS101 กลุ่ม 1 · พื้นฐานการเขียนโปรแกรม · 28 ต.ค. 2569 09:00–12:00 · ห้อง LAB 1",
  );
});
