import { colors } from '../ui/theme';
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, View } from 'react-native';
import { Pressable, Text, TextInput } from '../ui/primitives';
import { apiFetch } from "../lib/api";

interface CourseAttendance {
  student: {
    attendanceRate: number;
    sessions: {
      sessionId: string;
      onDate: string;
      startsAt: string;
      endsAt: string;
      kind: "class" | "exam";
      title: string | null;
      roomName?: string;
      firstSeenAt?: string | null;
      imageUrl?: string | null;
      status:
        "present" | "late" | "absent" | "leave" | "pending" | "unrecorded";
    }[];
  };
}

const STATUS = {
  present: "มาเรียน",
  late: "มาสาย",
  absent: "ขาด",
  leave: "ลา",
  pending: "รอตรวจ (ยังไม่ยืนยัน)",
  unrecorded: "ยังไม่มีผล",
};
const time = (value: string) =>
  new Date(value).toLocaleTimeString("th-TH", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
  });

export function AttendanceCourseSection({ courseId }: { courseId: string }) {
  const [kind, setKind] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [query, setQuery] = useState("kind=all");
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<CourseAttendance | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setData(null);
    setError(null);
    apiFetch<CourseAttendance>(
      `/me/reports/attendance/${encodeURIComponent(courseId)}?${query}`,
    )
      .then((result) => {
        if (active) setData(result);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error ? cause.message : "โหลดรายละเอียดไม่สำเร็จ",
          );
      });
    return () => {
      active = false;
    };
  }, [courseId, query, reload]);

  return (
    <View style={{ gap: 16, marginTop: 16 }}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {[
          ["all", "ทั้งหมด"],
          ["class", "คาบเรียน"],
          ["exam", "คาบสอบ"],
        ].map(([value, label]) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityState={{ selected: kind === value }}
            onPress={() => setKind(value)}
          >
            <Text
              style={{
                color: kind === value ? colors.action : colors.muted,
                padding: 12,
                minHeight: 48,
              }}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        accessibilityLabel="วันที่เริ่มต้น"
        placeholder="ตั้งแต่ YYYY-MM-DD"
        value={startDate}
        onChangeText={setStartDate}
        autoCapitalize="none"
        style={{ minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.outline, padding: 12 }}
      />
      <TextInput
        accessibilityLabel="วันที่สิ้นสุด"
        placeholder="ถึง YYYY-MM-DD"
        value={endDate}
        onChangeText={setEndDate}
        autoCapitalize="none"
        style={{ minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.outline, padding: 12 }}
      />
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          const params = new URLSearchParams({ kind });
          if (startDate.trim()) params.set("startDate", startDate.trim());
          if (endDate.trim()) params.set("endDate", endDate.trim());
          setQuery(params.toString());
          setReload((value) => value + 1);
        }}
      >
        <Text style={{ color: colors.action, padding: 8 }}>แสดงผล / โหลดใหม่</Text>
      </Pressable>
      {error ? (
        <Text style={{ color: colors.danger }}>{error}</Text>
      ) : !data ? (
        <ActivityIndicator accessibilityLabel="กำลังโหลดรายละเอียด" />
      ) : (
        <>
          <Text>อัตราการเข้าเรียน: {data.student.attendanceRate}%</Text>
          {data.student.sessions.length === 0 && (
            <Text>ไม่มีคาบตามตัวกรองนี้</Text>
          )}
          {data.student.sessions.map((session) => (
            <View
              key={session.sessionId}
              style={{
                borderTopWidth: 1,
                borderColor: colors.border,
                paddingTop: 8,
                gap: 4,
              }}
            >
              <Text>
                {session.onDate} ·{" "}
                {session.kind === "exam" ? "คาบสอบ" : "คาบเรียน"}
                {session.title ? ` · ${session.title}` : ""}
              </Text>
              <Text>
                {time(session.startsAt)}–{time(session.endsAt)} · ห้อง{" "}
                {session.roomName ?? "-"}
              </Text>
              <Text>{STATUS[session.status]}</Text>
              <Text>
                พบครั้งแรก:{" "}
                {session.firstSeenAt ? time(session.firstSeenAt) : "-"}
              </Text>
              {session.imageUrl ? (
                <Image
                  source={{ uri: session.imageUrl }}
                  accessibilityLabel="ภาพเช็กชื่อของฉัน"
                  style={{ width: 160, height: 160 }}
                  resizeMode="contain"
                />
              ) : (
                <Text>ไม่มีภาพเช็กชื่อ</Text>
              )}
            </View>
          ))}
          <Text style={{ color: colors.muted }}>หากภาพหมดอายุ ให้กดโหลดใหม่</Text>
        </>
      )}
    </View>
  );
}
