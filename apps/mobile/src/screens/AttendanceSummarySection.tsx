import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { apiFetch } from "../lib/api";
import type { AttendanceCounts, StudentAttendanceSummary } from "../lib/types";

const STATUSES: {
  key: keyof Pick<AttendanceCounts, "present" | "late" | "absent" | "leave">;
  label: string;
}[] = [
  { key: "present", label: "มาเรียน" },
  { key: "late", label: "มาสาย" },
  { key: "absent", label: "ขาด" },
  { key: "leave", label: "ลา" },
];

function StatusCounts({ counts }: { counts: AttendanceCounts }) {
  return (
    <View style={styles.statsRow}>
      {STATUSES.map((status) => (
        <View key={status.key} style={styles.statItem}>
          <Text style={[styles.statNumber, styles[status.key]]}>
            {counts[status.key]}
          </Text>
          <Text style={styles.statLabel}>{status.label}</Text>
        </View>
      ))}
    </View>
  );
}

export function AttendanceSummarySection() {
  const [data, setData] = useState<StudentAttendanceSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setData(null);
    setError(null);

    apiFetch<StudentAttendanceSummary>("/me/reports/attendance")
      .then((summary) => active && setData(summary))
      .catch((cause: unknown) => {
        if (active) {
          setError(
            cause instanceof Error ? cause.message : "โหลดสถิติไม่สำเร็จ",
          );
        }
      });

    return () => {
      active = false;
    };
  }, [reloadKey]);

  return (
    <View style={styles.section} accessibilityRole="summary">
      <Text style={styles.heading}>สถิติการเข้าเรียน</Text>

      {error ? (
        <View style={styles.messageCard}>
          <Text style={styles.error}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            style={styles.retryButton}
            onPress={() => setReloadKey((value) => value + 1)}
          >
            <Text style={styles.retryText}>ลองใหม่</Text>
          </Pressable>
        </View>
      ) : !data ? (
        <View style={styles.messageCard}>
          <ActivityIndicator accessibilityLabel="กำลังโหลดสถิติการเข้าเรียน" />
          <Text style={styles.muted}>กำลังโหลดสถิติ...</Text>
        </View>
      ) : data.courses.length === 0 ? (
        <View style={styles.messageCard}>
          <Text style={styles.muted}>ยังไม่มีรายวิชาที่ลงทะเบียน</Text>
        </View>
      ) : (
        <>
          <View style={styles.overallCard}>
            <Text style={styles.cardLabel}>อัตราการเข้าเรียนรวม</Text>
            <Text style={styles.rate}>{data.summary.attendanceRate}%</Text>
            <StatusCounts counts={data.summary.counts} />
          </View>

          {data.courses.map(({ course, counts }) => (
            <View key={course.id} style={styles.courseCard}>
              <Text style={styles.courseCode}>
                {course.code}
                {course.section ? ` · กลุ่ม ${course.section}` : ""}
              </Text>
              <Text style={styles.courseName}>{course.name}</Text>
              <StatusCounts counts={counts} />
            </View>
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12, marginTop: 14 },
  heading: { fontSize: 18, fontWeight: "600", color: "#111827" },
  messageCard: {
    minHeight: 92,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  overallCard: {
    backgroundColor: "#eff6ff",
    borderWidth: 1,
    borderColor: "#bfdbfe",
    borderRadius: 8,
    padding: 16,
    gap: 8,
  },
  courseCard: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    padding: 16,
    gap: 4,
  },
  cardLabel: { color: "#374151", fontSize: 14 },
  rate: { color: "#1d4ed8", fontSize: 36, fontWeight: "700" },
  statsRow: { flexDirection: "row", marginTop: 8 },
  statItem: { flex: 1, alignItems: "center", gap: 2 },
  statNumber: { fontSize: 18, fontWeight: "700" },
  present: { color: "#15803d" },
  late: { color: "#b45309" },
  absent: { color: "#dc2626" },
  leave: { color: "#2563eb" },
  statLabel: { color: "#4b5563", fontSize: 12 },
  courseCode: { color: "#111827", fontSize: 16, fontWeight: "600" },
  courseName: { color: "#4b5563" },
  muted: { color: "#6b7280", textAlign: "center" },
  error: { color: "#dc2626", textAlign: "center" },
  retryButton: {
    borderWidth: 1,
    borderColor: "#2563eb",
    borderRadius: 8,
    padding: 8,
  },
  retryText: { color: "#2563eb", fontWeight: "600" },
});
