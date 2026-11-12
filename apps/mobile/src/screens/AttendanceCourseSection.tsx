import { colors, typography, workspace } from '../ui/theme';
import { useEffect, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import { Pressable, Text, TextInput } from '../ui/primitives';
import { apiFetch } from "../lib/api";
import { formatBuddhistDate, formatOutOfRoom, formatRate, parseFilterDate } from "../lib/attendance";
import type { AttendanceCounts } from "../lib/types";

interface CourseAttendance {
  student: {
    counts: AttendanceCounts;
    attendanceRate: number;
    outOfRoomSeconds?: number;
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
      outOfRoomSeconds?: number;
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
  const [statusFilter, setStatusFilter] = useState<keyof typeof STATUS | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [kind, setKind] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [filterError, setFilterError] = useState<string | null>(null);
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

  const sessions = data?.student.sessions.filter(session => !statusFilter || session.status === statusFilter) ?? [];
  const summaries = [
    { key: 'present', label: 'มาเรียน', color: colors.action },
    { key: 'late', label: 'มาสาย', color: colors.warning },
    { key: 'absent', label: 'ขาด', color: colors.danger },
    { key: 'leave', label: 'ลา', color: colors.ink },
  ] as const;

  return (
    <View style={{ gap: 16, marginTop: 16 }}>
      <Text accessibilityRole="header" style={styles.heading}>ผลเข้าเรียนของฉัน</Text>
      {data && <View style={styles.summary}>
        <Text style={styles.rate}>อัตราเข้าเรียน {formatRate(data.student.counts, data.student.attendanceRate)}</Text>
        <View style={styles.stats}>
          {summaries.map(item => <Pressable key={item.key} accessibilityLabel={`${item.label} ${data.student.counts[item.key]} คาบ`} accessibilityState={{ selected: statusFilter === item.key }} onPress={() => setStatusFilter(current => current === item.key ? null : item.key)} style={[styles.stat, statusFilter === item.key && styles.selectedStat]}>
            <Text style={[styles.count, { color: item.color }]}>{data.student.counts[item.key]}</Text><Text style={styles.statLabel}>{item.label}</Text>
          </Pressable>)}
        </View>
        <Text style={styles.note}>รอตรวจ {data.student.counts.pending} คาบ · ยังไม่ใช่ผลยืนยัน</Text>
      </View>}
      <View style={styles.toolbar}>
        <Pressable accessibilityState={{ selected: statusFilter === null }} onPress={() => setStatusFilter(null)} style={styles.filterButton}><Text style={styles.link}>ทั้งหมด</Text></Pressable>
        <Pressable accessibilityState={{ expanded: filtersOpen }} onPress={() => setFiltersOpen(value => !value)} style={styles.filterButton}><Text style={styles.link}>{filtersOpen ? 'ซ่อนตัวกรอง' : 'กรองวัน / ประเภทคาบ'}</Text></Pressable>
      </View>
      {filtersOpen && <View style={styles.filters}>
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
        placeholder="ตั้งแต่ ปปปป-ดด-วว (พ.ศ. หรือ ค.ศ.)"
        value={startDate}
        onChangeText={setStartDate}
        autoCapitalize="none"
        style={{ minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.outline, padding: 12 }}
      />
      <TextInput
        accessibilityLabel="วันที่สิ้นสุด"
        placeholder="ถึง ปปปป-ดด-วว (พ.ศ. หรือ ค.ศ.)"
        value={endDate}
        onChangeText={setEndDate}
        autoCapitalize="none"
        style={{ minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.outline, padding: 12 }}
      />
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          const start = parseFilterDate(startDate);
          const end = parseFilterDate(endDate);
          const invalid = !start.ok ? start : !end.ok ? end : null;
          if (invalid) {
            setFilterError(invalid.message);
            return;
          }
          if (start.ok && end.ok && start.value && end.value && start.value > end.value) {
            setFilterError("วันที่เริ่มต้นต้องไม่อยู่หลังวันที่สิ้นสุด");
            return;
          }
          setFilterError(null);
          const params = new URLSearchParams({ kind });
          if (start.ok && start.value) params.set("startDate", start.value);
          if (end.ok && end.value) params.set("endDate", end.value);
          setQuery(params.toString());
          setReload((value) => value + 1);
        }}
      >
        <Text style={{ color: colors.action, padding: 8 }}>แสดงผล / โหลดใหม่</Text>
      </Pressable>
      {filterError && <Text accessibilityRole="alert" style={{ color: colors.danger }}>{filterError}</Text>}
      </View>}
      {error ? (
        <View style={styles.filters}><Text accessibilityRole="alert" style={{ color: colors.danger }}>{error}</Text><Pressable style={styles.filterButton} onPress={() => setReload(value => value + 1)}><Text style={styles.link}>ลองใหม่</Text></Pressable></View>
      ) : !data ? (
        <ActivityIndicator accessibilityLabel="กำลังโหลดรายละเอียด" />
      ) : (
        <>
          {formatOutOfRoom(data.student.outOfRoomSeconds ?? 0) && (
            <Text>รวมทุกคาบ {formatOutOfRoom(data.student.outOfRoomSeconds ?? 0)}</Text>
          )}
          {sessions.length === 0 && (
            <Text>ไม่มีคาบตามสถานะหรือตัวกรองที่เลือก</Text>
          )}
          {sessions.map((session) => (
            <View
              key={session.sessionId}
              style={{
                backgroundColor: colors.surface,
                borderRadius: 16,
                padding: 16,
                gap: 8,
              }}
            >
              <Text>
                {formatBuddhistDate(session.onDate)} ·{" "}
                {session.kind === "exam" ? "คาบสอบ" : "คาบเรียน"}
                {session.title ? ` · ${session.title}` : ""}
              </Text>
              <Text>
                {time(session.startsAt)}–{time(session.endsAt)} · ห้อง{" "}
                {session.roomName ?? "-"}
              </Text>
              <Text style={[styles.status, { color: session.status === 'absent' ? colors.danger : session.status === 'late' ? colors.warning : session.status === 'present' ? colors.action : colors.ink }]}>{STATUS[session.status]}</Text>
              {formatOutOfRoom(session.outOfRoomSeconds ?? 0) && (
                <Text>{formatOutOfRoom(session.outOfRoomSeconds ?? 0)}</Text>
              )}
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

const styles = StyleSheet.create({
  heading: { ...typography.sectionTitle },
  summary: { padding: 16, borderRadius: 16, backgroundColor: colors.surface, gap: 16 },
  rate: { color: colors.ink, fontSize: 16, fontWeight: '500' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { flex: 1, minWidth: 64, minHeight: 80, padding: 8, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: workspace.background, borderRadius: 12, borderWidth: 1, borderColor: 'transparent' },
  selectedStat: { borderColor: colors.action, backgroundColor: colors.selected },
  count: { fontSize: 24, lineHeight: 34, fontWeight: '600', fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 13, lineHeight: 22, color: colors.ink },
  note: { fontSize: 13, lineHeight: 22, color: colors.muted },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  filterButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 12 },
  link: { color: colors.action, fontSize: 14, fontWeight: '500' },
  filters: { gap: 12 },
  status: { fontSize: 16, fontWeight: '600' },
});
