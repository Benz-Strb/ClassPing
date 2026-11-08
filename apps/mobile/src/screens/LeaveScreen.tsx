import { SelectField } from '../ui/SelectField';
import { colors } from '../ui/theme';
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, RefreshControl, StyleSheet, View } from 'react-native';
import { Pressable, ScrollView, Text, TextInput } from '../ui/primitives';
import * as ImagePicker from "expo-image-picker";
import { apiFetch } from "../lib/api";
import { previewErrorMessage } from "../lib/errors";
import { prepareLeaveEvidence } from "../lib/face";
import {
  discardLeaveEvidence,
  formatLeaveSession,
  LEAVE_STATUS_LABEL,
  OCR_STATUS_LABEL,
  submitLeave,
  previewLeave,
  extractLeaveReason,
} from "../lib/leave";
import type { LeaveRequest, LeaveSession } from "../lib/types";

const MAX_EVIDENCE_BYTES = 25 * 1024 * 1024;

interface Props {
  onBack?: () => void;
  // แท็บนี้เปิดอยู่ และเลขที่เพิ่มทุกครั้งที่แอปกลับมาเปิด ใช้โหลดข้อมูลใหม่
  active?: boolean;
  focusTick?: number;
}

export function LeaveScreen({ onBack, active = true, focusTick = 0 }: Props) {
  const [refreshing, setRefreshing] = useState(false);
  const [sessions, setSessions] = useState<LeaveSession[] | null>(null);
  const [requests, setRequests] = useState<LeaveRequest[] | null>(null);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState<ImagePicker.ImagePickerAsset | null>(
    null,
  );
  const evidenceUri = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reading, setReading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // ข้อความโหลดไม่สำเร็จแยกจากข้อความตรวจฟอร์ม ล้างเมื่อโหลดสำเร็จ
  const [loadError, setLoadError] = useState<string | null>(null);

  async function load() {
    const [nextSessions, nextRequests] = await Promise.all([
      apiFetch<LeaveSession[]>("/leave-requests/sessions"),
      apiFetch<LeaveRequest[]>("/leave-requests/mine"),
    ]);
    setSessions(nextSessions);
    setRequests(nextRequests);
    setLoadError(null);
  }

  useEffect(() => {
    if (!active) return;
    load().catch((e: unknown) =>
      setLoadError(e instanceof Error ? e.message : "โหลดระบบลาไม่สำเร็จ"),
    );
  }, [active, focusTick]);

  useEffect(() => () => discardLeaveEvidence(evidenceUri.current), []);

  const availableSessions = useMemo(() => {
    // คำขอที่ถูกปฏิเสธยื่นคาบเดิมใหม่ได้
    const requested = new Set(
      requests
        ?.filter((request) => request.status !== "rejected")
        .map((request) => request.sessionId) ?? [],
    );
    return sessions?.filter((session) => !requested.has(session.id)) ?? [];
  }, [requests, sessions]);

  const courses = useMemo(() => Array.from(new Map(availableSessions.map(session => [session.courseId, {
    value: session.courseId,
    label: `${session.courseCode} · ${session.courseName}${session.section ? ` · กลุ่ม ${session.section}` : ''}`,
  }])).values()), [availableSessions]);
  const courseSessions = availableSessions.filter(session => session.courseId === courseId);

  async function autoReadEvidence(targetSessionId: string, uri: string) {
    setReading(true);
    setOcrError(null);
    try {
      const draft = await previewLeave(targetSessionId, uri);
      setOcrText(draft.text);
      const extractedReason = extractLeaveReason(draft.reason || draft.text);
      if (extractedReason.trim()) {
        setReason(extractedReason.trim());
      }
    } catch (e) {
      setOcrError(previewErrorMessage(e));
    } finally {
      setReading(false);
    }
  }

  async function pickEvidence() {
    if (busy || reading) return;
    setBusy(true);
    setError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.9 });
      const asset = result.canceled ? null : result.assets[0];
      if (!asset) return;
      if (asset.fileSize && asset.fileSize > MAX_EVIDENCE_BYTES) {
        discardLeaveEvidence(asset.uri);
        setError("ภาพหลักฐานต้องมีขนาดไม่เกิน 25 MB");
        return;
      }
      // API รับแค่ JPG PNG PDF ภาพจากคลังอาจเป็น HEIC จึงแปลงเป็น JPEG
      let uri: string;
      try {
        uri = await prepareLeaveEvidence(asset);
      } catch {
        discardLeaveEvidence(asset.uri);
        setError("เปิดภาพไม่สำเร็จ ลองเลือกใหม่อีกครั้ง");
        return;
      }
      discardLeaveEvidence(asset.uri);
      discardLeaveEvidence(evidence?.uri ?? null);
      evidenceUri.current = uri;
      setEvidence({ ...asset, uri });
      setOcrText(null);
      setOcrError(null);
      if (sessionId) {
        await autoReadEvidence(sessionId, uri);
      }
    } catch {
      setError("เปิดภาพหลักฐานไม่ได้ กรุณาลองเลือกภาพใหม่");
    } finally {
      setBusy(false);
    }
  }

  async function readEvidence() {
    if (busy || reading) return;
    if (!sessionId || !evidence) {
      setError("กรุณาเลือกคาบและหลักฐานก่อนอ่านร่าง");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await autoReadEvidence(sessionId, evidence.uri);
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (busy) return;
    if (!sessionId) {
      setError("กรุณาเลือกคาบที่ต้องการลา");
      return;
    }
    if (!reason.trim()) {
      setError("กรุณาระบุเหตุผลการลา");
      return;
    }
    if (!evidence) {
      setError("กรุณาเลือกภาพหลักฐานการลา");
      return;
    }
    setBusy(true);
    setSubmitting(true);
    setError(null);
    try {
      await submitLeave(sessionId, reason.trim(), evidence.uri);
      discardLeaveEvidence(evidence.uri);
      evidenceUri.current = null;
      setEvidence(null);
      setOcrText(null);
      setReason("");
      setSessionId(null);
      setCourseId(null);
      setOcrError(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ส่งคำขอลาไม่สำเร็จ");
    } finally {
      setSubmitting(false);
      setBusy(false);
    }
  }

  if (sessions === null || requests === null) {
    return (
      <View style={styles.center}>
        {loadError ? <>
          <Text accessibilityRole="alert" style={styles.error}>{loadError}</Text>
          <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => {
            setLoadError(null);
            void load().catch((cause: unknown) => setLoadError(cause instanceof Error ? cause.message : "โหลดระบบลาไม่สำเร็จ"));
          }}><Text>ลองใหม่</Text></Pressable>
        </> : <ActivityIndicator color={colors.action} />}
        {onBack && <Pressable style={styles.secondary} onPress={onBack}>
          <Text>กลับหน้าบัญชี</Text>
        </Pressable>}
      </View>
    );
  }

  return (
    <ScrollView
      automaticallyAdjustKeyboardInsets
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.action}
          onRefresh={() => {
            setRefreshing(true);
            load()
              .catch((e: unknown) =>
                setLoadError(e instanceof Error ? e.message : "โหลดระบบลาไม่สำเร็จ"),
              )
              .finally(() => setRefreshing(false));
          }}
        />
      }
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>ยื่นคำขอลา</Text>
          <Text style={styles.help}>เลือกคาบและแนบภาพหลักฐาน</Text>
        </View>
        {onBack && <Pressable style={styles.secondary} onPress={onBack}>
          <Text>กลับ</Text>
        </Pressable>}
      </View>
      {loadError && <Text style={styles.error}>{loadError}</Text>}
      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.card}>
        {availableSessions.length === 0 ? <Text style={styles.help}>ไม่มีคาบที่ยื่นลาได้</Text> : <>
          <SelectField label="รายวิชา" placeholder="เลือกรายวิชาที่ต้องการลา" value={courseId}
            options={courses} disabled={busy}
            onChange={value => { setCourseId(value); setSessionId(null); }} />
          <SelectField key={courseId ?? 'no-course'} label="คาบเรียน" placeholder={courseId ? 'เลือกวันและคาบเรียน' : 'เลือกรายวิชาก่อน'}
            value={sessionId} options={courseSessions.map(session => ({ value: session.id,
              label: `${session.kind === 'exam' ? 'สอบ · ' : ''}${formatLeaveSession(session).split('\n').slice(1).join('\n')}${session.title ? ` · ${session.title}` : ''}`,
            }))} onChange={(value) => {
              setSessionId(value);
              if (value && evidence && !reason.trim() && !reading) {
                setBusy(true);
                void autoReadEvidence(value, evidence.uri).finally(() => setBusy(false));
              }
            }} disabled={busy || !courseId} />
        </>}

        <Text style={styles.heading}>ระบุเหตุผล</Text>
        <TextInput
          accessibilityLabel="เหตุผลการลา"
          multiline
          maxLength={1000}
          value={reason}
          onChangeText={setReason}
          editable={!busy}
          placeholder="เช่น มีไข้สูง แพทย์ให้พักรักษาตัว"
          style={styles.input}
        />

        <Text style={styles.heading}>แนบภาพหลักฐาน</Text>
        <Pressable
          style={styles.secondary}
          onPress={pickEvidence}
          disabled={busy}
        >
          <Text>
            {evidence
              ? evidence.fileName || "เลือกภาพแล้ว"
              : "เลือกภาพจากเครื่อง"}
          </Text>
        </Pressable>
        <Text style={styles.help}>รองรับ JPG/PNG ขนาดไม่เกิน 25 MB</Text>
        {reading ? (
          <View style={styles.readingStatus}>
            <ActivityIndicator color={colors.action} />
            <Text style={styles.readingText}>กำลังอ่านข้อความจากหลักฐานอัตโนมัติ...</Text>
          </View>
        ) : (
          <Pressable
            style={styles.secondary}
            onPress={readEvidence}
            disabled={busy || !sessionId || !evidence}
          >
            <Text>{ocrText !== null ? "อ่านหลักฐานช่วยกรอกเหตุผลอีกครั้ง" : "อ่านหลักฐานช่วยกรอกเหตุผล"}</Text>
          </Pressable>
        )}
        {ocrError && <Text accessibilityRole="alert" style={styles.error}>{ocrError}</Text>}
        {ocrText !== null && (
          <View accessibilityLiveRegion="polite">
            <Text>{ocrText || "ไม่พบข้อความ กรุณากรอกเหตุผลเอง"}</Text>
            <Text style={styles.help}>
              ระบบนำข้อความจากหลักฐานมาใส่ในช่องเหตุผลด้านบนแล้ว ตรวจสอบหรือแก้ไขได้ก่อนส่ง
            </Text>
          </View>
        )}
        <Text style={styles.help}>
          OCR เป็นข้อมูลร่าง ไม่รับรองความแท้ของหลักฐาน
          การอ่านร่างยังไม่ส่งคำขอลา
        </Text>

        <Pressable
          style={[styles.primary, (busy || reading) && styles.disabled]}
          onPress={submit}
          disabled={busy || reading || availableSessions.length === 0}
        >
          {submitting ? (
            <ActivityIndicator color={colors.surface} />
          ) : (
            <Text style={styles.primaryText}>ส่งคำขอลา</Text>
          )}
        </Pressable>
      </View>

      <Text style={styles.heading}>คำขอลาของฉัน</Text>
      {requests.length === 0 ? (
        <Text style={styles.help}>ยังไม่มีคำขอลา</Text>
      ) : (
        requests.map((request) => (
          <View key={request.id} style={styles.card}>
            <View style={styles.requestHeader}>
              <Text style={styles.requestTitle}>
                {request.session.courseCode}
              </Text>
              <Text style={styles.status}>
                {LEAVE_STATUS_LABEL[request.status]}
              </Text>
            </View>
            <Text>{formatLeaveSession(request.session)}</Text>
            <Text>เหตุผล: {request.reason}</Text>
            <Text style={styles.help}>
              OCR: {OCR_STATUS_LABEL[request.ocrStatus]}
            </Text>
            {request.reviewNote && (
              <Text>หมายเหตุจากอาจารย์: {request.reviewNote}</Text>
            )}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, width: "100%", maxWidth: 800, alignSelf: "center", padding: 24, gap: 16, backgroundColor: colors.background },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: { fontSize: 27, lineHeight: 38, fontWeight: "500", color: colors.identity },
  heading: { fontSize: 17, fontWeight: "500", marginTop: 12, color: colors.identity },
  help: { color: colors.muted, lineHeight: 20 },
  error: {
    color: colors.danger,
    backgroundColor: colors.dangerBg,
    padding: 12,
    borderRadius: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 20,
    gap: 14,
  },
  input: {
    color: colors.ink, backgroundColor: colors.surface,
    minHeight: 90,
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: 12,
    padding: 12,
    textAlignVertical: "top",
  },
  primary: {
    minHeight: 48, justifyContent: "center",
    backgroundColor: colors.action,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  primaryText: { color: colors.surface, fontSize: 16, fontWeight: "500" },
  secondary: {
    minHeight: 48, justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
  },
  disabled: { opacity: 0.5 },
  requestHeader: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  requestTitle: { fontSize: 16, fontWeight: "600" },
  status: {
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  readingStatus: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
  },
  readingText: {
    color: colors.action,
    fontWeight: "500",
  },
});
