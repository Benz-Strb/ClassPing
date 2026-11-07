import { colors } from '../ui/theme';
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Pressable, Text } from '../ui/primitives';
import { ApiError, apiFetch } from "../lib/api";
import type { AttendanceCounts, StudentAttendanceSummary } from "../lib/types";
import { AttendanceCourseSection } from "./AttendanceCourseSection";

const STATUSES: {
  key: keyof Pick<
    AttendanceCounts,
    "present" | "late" | "absent" | "leave" | "pending"
  >;
  label: string;
}[] = [
  { key: "present", label: "มาเรียน" },
  { key: "late", label: "มาสาย" },
  { key: "absent", label: "ขาด" },
  { key: "leave", label: "ลา" },
  { key: "pending", label: "รอตรวจ" },
];

function StatusCounts({ counts }: { counts: AttendanceCounts }) {
  const {fontScale} = useWindowDimensions();
  return (
    <View style={styles.statsRow}>
      {STATUSES.map((status) => (
        <View key={status.key} style={[styles.statItem, fontScale > 1.6 && styles.largeStatItem]}>
          <Text style={[styles.statNumber, styles[status.key]]}>
            {counts[status.key]}
          </Text>
          <Text style={styles.statLabel}>{status.label}</Text>
        </View>
      ))}
    </View>
  );
}

export function AttendanceSummarySection({ mode = "summary", onOpenAccount }: { mode?: "summary" | "courses"; onOpenAccount?: () => void }) {
  const [data, setData] = useState<StudentAttendanceSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setData(null);
    setError(null);
    setForbidden(false);

    apiFetch<StudentAttendanceSummary>("/me/reports/attendance")
      .then((summary) => active && setData(summary))
      .catch((cause: unknown) => {
        if (active) {
          setForbidden(cause instanceof ApiError && cause.status === 403);
          setError(cause instanceof ApiError && cause.status === 403 ? "บัญชีนี้ยังไม่มีสิทธิ์ดูสถิติการเข้าเรียน" : "ยังโหลดสถิติไม่ได้ กรุณาลองอีกครั้ง");
        }
      });

    return () => {
      active = false;
    };
  }, [reloadKey]);

  return (
    <View style={styles.section} accessibilityRole="summary">
      <Text style={styles.heading}>{mode === "courses" ? "รายวิชาของฉัน" : "สถิติการเข้าเรียน"}</Text>

      {error ? (
        <View style={[styles.messageCard, onOpenAccount && styles.homeMessage]}>
          <Text style={styles.muted}>{error}</Text>
          {(!forbidden || onOpenAccount) && <Pressable
            accessibilityRole="button"
            style={styles.retryButton}
            onPress={forbidden ? onOpenAccount : () => setReloadKey((value) => value + 1)}
          >
            <Text style={styles.retryText}>{forbidden ? "ตรวจสอบบัญชี" : "ลองใหม่"}</Text>
          </Pressable>}
        </View>
      ) : !data ? (
        <View style={[styles.messageCard, onOpenAccount && styles.homeMessage]}>
          <ActivityIndicator accessibilityLabel="กำลังโหลดสถิติการเข้าเรียน" />
          <Text style={styles.muted}>กำลังโหลดสถิติ...</Text>
        </View>
      ) : data.courses.length === 0 ? (
        <View style={[styles.messageCard, onOpenAccount && styles.homeMessage]}>
          <Text style={styles.muted}>ยังไม่มีรายวิชาที่ลงทะเบียน</Text>
        </View>
      ) : (
        <>
          {mode === "summary" && <View style={styles.overallCard}>
            <View style={styles.overallHeading}><Text style={styles.cardLabel}>อัตราการเข้าเรียนรวม</Text><Text style={styles.rate}>{data.summary.attendanceRate}%</Text></View>
            <StatusCounts counts={data.summary.counts} />
            <Text style={styles.muted}>
              รอตรวจยังไม่ใช่ผลยืนยันการเข้าเรียน
            </Text>
          </View>}

          {mode === "courses" && data.courses.map(({ course, counts }) => (
            <View key={course.id} style={styles.courseCard}>
              <Text style={styles.courseCode}>
                {course.code}
                {course.section ? ` · กลุ่ม ${course.section}` : ""}
              </Text>
              <Text style={styles.courseName}>{course.name}</Text>
              <StatusCounts counts={counts} />
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: selectedCourse === course.id }}
                onPress={() =>
                  setSelectedCourse(
                    selectedCourse === course.id ? null : course.id,
                  )
                }
              >
                <Text style={styles.retryText}>
                  {selectedCourse === course.id
                    ? "ซ่อนรายละเอียด"
                    : "ดูรายละเอียดรายคาบ"}
                </Text>
              </Pressable>
              {selectedCourse === course.id && (
                <AttendanceCourseSection courseId={course.id} />
              )}
            </View>
          ))}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  heading: { fontSize: 20, fontWeight: "500", color: colors.identity },
  messageCard: {
    minHeight: 64,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    alignItems: "flex-start",
    gap: 4,
  },
  homeMessage: { borderWidth: 0, padding: 0, minHeight: 0 },
  overallCard: {
    paddingVertical: 8,
    gap: 8,
  },
  courseCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    gap: 4,
  },
  cardLabel: { color: colors.identity, fontSize: 14 },
  overallHeading: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  rate: { color: colors.action, fontSize: 24, lineHeight: 36, fontWeight: "500" },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  statItem: { flex: 1, minWidth: 44, alignItems: "center", gap: 2 },
  largeStatItem: { minWidth: 96 },
  statNumber: { fontSize: 18, fontWeight: "700" },
  present: { color: colors.action },
  late: { color: colors.warning },
  absent: { color: colors.danger },
  leave: { color: colors.ink },
  pending: { color: colors.muted },
  statLabel: { color: colors.muted, fontSize: 12 },
  courseCode: { color: colors.ink, fontSize: 16, fontWeight: "600" },
  courseName: { color: colors.muted },
  muted: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  error: { color: colors.danger, textAlign: "center" },
  retryButton: {
    borderWidth: 1,
    borderColor: colors.selected,
    backgroundColor: colors.selected,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  retryText: { minHeight: 48, textAlignVertical: "center", paddingVertical: 12, color: colors.action, fontWeight: "600" },
});
