"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import { addDays, bangkokDate, formatDate, formatTime, WEEKDAYS } from "@/lib/time";
import type { Override, Room, Schedule, SessionView } from "@/lib/types";

interface Data {
  schedules: Schedule[];
  rooms: Room[];
  sessions: SessionView[];
  overrides: Override[];
}

interface SlotForm {
  weekday: number;
  startTime: string;
  endTime: string;
  roomId: string;
}

type DayRow =
  | { kind: "session"; key: string; session: SessionView; changed: boolean }
  | { kind: "cancelled"; key: string; schedule: Schedule; onDate: string };

const STATUS = {
  upcoming: { label: "ยังไม่เริ่ม", className: "bg-gray-100 text-gray-700" },
  live: { label: "กำลังเรียน", className: "bg-green-100 text-green-800" },
  ended: { label: "จบแล้ว", className: "bg-gray-100 text-gray-500" },
};

export function ScheduleView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<SlotForm | null>(null);
  const [changing, setChanging] = useState<{ session: SessionView; form: SlotForm } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const from = bangkokDate(new Date());
    const to = addDays(from, 6);
    const range = `from=${from}&to=${to}`;
    Promise.all([
      apiFetch<Schedule[]>(`/courses/${id}/schedules`),
      apiFetch<Room[]>("/rooms"),
      apiFetch<SessionView[]>(`/courses/${id}/sessions?${range}`),
      apiFetch<Override[]>(`/courses/${id}/overrides?${range}`),
    ])
      .then(([schedules, rooms, sessions, overrides]) =>
        setData({ schedules, rooms, sessions, overrides }),
      )
      .catch(async (e: unknown) => setError(await handleApiError(e, router)));
  }, [id, router, version]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setEditing(null);
      setForm(null);
      setChanging(null);
      setVersion((v) => v + 1);
    } catch (e) {
      setError(await handleApiError(e, router));
    } finally {
      setBusy(false);
    }
  }

  if (!data) return error ? <p className="text-red-600">{error}</p> : <p>กำลังโหลด...</p>;

  const emptyForm = (): SlotForm => ({
    weekday: 1,
    startTime: "09:00",
    endTime: "12:00",
    roomId: data.rooms[0]?.id ?? "",
  });

  function saveSchedule(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;
    void run(() =>
      editing === "new"
        ? apiFetch(`/courses/${id}/schedules`, { method: "POST", body: JSON.stringify(form) })
        : apiFetch(`/schedules/${editing}`, { method: "PATCH", body: JSON.stringify(form) }),
    );
  }

  function removeSchedule(schedule: Schedule) {
    const label = `${WEEKDAYS[schedule.weekday]} ${schedule.startTime}-${schedule.endTime}`;
    if (!window.confirm(`ลบตารางวัน${label} ใช่ไหม`)) return;
    void run(() => apiFetch(`/schedules/${schedule.id}`, { method: "DELETE" }));
  }

  function cancelDay(session: SessionView) {
    if (!window.confirm(`งดสอน ${formatDate(session.onDate)} ใช่ไหม`)) return;
    void run(() =>
      apiFetch(`/schedules/${session.scheduleId}/overrides/${session.onDate}`, {
        method: "PUT",
        body: JSON.stringify({ cancelled: true }),
      }),
    );
  }

  function saveChange(event: React.FormEvent) {
    event.preventDefault();
    if (!changing) return;
    const { session, form: change } = changing;
    void run(() =>
      apiFetch(`/schedules/${session.scheduleId}/overrides/${session.onDate}`, {
        method: "PUT",
        body: JSON.stringify({
          roomId: change.roomId,
          startTime: change.startTime,
          endTime: change.endTime,
        }),
      }),
    );
  }

  function undo(scheduleId: string, onDate: string) {
    void run(() => apiFetch(`/schedules/${scheduleId}/overrides/${onDate}`, { method: "DELETE" }));
  }

  const isOverridden = (scheduleId: string | null, onDate: string) =>
    data.overrides.some((o) => o.scheduleId === scheduleId && o.onDate === onDate);

  const rows: DayRow[] = [
    ...data.sessions.map(
      (session): DayRow => ({
        kind: "session",
        key: session.id,
        session,
        changed: isOverridden(session.scheduleId, session.onDate),
      }),
    ),
    ...data.overrides
      .filter((o) => o.cancelled)
      .flatMap((o): DayRow[] => {
        const schedule = data.schedules.find((s) => s.id === o.scheduleId);
        return schedule
          ? [{ kind: "cancelled", key: `${o.scheduleId}|${o.onDate}`, schedule, onDate: o.onDate }]
          : [];
      }),
  ].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

  return (
    <section className="space-y-8">
      {error && <p className="text-red-600">{error}</p>}

      <div className="space-y-3">
        <h2 className="font-medium">ตารางประจำ</h2>
        {data.schedules.length === 0 && <p className="text-gray-600">ยังไม่มีตารางเรียน</p>}
        <ul className="divide-y rounded-lg border">
          {data.schedules.map((schedule) => (
            <li key={schedule.id} className="flex items-center justify-between px-4 py-3">
              <span>
                <span className="font-medium">{WEEKDAYS[schedule.weekday]}</span>{" "}
                {schedule.startTime}-{schedule.endTime} · {schedule.roomName}
              </span>
              <span className="space-x-3 text-sm">
                <button
                  onClick={() => {
                    setEditing(schedule.id);
                    setForm({
                      weekday: schedule.weekday,
                      startTime: schedule.startTime,
                      endTime: schedule.endTime,
                      roomId: schedule.roomId,
                    });
                  }}
                  className="text-blue-600 hover:underline"
                >
                  แก้
                </button>
                <button
                  onClick={() => removeSchedule(schedule)}
                  className="text-red-600 hover:underline"
                >
                  ลบ
                </button>
              </span>
            </li>
          ))}
        </ul>

        {form ? (
          <form onSubmit={saveSchedule} className="space-y-3 rounded-lg border p-4">
            <h3 className="font-medium">{editing === "new" ? "เพิ่มตาราง" : "แก้ตาราง"}</h3>
            <SlotFields form={form} rooms={data.rooms} onChange={setForm} withWeekday />
            <FormButtons busy={busy} onCancel={() => {
                setForm(null);
                setEditing(null);
              }} />
          </form>
        ) : (
          <button
            onClick={() => {
              setEditing("new");
              setForm(emptyForm());
            }}
            className="rounded-lg border px-4 py-2"
          >
            เพิ่มตาราง
          </button>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="font-medium">คาบ 7 วันข้างหน้า</h2>
        <p className="text-sm text-gray-600">คาบที่เริ่มไปแล้วแก้ไม่ได้</p>
        {rows.length === 0 && <p className="text-gray-600">ไม่มีคาบใน 7 วันนี้</p>}
        <ul className="divide-y rounded-lg border">
          {rows.map((row) =>
            row.kind === "cancelled" ? (
              <li key={row.key} className="flex items-center justify-between px-4 py-3">
                <span className="text-gray-500 line-through">
                  {formatDate(row.onDate)} {row.schedule.startTime}-{row.schedule.endTime}
                </span>
                <span className="space-x-3 text-sm">
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                    งดสอน
                  </span>
                  <button
                    disabled={busy}
                    onClick={() => undo(row.schedule.id, row.onDate)}
                    className="text-blue-600 hover:underline"
                  >
                    ยกเลิกงด
                  </button>
                </span>
              </li>
            ) : (
              <li key={row.key} className="space-y-3 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="font-medium">{formatDate(row.session.onDate)}</span>{" "}
                    {formatTime(row.session.startsAt)}-{formatTime(row.session.endsAt)} ·{" "}
                    {row.session.roomName}{" "}
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${STATUS[row.session.status].className}`}
                    >
                      {STATUS[row.session.status].label}
                    </span>
                    {row.changed && (
                      <span className="ml-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800">
                        เปลี่ยนแล้ว
                      </span>
                    )}
                  </span>
                  {row.session.status === "upcoming" && row.session.scheduleId && (
                    <span className="space-x-3 text-sm">
                      <button
                        disabled={busy}
                        onClick={() =>
                          setChanging({
                            session: row.session,
                            form: {
                              weekday: 0,
                              startTime: formatTime(row.session.startsAt),
                              endTime: formatTime(row.session.endsAt),
                              roomId: row.session.roomId,
                            },
                          })
                        }
                        className="text-blue-600 hover:underline"
                      >
                        เปลี่ยน
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => cancelDay(row.session)}
                        className="text-red-600 hover:underline"
                      >
                        งดสอน
                      </button>
                      {row.changed && (
                        <button
                          disabled={busy}
                          onClick={() => undo(row.session.scheduleId!, row.session.onDate)}
                          className="text-gray-600 hover:underline"
                        >
                          ใช้ตามเดิม
                        </button>
                      )}
                    </span>
                  )}
                </div>
                {changing?.session.id === row.session.id && (
                  <form onSubmit={saveChange} className="space-y-3 rounded-lg bg-gray-50 p-3">
                    <SlotFields
                      form={changing.form}
                      rooms={data.rooms}
                      onChange={(next) => setChanging({ ...changing, form: next })}
                    />
                    <FormButtons busy={busy} onCancel={() => setChanging(null)} />
                  </form>
                )}
              </li>
            ),
          )}
        </ul>
      </div>
    </section>
  );
}

function sortKey(row: DayRow) {
  return row.kind === "session"
    ? `${row.session.onDate} ${formatTime(row.session.startsAt)}`
    : `${row.onDate} ${row.schedule.startTime}`;
}

function SlotFields({
  form,
  rooms,
  onChange,
  withWeekday = false,
}: {
  form: SlotForm;
  rooms: Room[];
  onChange: (form: SlotForm) => void;
  withWeekday?: boolean;
}) {
  const input = "rounded-lg border bg-white px-3 py-2";
  return (
    <div className="flex flex-wrap gap-3">
      {withWeekday && (
        <select
          value={form.weekday}
          onChange={(e) => onChange({ ...form, weekday: Number(e.target.value) })}
          className={input}
        >
          {WEEKDAYS.map((day, i) => (
            <option key={day} value={i}>
              {day}
            </option>
          ))}
        </select>
      )}
      <input
        type="time"
        step={300}
        required
        value={form.startTime}
        onChange={(e) => onChange({ ...form, startTime: e.target.value })}
        className={input}
      />
      <span className="self-center">ถึง</span>
      <input
        type="time"
        step={300}
        required
        value={form.endTime}
        onChange={(e) => onChange({ ...form, endTime: e.target.value })}
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
  );
}

function FormButtons({ busy, onCancel }: { busy: boolean; onCancel: () => void }) {
  return (
    <div className="space-x-3">
      <button
        disabled={busy}
        className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
      >
        {busy ? "กำลังบันทึก..." : "บันทึก"}
      </button>
      <button type="button" onClick={onCancel} className="rounded-lg border px-4 py-2">
        ยกเลิก
      </button>
    </div>
  );
}
