"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { API_URL, apiFetch } from "@/lib/api";
import { handleApiError } from "@/lib/auth-error";
import { buildReportQuery, type ReportFilters } from "@/lib/reports";
import { supabase } from "@/lib/supabase";

interface AttendanceCounts {
  present: number;
  late: number;
  absent: number;
  leave: number;
  pending: number;
  total: number;
}

interface StudentSessionStatus {
  sessionId: string;
  onDate: string;
  startsAt: string;
  endsAt: string;
  kind: "class" | "exam";
  title: string | null;
  status: "present" | "late" | "absent" | "leave" | "pending" | "unrecorded";
}

interface StudentReport {
  studentCode: string;
  fullName: string | null;
  userId: string | null;
  counts: AttendanceCounts;
  totalSessions: number;
  attendanceRate: number;
  sessions: StudentSessionStatus[];
}

interface SessionSummary {
  sessionId: string;
  onDate: string;
  startsAt: string;
  endsAt: string;
  kind: "class" | "exam";
  title: string | null;
  roomName: string;
  counts: AttendanceCounts;
}

interface ReportData {
  course: {
    id: string;
    code: string;
    name: string;
    section: string | null;
  };
  filter: {
    kind: string;
    sessionId?: string;
    startDate?: string;
    endDate?: string;
    studentCode?: string;
  };
  summary: {
    totalSessions: number;
    totalStudents: number;
    counts: AttendanceCounts;
    attendanceRate: number;
  };
  sessions: SessionSummary[];
  students: StudentReport[];
}


export default function CourseReportsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  // Filter inputs
  const [kind, setKind] = useState<"all" | "class" | "exam">("all");
  const [sessionId, setSessionId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [studentCode, setStudentCode] = useState<string>("");

  // Applied filters for query
  const [applied, setApplied] = useState<ReportFilters>({
    kind: "all" as "all" | "class" | "exam",
    sessionId: "",
    startDate: "",
    endDate: "",
    studentCode: "",
  });

  const [data, setData] = useState<ReportData | null>(null);
  const [sessionOptions, setSessionOptions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [downloading, setDownloading] = useState<"csv" | "pdf" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const queryString = buildReportQuery(applied);

    apiFetch<ReportData>(`/courses/${id}/reports/attendance${queryString}`)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        if (
          applied.kind === "all" &&
          !applied.sessionId &&
          !applied.startDate &&
          !applied.endDate &&
          !applied.studentCode
        ) {
          setSessionOptions(res.sessions);
        }
        setLoading(false);
      })
      .catch(async (e: unknown) => {
        if (cancelled) return;
        setError(await handleApiError(e, router));
        setData(null);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, applied, router]);

  function handleKindChange(newKind: "all" | "class" | "exam") {
    setKind(newKind);
    setSessionId("");
  }

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setApplied({
      kind,
      sessionId,
      startDate,
      endDate,
      studentCode,
    });
  }

  function handleReset() {
    setKind("all");
    setSessionId("");
    setStartDate("");
    setEndDate("");
    setStudentCode("");
    setError(null);
    setLoading(true);
    setApplied({
      kind: "all",
      sessionId: "",
      startDate: "",
      endDate: "",
      studentCode: "",
    });
  }

  async function handleDownload(type: "csv" | "pdf") {
    setDownloading(type);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const queryString = buildReportQuery(applied);
      const url = `${API_URL}/courses/${id}/reports/attendance/${type}${queryString}`;

      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) throw new Error("ดาวน์โหลดไฟล์ไม่สำเร็จ");

      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `attendance-report-${data?.course.code ?? id}-${new Date().toISOString().slice(0, 10)}.${type}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "เกิดข้อผิดพลาดในการดาวน์โหลด");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">รายงานสรุปการเข้าเรียน</h2>
          <p className="text-sm text-gray-500">
            ดูสถิติการเข้าเรียน มา สาย ขาด ลา และส่งออกเป็น CSV หรือ PDF
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleDownload("csv")}
            disabled={downloading !== null || loading || !data}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {downloading === "csv" ? "กำลังส่งออก..." : "📥 ส่งออก CSV"}
          </button>
          <button
            onClick={() => handleDownload("pdf")}
            disabled={downloading !== null || loading || !data}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {downloading === "pdf" ? "กำลังส่งออก..." : "📄 ส่งออก PDF"}
          </button>
        </div>
      </div>

      {/* Filter Card */}
      <form
        onSubmit={handleFilterSubmit}
        className="grid grid-cols-1 gap-4 rounded-xl border border-gray-200 bg-gray-50/70 p-4 sm:grid-cols-5"
      >
        <div>
          <label className="block text-xs font-medium text-gray-600">ประเภทคาบ</label>
          <select
            value={kind}
            onChange={(e) => handleKindChange(e.target.value as "all" | "class" | "exam")}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="all">ทั้งหมด (คาบเรียน + สอบ)</option>
            <option value="class">เฉพาะคาบเรียน</option>
            <option value="exam">เฉพาะคาบสอบ</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600">คาบเรียน</label>
          <select
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">ทุกคาบ</option>
            {sessionOptions
              .filter((session) => kind === "all" || session.kind === kind)
              .map((session) => (
                <option key={session.sessionId} value={session.sessionId}>
                  {session.onDate} · {session.kind === "exam" ? session.title ?? "สอบ" : "คาบเรียน"}
                </option>
              ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600">ตั้งแต่วันที่</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600">ถึงวันที่</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600">รหัสนักศึกษา</label>
          <div className="mt-1 flex gap-2">
            <input
              type="text"
              placeholder="เช่น 66000001"
              value={studentCode}
              onChange={(e) => setStudentCode(e.target.value)}
              className="block w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
            >
              ค้นหา
            </button>
            {(sessionId || startDate || endDate || studentCode || kind !== "all") && (
              <button
                type="button"
                onClick={handleReset}
                className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
              >
                ล้าง
              </button>
            )}
          </div>
        </div>
      </form>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      {loading ? (
        <div className="py-12 text-center text-sm text-gray-500">กำลังคำนวณรายงาน...</div>
      ) : !data ? (
        <div className="py-12 text-center text-sm text-gray-500">ไม่พบข้อมูลรายงาน</div>
      ) : (
        <>
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <span className="text-xs font-medium text-gray-500">อัตราเข้าเรียน</span>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {data.summary.attendanceRate}%
              </p>
              <span className="text-xs text-gray-400">
                {data.summary.totalStudents} คน · {data.summary.totalSessions} คาบ
              </span>
            </div>

            <div className="rounded-xl border border-green-100 bg-green-50/50 p-4">
              <span className="text-xs font-medium text-green-700">มาเรียน (Present)</span>
              <p className="mt-1 text-2xl font-bold text-green-800">
                {data.summary.counts.present}
              </p>
            </div>

            <div className="rounded-xl border border-yellow-100 bg-yellow-50/50 p-4">
              <span className="text-xs font-medium text-yellow-700">สาย (Late)</span>
              <p className="mt-1 text-2xl font-bold text-yellow-800">
                {data.summary.counts.late}
              </p>
            </div>

            <div className="rounded-xl border border-red-100 bg-red-50/50 p-4">
              <span className="text-xs font-medium text-red-700">ขาดเรียน (Absent)</span>
              <p className="mt-1 text-2xl font-bold text-red-800">
                {data.summary.counts.absent}
              </p>
            </div>

            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
              <span className="text-xs font-medium text-blue-700">ลา (Leave)</span>
              <p className="mt-1 text-2xl font-bold text-blue-800">
                {data.summary.counts.leave}
              </p>
            </div>

            <div className="rounded-xl border border-orange-100 bg-orange-50/50 p-4">
              <span className="text-xs font-medium text-orange-700">รอตรวจ (Pending)</span>
              <p className="mt-1 text-2xl font-bold text-orange-800">
                {data.summary.counts.pending}
              </p>
            </div>
          </div>

          {/* Student Breakdown Table */}
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-gray-800">
                สถิติรายบุคคล ({data.students.length} คน)
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                <thead className="bg-gray-50 text-xs font-medium text-gray-500">
                  <tr>
                    <th className="px-4 py-2.5">รหัสนักศึกษา</th>
                    <th className="px-4 py-2.5">ชื่อ-นามสกุล</th>
                    <th className="px-3 py-2.5 text-center text-green-700">มา</th>
                    <th className="px-3 py-2.5 text-center text-yellow-700">สาย</th>
                    <th className="px-3 py-2.5 text-center text-red-700">ขาด</th>
                    <th className="px-3 py-2.5 text-center text-blue-700">ลา</th>
                    <th className="px-3 py-2.5 text-center text-orange-700">รอตรวจ</th>
                    <th className="px-4 py-2.5 text-right">อัตราเข้าเรียน</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.students.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-gray-400">
                        ไม่พบข้อมูลนักศึกษาที่ตรงตามเงื่อนไข
                      </td>
                    </tr>
                  ) : (
                    data.students.map((student) => (
                      <tr key={student.studentCode} className="hover:bg-gray-50/80">
                        <td className="px-4 py-2.5 font-medium text-gray-900">
                          {student.studentCode}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">
                          {student.fullName ?? (
                            <span className="italic text-gray-400">ยังไม่เข้าสู่ระบบ</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center font-medium text-green-700">
                          {student.counts.present}
                        </td>
                        <td className="px-3 py-2.5 text-center font-medium text-yellow-700">
                          {student.counts.late}
                        </td>
                        <td className="px-3 py-2.5 text-center font-medium text-red-700">
                          {student.counts.absent}
                        </td>
                        <td className="px-3 py-2.5 text-center font-medium text-blue-700">
                          {student.counts.leave}
                        </td>
                        <td className="px-3 py-2.5 text-center font-medium text-orange-700">
                          {student.counts.pending}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold">
                          <span
                            className={
                              student.attendanceRate >= 80
                                ? "text-green-600"
                                : student.attendanceRate >= 50
                                  ? "text-yellow-600"
                                  : "text-red-600"
                            }
                          >
                            {student.attendanceRate}%
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Session Summary Table */}
          {data.sessions.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-200 px-4 py-3">
                <h3 className="text-sm font-semibold text-gray-800">
                  สรุปรายคาบ ({data.sessions.length} คาบ)
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                  <thead className="bg-gray-50 text-xs font-medium text-gray-500">
                    <tr>
                      <th className="px-4 py-2.5">วันที่</th>
                      <th className="px-4 py-2.5">ประเภท</th>
                      <th className="px-4 py-2.5">ห้องเรียน</th>
                      <th className="px-3 py-2.5 text-center text-green-700">มา</th>
                      <th className="px-3 py-2.5 text-center text-yellow-700">สาย</th>
                      <th className="px-3 py-2.5 text-center text-red-700">ขาด</th>
                      <th className="px-3 py-2.5 text-center text-blue-700">ลา</th>
                      <th className="px-3 py-2.5 text-center text-orange-700">รอตรวจ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.sessions.map((sess) => (
                      <tr key={sess.sessionId} className="hover:bg-gray-50/80">
                        <td className="px-4 py-2.5 font-medium text-gray-900">{sess.onDate}</td>
                        <td className="px-4 py-2.5">
                          {sess.kind === "exam" ? (
                            <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800">
                              สอบ: {sess.title ?? "สอบ"}
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                              คาบเรียน
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">{sess.roomName}</td>
                        <td className="px-3 py-2.5 text-center font-medium text-green-700">
                          {sess.counts.present}
                        </td>
                        <td className="px-3 py-2.5 text-center font-medium text-yellow-700">
                          {sess.counts.late}
                        </td>
                        <td className="px-3 py-2.5 text-center font-medium text-red-700">
                          {sess.counts.absent}
                        </td>
                        <td className="px-3 py-2.5 text-center font-medium text-blue-700">
                          {sess.counts.leave}
                        </td>
                        <td className="px-3 py-2.5 text-center font-medium text-orange-700">
                          {sess.counts.pending}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
