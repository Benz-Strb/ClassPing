"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ApiError, apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import { addDays, bangkokDate, formatDate } from "@/lib/time";
import type { Exam, Person, Room, Rules } from "@/lib/types";

interface Data {
  exams: Exam[];
  rooms: Room[];
  teachers: Person[];
  rules: Rules;
}

// ช่องตัวเลขเก็บเป็นข้อความ ให้ลบแล้วพิมพ์ใหม่ได้
interface ExamForm {
  title: string;
  date: string;
  start: string;
  end: string;
  roomId: string;
  lateAfterMin: string;
  absentAtEnd: boolean;
  absentAfterMin: string;
  proctorIds: string[];
}

const STATUS = {
  upcoming: { label: "ยังไม่เริ่ม", className: "bg-gray-100 text-gray-700" },
  live: { label: "กำลังสอบ", className: "bg-green-100 text-green-800" },
  ended: { label: "จบแล้ว", className: "bg-gray-100 text-gray-500" },
};

const statusOf = (exam: Exam, now: Date) =>
  new Date(exam.endsAt) <= now ? "ended" : new Date(exam.startsAt) <= now ? "live" : "upcoming";

const personName = (p: Person) => p.name ?? p.email;

// อาจารย์กดยกเลิกตอนถามยืนยัน ไม่ต้องขึ้น error
class Cancelled extends Error {}

export function ExamsView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  // "new" = กำลังเพิ่ม, id = กำลังแก้คาบนั้น
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<ExamForm | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      apiFetch<Exam[]>(`/courses/${id}/exams`),
      apiFetch<Room[]>("/rooms"),
      apiFetch<Person[]>("/teachers"),
      apiFetch<Rules>(`/courses/${id}/rules`),
    ])
      .then(([exams, rooms, teachers, rules]) => setData({ exams, rooms, teachers, rules }))
      .catch(async (e: unknown) => setError(await handleApiError(e, router)));
  }, [id, router, version]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setEditing(null);
      setForm(null);
      setVersion((v) => v + 1);
    } catch (e) {
      if (!(e instanceof Cancelled)) setError(await handleApiError(e, router));
    } finally {
      setBusy(false);
    }
  }

  if (!data) return error ? <p className="text-red-600">{error}</p> : <p>กำลังโหลด...</p>;

  const now = new Date();
  const upcoming = data.exams.filter((e) => statusOf(e, now) !== "ended");
  const past = data.exams.filter((e) => statusOf(e, now) === "ended").reverse();
  const lockedExam = editing && editing !== "new" ? data.exams.find((e) => e.id === editing) : null;

  function startNew() {
    setEditing("new");
    setForm({
      title: "",
      date: addDays(bangkokDate(new Date()), 7),
      start: "09:00",
      end: "12:00",
      roomId: data!.rooms[0]?.id ?? "",
      lateAfterMin: String(data!.rules.lateAfterMin),
      absentAtEnd: data!.rules.absentAfterMin === null,
      absentAfterMin: String(data!.rules.absentAfterMin ?? 30),
      proctorIds: [],
    });
  }

  function startEdit(exam: Exam) {
    setEditing(exam.id);
    setForm({
      title: exam.title,
      date: exam.onDate,
      start: exam.start,
      end: exam.end,
      roomId: exam.room.id,
      lateAfterMin: String(exam.lateAfterMin),
      absentAtEnd: exam.absentAfterMin === null,
      absentAfterMin: String(exam.absentAfterMin ?? 30),
      proctorIds: exam.proctors.map((p) => p.id),
    });
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;
    const payload = {
      title: form.title,
      date: form.date,
      start: form.start,
      end: form.end,
      roomId: form.roomId,
      lateAfterMin: Number(form.lateAfterMin),
      absentAfterMin: form.absentAtEnd ? null : Number(form.absentAfterMin),
      proctorIds: form.proctorIds,
    };
    const send = (replaceClasses: boolean) => {
      const body = JSON.stringify({ ...payload, replaceClasses });
      return editing === "new"
        ? apiFetch(`/courses/${id}/exams`, { method: "POST", body })
        : apiFetch(`/exams/${editing}`, { method: "PATCH", body });
    };
    void run(async () => {
      try {
        await send(false);
      } catch (e) {
        // ทับคาบเรียนของวิชานี้ ถามก่อนว่าจะให้คาบสอบแทนไหม
        if (!(e instanceof ApiError) || e.code !== "REPLACES_CLASS") throw e;
        if (!window.confirm(`${e.message}\n\nยืนยันไหม`)) throw new Cancelled();
        await send(true);
      }
    });
  }

  function remove(exam: Exam) {
    if (!window.confirm(`ลบคาบสอบ "${exam.title}" ใช่ไหม`)) return;
    void run(() => apiFetch(`/exams/${exam.id}`, { method: "DELETE" }));
  }

  const examRow = (exam: Exam) => {
    const status = STATUS[statusOf(exam, now)];
    return (
      <li key={exam.id} className="space-y-1 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>
            <span className="font-medium">{exam.title}</span>{" "}
            <span className={`rounded-full px-2 py-0.5 text-xs ${status.className}`}>
              {status.label}
            </span>
          </span>
          {statusOf(exam, now) !== "ended" && (
            <span className="space-x-3 text-sm">
              <button
                disabled={busy}
                onClick={() => startEdit(exam)}
                className="text-blue-600 hover:underline"
              >
                {exam.locked ? "เปลี่ยนคนคุมสอบ" : "แก้"}
              </button>
              {!exam.locked && (
                <button
                  disabled={busy}
                  onClick={() => remove(exam)}
                  className="text-red-600 hover:underline"
                >
                  ลบ
                </button>
              )}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-700">
          {formatDate(exam.onDate)} {exam.start}-{exam.end} · {exam.room.name} · สายหลัง{" "}
          {exam.lateAfterMin} นาที ·{" "}
          {exam.absentAfterMin === null ? "ขาดเมื่อหมดคาบ" : `ขาดหลัง ${exam.absentAfterMin} นาที`}
        </p>
        <p className="text-sm text-gray-600">
          คุมสอบ:{" "}
          {exam.proctors.length ? exam.proctors.map(personName).join(", ") : "ยังไม่ได้เลือก"}
        </p>
      </li>
    );
  };

  return (
    <section className="space-y-8">
      {error && <p className="text-red-600">{error}</p>}

      <div className="space-y-3">
        <h2 className="font-medium">คาบสอบ</h2>
        <p className="text-sm text-gray-600">
          กล้องหน้าห้องเช็คชื่อด้วยใบหน้าเหมือนคาบเรียน
        </p>
        {upcoming.length === 0 && <p className="text-gray-600">ยังไม่มีคาบสอบ</p>}
        {upcoming.length > 0 && <ul className="divide-y rounded-lg border">{upcoming.map(examRow)}</ul>}

        {form ? (
          <form onSubmit={save} className="space-y-4 rounded-lg border p-4">
            <h3 className="font-medium">
              {editing === "new" ? "เพิ่มคาบสอบ" : lockedExam?.locked ? "เปลี่ยนคนคุมสอบ" : "แก้คาบสอบ"}
            </h3>
            {lockedExam?.locked && (
              <p className="text-sm text-gray-600">กล้องเริ่มเช็คชื่อแล้ว แก้ได้แค่คนคุมสอบ</p>
            )}
            <ExamFields
              form={form}
              rooms={data.rooms}
              locked={!!lockedExam?.locked}
              onChange={setForm}
            />
            <Proctors
              teachers={data.teachers}
              selected={form.proctorIds}
              onChange={(proctorIds) => setForm({ ...form, proctorIds })}
            />
            <div className="space-x-3">
              <button
                disabled={busy}
                className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
              >
                {busy ? "กำลังบันทึก..." : "บันทึก"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setForm(null);
                  setEditing(null);
                }}
                className="rounded-lg border px-4 py-2"
              >
                ยกเลิก
              </button>
            </div>
          </form>
        ) : (
          <button onClick={startNew} className="rounded-lg border px-4 py-2">
            เพิ่มคาบสอบ
          </button>
        )}
      </div>

      {past.length > 0 && (
        <div className="space-y-3">
          <h2 className="font-medium">สอบไปแล้ว</h2>
          <ul className="divide-y rounded-lg border">{past.map(examRow)}</ul>
        </div>
      )}
    </section>
  );
}

function ExamFields({
  form,
  rooms,
  locked,
  onChange,
}: {
  form: ExamForm;
  rooms: Room[];
  locked: boolean;
  onChange: (form: ExamForm) => void;
}) {
  const input = "rounded-lg border bg-white px-3 py-2 disabled:bg-gray-100";
  return (
    <fieldset disabled={locked} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm font-medium">ชื่อการสอบ</span>
        <input
          required
          maxLength={100}
          placeholder="เช่น สอบกลางภาค"
          value={form.title}
          onChange={(e) => onChange({ ...form, title: e.target.value })}
          className={`${input} w-full`}
        />
      </label>
      <div className="flex flex-wrap gap-3">
        <input
          type="date"
          required
          value={form.date}
          onChange={(e) => onChange({ ...form, date: e.target.value })}
          className={input}
        />
        <input
          type="time"
          step={300}
          required
          value={form.start}
          onChange={(e) => onChange({ ...form, start: e.target.value })}
          className={input}
        />
        <span className="self-center">ถึง</span>
        <input
          type="time"
          step={300}
          required
          value={form.end}
          onChange={(e) => onChange({ ...form, end: e.target.value })}
          className={input}
        />
        <select
          required
          value={form.roomId}
          onChange={(e) => onChange({ ...form, roomId: e.target.value })}
          className={input}
        >
          {rooms.map((room) => (
            <option key={room.id} value={room.id}>
              {room.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap items-end gap-6">
        <label className="block space-y-1">
          <span className="text-sm font-medium">สายหลัง (นาที)</span>
          <input
            type="number"
            min={0}
            max={240}
            required
            value={form.lateAfterMin}
            onChange={(e) => onChange({ ...form, lateAfterMin: e.target.value })}
            className={`${input} block w-28`}
          />
        </label>
        <div className="space-y-1">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.absentAtEnd}
              onChange={(e) => onChange({ ...form, absentAtEnd: e.target.checked })}
            />
            นับขาดตอนหมดคาบ
          </label>
          {!form.absentAtEnd && (
            <label className="block space-y-1">
              <span className="text-sm font-medium">ขาดหลัง (นาที)</span>
              <input
                type="number"
                min={1}
                max={240}
                required
                value={form.absentAfterMin}
                onChange={(e) => onChange({ ...form, absentAfterMin: e.target.value })}
                className={`${input} block w-28`}
              />
            </label>
          )}
        </div>
      </div>
      <p className="text-sm text-gray-600">นับจากเวลาเริ่มสอบ ค่าเริ่มต้นเอามาจากเกณฑ์ของวิชา</p>
    </fieldset>
  );
}

function Proctors({
  teachers,
  selected,
  onChange,
}: {
  teachers: Person[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">อาจารย์คุมสอบ</legend>
      {teachers.length === 0 ? (
        <p className="text-sm text-gray-600">
          ยังไม่มีอาจารย์ในระบบ อาจารย์ต้องเข้าสู่ระบบก่อนถึงจะเลือกได้
        </p>
      ) : (
        <div className="grid gap-1 sm:grid-cols-2">
          {teachers.map((t) => (
            <label key={t.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(t.id)}
                onChange={(e) =>
                  onChange(
                    e.target.checked ? [...selected, t.id] : selected.filter((id) => id !== t.id),
                  )
                }
              />
              {personName(t)}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}
