import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshControl, StyleSheet, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { Pressable, ScrollView, Text, TextInput } from "../ui/primitives";
import { SelectField } from "../ui/SelectField";
import { colors, layout } from "../ui/theme";
import { apiFetch } from "../lib/api";
import { discardLeaveEvidence } from "../lib/leave";
import {
  openTransferDocument,
  previewTransfer,
  submitTransfer,
  TRANSFER_STATUS,
  type TransferCourse,
  type TransferCurriculum,
  type TransferRequest,
} from "../lib/transfers";

const blankCourse = (): TransferCourse => ({
  sourceCode: "",
  sourceName: "",
  credits: "3",
  grade: "",
});
const fields = [
  ["sourceCode", "รหัสวิชา"],
  ["sourceName", "ชื่อวิชา"],
  ["credits", "หน่วยกิต"],
  ["grade", "เกรดตามเอกสาร"],
] as const;
const message = (e: unknown) =>
  e instanceof Error ? e.message : "เรียกระบบไม่สำเร็จ";

export function TransfersScreen({
  active,
  focusTick,
}: {
  active: boolean;
  focusTick: number;
}) {
  const [curricula, setCurricula] = useState<TransferCurriculum[]>([]);
  const [requests, setRequests] = useState<TransferRequest[] | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [institution, setInstitution] = useState("");
  const [major, setMajor] = useState("");
  const [ocrText, setOcrText] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [courses, setCourses] = useState<TransferCourse[]>([blankCourse()]);
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(
    null,
  );
  const fileUri = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const load = useCallback(async () => {
    const [docs, rows] = await Promise.all([
      apiFetch<TransferCurriculum[]>("/transfers/curricula"),
      apiFetch<TransferRequest[]>("/transfers/requests"),
    ]);
    setCurricula(docs);
    setRequests(rows);
  }, []);
  useEffect(() => {
    if (active) void load().catch((e) => setError(message(e)));
  }, [active, focusTick, load]);
  useEffect(() => () => discardLeaveEvidence(fileUri.current), []);
  const curriculum = curricula.find((c) => c.id === documentId);
  async function pick() {
    setBusy(true);
    setError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/jpeg", "image/png"],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if ((asset.size ?? 0) > 10 * 1024 * 1024) {
        discardLeaveEvidence(asset.uri);
        throw new Error("ไฟล์ต้องไม่เกิน 10 MB");
      }
      discardLeaveEvidence(fileUri.current);
      fileUri.current = asset.uri;
      setFile(asset);
      setSuccess(false);
      setInstitution("");
      setMajor("");
      setCourses([blankCourse()]);
      setOcrText("");
      setWarnings([]);
      setReading(true);
      const draft = await previewTransfer(asset.uri);
      setInstitution(draft.sourceInstitution);
      setMajor(draft.sourceMajor);
      setOcrText(draft.ocrText);
      setWarnings(draft.warnings);
      setCourses(
        draft.courses.length
          ? draft.courses
              .slice(0, 50)
              .map((c) => ({ ...c, credits: String(c.credits) }))
          : [blankCourse()],
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
      setReading(false);
    }
  }
  async function submit() {
    if (busy) return;
    setError(null);
    setSuccess(false);
    if (!institution.trim() || !major.trim() || !file) {
      setError("กรุณาแนบเอกสารและตรวจสอบชื่อสถาบันกับสาขาที่เคยเรียน");
      return;
    }
    if (
      courses.some(
        (c) =>
          !c.sourceCode.trim() ||
          !c.sourceName.trim() ||
          !Number.isFinite(Number(c.credits)) ||
          Number(c.credits) < 0.5 ||
          Number(c.credits) > 30,
      )
    ) {
      setError("กรุณากรอกรหัสวิชา ชื่อวิชา และหน่วยกิต 0.5–30 ให้ครบ");
      return;
    }
    setBusy(true);
    try {
      const result = await submitTransfer(
        documentId,
        institution.trim(),
        courses,
        file.uri,
        major.trim(),
        ocrText,
      );
      setRequests((previous) => [result, ...(previous ?? [])]);
      discardLeaveEvidence(fileUri.current);
      fileUri.current = null;
      setFile(null);
      setCourses([blankCourse()]);
      setInstitution("");
      setMajor("");
      setOcrText("");
      setWarnings([]);
      setSuccess(true);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function open(path: string) {
    setBusy(true);
    setError(null);
    try {
      await openTransferDocument(path);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <ScrollView
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.action}
          onRefresh={() => {
            setRefreshing(true);
            setError(null);
            void load()
              .catch((e) => setError(message(e)))
              .finally(() => setRefreshing(false));
          }}
        />
      }
    >
      <Text accessibilityRole="header" style={styles.title}>
        ขอเทียบโอนรายวิชา
      </Text>
      <Text style={styles.help}>
        อัปโหลดหลักสูตรหรือผลการเรียนเดิม OCR จะดึงสถาบัน สาขา รายวิชา
        และหน่วยกิต ให้ตรวจสอบก่อนส่งให้อาจารย์
      </Text>
      {error && (
        <View style={styles.group}>
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
          {requests === null && (
            <Pressable
              style={styles.secondary}
              onPress={() => {
                setError(null);
                void load().catch((e) => setError(message(e)));
              }}
            >
              <Text>ลองโหลดใหม่</Text>
            </Pressable>
          )}
        </View>
      )}
      {success && (
        <Text accessibilityRole="alert" style={styles.help}>
          ส่งคำขอแล้ว ติดตามผลได้ที่คำขอของฉัน
        </Text>
      )}
      {requests === null ? (
        <Text>กำลังโหลด...</Text>
      ) : (
        <>
          <View style={styles.card}>
            <Pressable
              disabled={busy}
              style={styles.secondary}
              onPress={() => void pick()}
            >
              <Text>
                {reading
                  ? "กำลังอ่านเอกสารด้วย OCR..."
                  : file
                    ? `เปลี่ยนเอกสาร: ${file.name}`
                    : "อัปโหลดหลักสูตร/ผลการเรียนเดิม"}
              </Text>
            </Pressable>
            <Text style={styles.help}>
              PDF ไม่เกิน 100 หน้า, JPG หรือ PNG รวมไม่เกิน 10 MB
            </Text>
            {warnings.map((warning) => (
              <Text key={warning} style={styles.help}>
                {warning}
              </Text>
            ))}
            <View style={styles.group}>
              <Text>สถาบันที่เคยเรียน</Text>
              <TextInput
                accessibilityLabel="สถาบันที่เคยเรียน"
                style={styles.input}
                editable={!busy}
                value={institution}
                onChangeText={setInstitution}
                maxLength={200}
              />
            </View>
            <View style={styles.group}>
              <Text>สาขาที่เคยเรียน</Text>
              <TextInput
                accessibilityLabel="สาขาที่เคยเรียน"
                style={styles.input}
                editable={!busy}
                value={major}
                onChangeText={setMajor}
                maxLength={200}
              />
            </View>
            {curricula.length > 0 && (
              <SelectField
                label="หลักสูตรปลายทาง (ถ้าทราบ)"
                placeholder="ให้อาจารย์เลือกหลักสูตร"
                value={documentId}
                disabled={busy}
                options={curricula.map((c) => ({
                  value: c.id,
                  label: `${c.curriculumName} · ปี ${c.year}`,
                }))}
                onChange={setDocumentId}
              />
            )}
            {curriculum && (
              <Pressable
                disabled={busy}
                style={styles.secondary}
                onPress={() =>
                  void open(`/transfers/curricula/${curriculum.id}/document`)
                }
              >
                <Text>ดูเอกสารหลักสูตรปลายทาง</Text>
              </Pressable>
            )}
            {courses.map((course, index) => (
              <View key={index} style={styles.course}>
                <Text style={styles.subtitle}>รายวิชาเดิมที่ {index + 1}</Text>
                {fields.map(([key, label]) => (
                  <View key={key} style={styles.group}>
                    <Text>
                      {label}
                      {key === "grade" ? " (ถ้ามี)" : ""}
                    </Text>
                    <TextInput
                      accessibilityLabel={`${label} รายวิชาที่ ${index + 1}`}
                      editable={!busy}
                      style={styles.input}
                      value={course[key]}
                      keyboardType={
                        key === "credits" ? "decimal-pad" : "default"
                      }
                      maxLength={
                        key === "sourceCode" ? 60 : key === "grade" ? 20 : 200
                      }
                      onChangeText={(value) =>
                        setCourses((previous) =>
                          previous.map((c, i) =>
                            i === index ? { ...c, [key]: value } : c,
                          ),
                        )
                      }
                    />
                  </View>
                ))}
                {courses.length > 1 && (
                  <Pressable
                    disabled={busy}
                    style={styles.secondary}
                    onPress={() =>
                      setCourses((previous) =>
                        previous.filter((_, i) => i !== index),
                      )
                    }
                  >
                    <Text style={styles.error}>ลบรายวิชาที่ {index + 1}</Text>
                  </Pressable>
                )}
              </View>
            ))}
            <Pressable
              disabled={busy || courses.length >= 50}
              style={styles.secondary}
              onPress={() =>
                setCourses((previous) => [...previous, blankCourse()])
              }
            >
              <Text>เพิ่มรายวิชา</Text>
            </Pressable>
            <Pressable
              disabled={busy || !file}
              style={styles.primary}
              onPress={() => void submit()}
            >
              <Text style={styles.primaryText}>
                {busy ? "กำลังดำเนินการ..." : "ยืนยันข้อมูลและส่งให้อาจารย์"}
              </Text>
            </Pressable>
          </View>
          <Text accessibilityRole="header" style={styles.title}>
            คำขอของฉัน
          </Text>
          {requests.length === 0 && (
            <Text style={styles.help}>ยังไม่มีคำขอเทียบโอนรายวิชา</Text>
          )}
          {requests.map((request) => (
            <View key={request.id} style={styles.card}>
              <Text style={styles.subtitle}>{request.curriculumName}</Text>
              <Text>{TRANSFER_STATUS[request.status]}</Text>
              <Text style={styles.help}>
                {request.sourceInstitution} ·{" "}
                {request.sourceMajor || "ไม่ระบุสาขา"} ·{" "}
                {new Date(request.createdAt).toLocaleString("th-TH", {
                  timeZone: "Asia/Bangkok",
                })}
              </Text>
              {(["request"] as const).map((kind) => (
                <Pressable
                  key={kind}
                  disabled={busy}
                  style={styles.secondary}
                  onPress={() =>
                    void open(
                      `/transfers/requests/${request.id}/documents/${kind}`,
                    )
                  }
                >
                  <Text>
                    {kind === "request"
                      ? `เอกสารที่ยื่น: ${request.documentName}`
                      : "หลักสูตรที่ใช้พิจารณา"}
                  </Text>
                </Pressable>
              ))}
              {request.items.map((item) => (
                <View key={item.id} style={styles.course}>
                  <Text style={styles.subtitle}>
                    {item.sourceCode} · {item.sourceName}
                  </Text>
                  <Text>
                    {item.credits} หน่วยกิต · เกรด {item.grade || "ไม่ระบุ"}
                  </Text>
                  <Text style={styles.help}>
                    {item.match
                      ? `คู่เทียบ: ${item.match.targetCode} · ${item.match.targetName} (${item.match.targetCredits} หน่วยกิต)`
                      : "รออาจารย์ตรวจและเลือกคู่เทียบ"}
                  </Text>
                  <Text>
                    {item.decision
                      ? `ผล: ${item.decision === "approved" ? "อนุมัติ" : "ปฏิเสธ"}`
                      : "รออาจารย์พิจารณา"}
                  </Text>
                  {!!item.note && <Text>{item.note}</Text>}
                </View>
              ))}
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  content: {
    padding: 24,
    gap: 16,
    width: "100%",
    maxWidth: layout.form,
    alignSelf: "center",
    paddingBottom: 32,
  },
  title: { fontSize: 22, fontWeight: "600", color: colors.identity },
  subtitle: { fontSize: 17, fontWeight: "500", color: colors.identity },
  help: { color: colors.muted },
  error: { color: colors.danger },
  group: { gap: 8 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    gap: 16,
  },
  course: {
    borderTopWidth: 1,
    borderColor: colors.border,
    paddingTop: 16,
    gap: 12,
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: 12,
    padding: 12,
    backgroundColor: colors.surface,
  },
  secondary: {
    minHeight: 48,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.selected,
    justifyContent: "center",
  },
  primary: {
    minHeight: 48,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.action,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: colors.onAction, fontWeight: "500" },
});
