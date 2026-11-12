import { SelectField } from '../ui/SelectField';
import { colors, typography, workspace } from '../ui/theme';
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, RefreshControl, StyleSheet, View } from 'react-native';
import { Pressable, ScrollView, Text, TextInput } from '../ui/primitives';
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { apiFetch } from "../lib/api";
import { previewErrorMessage } from "../lib/errors";
import {
  discardLeaveEvidence,
  formatLeaveSession,
  LEAVE_STATUS_LABEL,
  OCR_STATUS_LABEL,
  submitLeave,
  previewLeave,
  EMPTY_DOCUMENT_DETAILS,
  DOCUMENT_FIELDS,
  type DocumentDetails,
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
  const [documentDetails, setDocumentDetails] = useState<DocumentDetails>({ ...EMPTY_DOCUMENT_DETAILS });
  const [evidence, setEvidence] = useState<{ uri: string; fileName: string } | null>(
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
      setReason(current => current.trim() ? current : draft.reason);
      setDocumentDetails(current => Object.fromEntries(
        DOCUMENT_FIELDS.map(([key]) => [key, current[key] || draft.documentDetails[key] || '']),
      ) as unknown as DocumentDetails);
    } catch (e) {
      setOcrError(previewErrorMessage(e));
    } finally {
      setReading(false);
    }
  }

  async function pickEvidence(source: "camera" | "photos" | "files") {
    if (busy || reading) return;
    setBusy(true);
    setError(null);
    let candidateUri: string | null = null;
    try {
      let fileName: string;
      if (source === "files") {
        const result = await DocumentPicker.getDocumentAsync({
          type: ["application/pdf", "image/jpeg", "image/png"],
          copyToCacheDirectory: true,
          multiple: false,
        });
        if (result.canceled) return;
        const asset = result.assets[0];
        candidateUri = asset.uri;
        fileName = asset.name;
        if (!/\.(pdf|jpe?g|png)$/i.test(fileName)) {
          setError("กรุณาเลือกไฟล์ PDF, JPG หรือ PNG");
          return;
        }
      } else {
        if (source === "camera") {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) {
            setError("กรุณาอนุญาตกล้องในการตั้งค่า หรือเลือกหลักฐานจากคลังภาพหรือไฟล์");
            return;
          }
        }
        // คุณภาพเต็ม เพราะรูปที่ถูกบีบอัดทำให้ OCR อ่านวันที่เพี้ยน
        const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], quality: 1 };
        const result = source === "camera"
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
        if (result.canceled) return;
        const asset = result.assets[0];
        const image = await ImageManipulator.manipulate(asset.uri).renderAsync();
        candidateUri = (await image.saveAsync({ format: SaveFormat.JPEG, compress: 1 })).uri;
        discardLeaveEvidence(asset.uri);
        fileName = `${(asset.fileName || "หลักฐานการลา").replace(/\.[^.]+$/, "")}.jpg`;
      }
      if (new File(candidateUri).size > MAX_EVIDENCE_BYTES) {
        setError("ไฟล์หลักฐานต้องมีขนาดไม่เกิน 25 MB");
        return;
      }
      discardLeaveEvidence(evidence?.uri ?? null);
      const uri = candidateUri;
      evidenceUri.current = uri;
      setEvidence({ uri, fileName });
      setDocumentDetails({ ...EMPTY_DOCUMENT_DETAILS });
      candidateUri = null;
      setOcrText(null);
      setOcrError(null);
      if (sessionId) await autoReadEvidence(sessionId, uri);
    } catch {
      setError("เปิดหลักฐานไม่ได้ กรุณาลองใหม่หรือเลือกวิธีแนบไฟล์อื่น");
    } finally {
      discardLeaveEvidence(candidateUri);
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
    if (busy || reading) return;
    if (!sessionId) {
      setError("กรุณาเลือกคาบที่ต้องการลา");
      return;
    }
    if (!reason.trim()) {
      setError("กรุณาระบุเหตุผลการลา");
      return;
    }
    if (!evidence) {
      setError("กรุณาเลือกหลักฐานการลา");
      return;
    }
    setBusy(true);
    setSubmitting(true);
    setError(null);
    try {
      await submitLeave(sessionId, reason.trim(), evidence.uri, documentDetails);
      discardLeaveEvidence(evidence.uri);
      evidenceUri.current = null;
      setEvidence(null);
      setOcrText(null);
      setReason("");
      setDocumentDetails({ ...EMPTY_DOCUMENT_DETAILS });
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
          <Text style={styles.help}>เลือกคาบและแนบหลักฐาน</Text>
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

        <SelectField
          label="แนบหลักฐานการลา"
          placeholder="เลือกวิธีแนบหลักฐาน"
          value={null}
          options={[
            { value: "camera", label: "ถ่ายรูป" },
            { value: "photos", label: "เลือกจากคลังภาพ" },
            { value: "files", label: "เลือกไฟล์ PDF / รูปภาพ" },
          ]}
          onChange={(source) => {
            if (source === "camera" || source === "photos" || source === "files") {
              void pickEvidence(source);
            }
          }}
          disabled={busy || reading}
        />
        {evidence && <Text accessibilityLiveRegion="polite">ไฟล์ที่เลือก: {evidence.fileName}</Text>}
        <Text style={styles.help}>รองรับ PDF, JPG และ PNG ขนาดไม่เกิน 25 MB · แนบได้ครั้งละ 1 ไฟล์</Text>
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
            <Text style={styles.help}>
              {ocrText ? "ระบบแยกข้อมูลที่อ่านพบลงฟอร์มร่างแล้ว ตรวจสอบและแก้ไขก่อนส่ง" : "ไม่พบข้อความ กรุณากรอกข้อมูลเอง"}
            </Text>
          </View>
        )}
        <Text style={styles.help}>
          OCR เป็นข้อมูลร่าง ไม่รับรองความแท้ของหลักฐาน
          การอ่านร่างยังไม่ส่งคำขอลา
        </Text>


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

        <Text style={styles.heading}>ข้อมูลร่างจากหลักฐาน</Text>
        <Text style={styles.help}>ตรวจแก้ก่อนส่ง ช่องที่อ่านไม่พบเว้นว่างได้ วันที่เหล่านี้ไม่เปลี่ยนคาบเรียนที่เลือก</Text>
        {DOCUMENT_FIELDS.map(([key, label]) => (
          <View key={key}>
            <Text>{label}</Text>
            <TextInput accessibilityLabel={label} value={documentDetails[key]}
              maxLength={key === 'facility' ? 200 : 10} editable={!busy && !reading}
              placeholder={key === 'facility' ? 'ชื่อสถานพยาบาล (ถ้ามี)' : 'YYYY-MM-DD เช่น 2026-11-08'}
              onChangeText={value => setDocumentDetails(current => ({ ...current, [key]: value }))}
              style={styles.input} />
          </View>
        ))}

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
            {DOCUMENT_FIELDS.map(([key, label]) => request.documentDetails?.[key] ? (
              <Text key={key}>{label}: {request.documentDetails[key]}</Text>
            ) : null)}
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
  container: { flexGrow: 1, width: "100%", maxWidth: 800, alignSelf: "center", padding: 24, gap: 16, backgroundColor: workspace.background },
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
  title: { ...typography.pageTitle },
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
    borderColor: colors.border,
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
    borderColor: colors.border,
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
