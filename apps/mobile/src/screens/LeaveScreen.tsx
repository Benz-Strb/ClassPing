import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { apiFetch } from "../lib/api";
import {
  discardLeaveEvidence,
  formatLeaveSession,
  LEAVE_STATUS_LABEL,
  OCR_STATUS_LABEL,
  submitLeave,
} from "../lib/leave";
import type { LeaveRequest, LeaveSession } from "../lib/types";

const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

interface Props {
  onBack: () => void;
}

export function LeaveScreen({ onBack }: Props) {
  const [sessions, setSessions] = useState<LeaveSession[] | null>(null);
  const [requests, setRequests] = useState<LeaveRequest[] | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState<ImagePicker.ImagePickerAsset | null>(
    null,
  );
  const evidenceUri = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [nextSessions, nextRequests] = await Promise.all([
      apiFetch<LeaveSession[]>("/leave-requests/sessions"),
      apiFetch<LeaveRequest[]>("/leave-requests/mine"),
    ]);
    setSessions(nextSessions);
    setRequests(nextRequests);
  }

  useEffect(() => {
    load().catch((e: unknown) =>
      setError(e instanceof Error ? e.message : "โหลดระบบลาไม่สำเร็จ"),
    );
    return () => discardLeaveEvidence(evidenceUri.current);
  }, []);

  const availableSessions = useMemo(() => {
    const requested = new Set(
      requests?.map((request) => request.sessionId) ?? [],
    );
    return sessions?.filter((session) => !requested.has(session.id)) ?? [];
  }, [requests, sessions]);

  async function pickEvidence() {
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.9,
    });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    if (asset.fileSize && asset.fileSize > MAX_EVIDENCE_BYTES) {
      discardLeaveEvidence(asset.uri);
      setError("ภาพหลักฐานต้องมีขนาดไม่เกิน 10 MB");
      return;
    }
    discardLeaveEvidence(evidence?.uri ?? null);
    evidenceUri.current = asset.uri;
    setEvidence(asset);
  }

  async function submit() {
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
    setError(null);
    try {
      await submitLeave(sessionId, reason.trim(), evidence.uri);
      discardLeaveEvidence(evidence.uri);
      evidenceUri.current = null;
      setEvidence(null);
      setReason("");
      setSessionId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ส่งคำขอลาไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  if (sessions === null || requests === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable style={styles.secondary} onPress={onBack}>
          <Text>กลับหน้าบัญชี</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>ระบบลา</Text>
          <Text style={styles.help}>เลือกคาบและแนบภาพหลักฐาน</Text>
        </View>
        <Pressable style={styles.secondary} onPress={onBack}>
          <Text>กลับ</Text>
        </Pressable>
      </View>
      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.card}>
        <Text style={styles.heading}>1. เลือกคาบที่ต้องการลา</Text>
        {availableSessions.length === 0 ? (
          <Text style={styles.help}>ไม่มีคาบที่ยื่นลาได้</Text>
        ) : (
          availableSessions.map((session) => {
            const selected = session.id === sessionId;
            return (
              <Pressable
                key={session.id}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={[styles.session, selected && styles.sessionSelected]}
                onPress={() => setSessionId(session.id)}
              >
                <Text style={selected && styles.selectedText}>
                  {formatLeaveSession(session)}
                </Text>
              </Pressable>
            );
          })
        )}

        <Text style={styles.heading}>2. ระบุเหตุผล</Text>
        <TextInput
          multiline
          maxLength={1000}
          value={reason}
          onChangeText={setReason}
          placeholder="เช่น มีไข้สูง แพทย์ให้พักรักษาตัว"
          style={styles.input}
        />

        <Text style={styles.heading}>3. แนบภาพหลักฐาน</Text>
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
        <Text style={styles.help}>รองรับ JPG/PNG ขนาดไม่เกิน 10 MB</Text>

        <Pressable
          style={[styles.primary, busy && styles.disabled]}
          onPress={submit}
          disabled={busy || availableSessions.length === 0}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
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
  container: { padding: 20, gap: 14, backgroundColor: "#f9fafb" },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: { fontSize: 24, fontWeight: "600" },
  heading: { fontSize: 16, fontWeight: "600", marginTop: 4 },
  help: { color: "#6b7280", lineHeight: 20 },
  error: {
    color: "#b91c1c",
    backgroundColor: "#fef2f2",
    padding: 12,
    borderRadius: 8,
  },
  card: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    padding: 14,
    gap: 10,
  },
  session: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 12,
  },
  sessionSelected: { borderColor: "#2563eb", backgroundColor: "#eff6ff" },
  selectedText: { color: "#1d4ed8", fontWeight: "500" },
  input: {
    minHeight: 90,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 12,
    textAlignVertical: "top",
  },
  primary: {
    backgroundColor: "#2563eb",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "500" },
  secondary: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
  },
  disabled: { opacity: 0.5 },
  requestHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  requestTitle: { fontSize: 16, fontWeight: "600" },
  status: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
});
