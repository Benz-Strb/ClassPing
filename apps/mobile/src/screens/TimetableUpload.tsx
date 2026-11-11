import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { Pressable, Text, TextInput } from '../ui/primitives';
import { SelectField } from '../ui/SelectField';
import { colors } from '../ui/theme';
import { apiFetch } from '../lib/api';
import { TimetableGrid } from './TimetableGrid';

interface Row {
  courseCode: string; courseName: string; section: string; teacherName: string;
  weekday: number | null; startTime: string; endTime: string; roomName: string;
}
interface Match {
  status: 'matched' | 'unmatched' | 'ambiguous'; message: string;
  course: { id: string; code: string; name: string; section: string | null; teacherName: string } | null;
}
interface Result { index: number; status: string; message: string }
interface TimetableIdentity { studentId: string; fullName: string }
interface SavedTimetable { identity: TimetableIdentity; ownershipProof: string; rows: Row[]; savedAt: string; expiresAt: string }
const days = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const fields = [['courseCode', 'รหัสวิชา', 'CE360'], ['courseName', 'ชื่อวิชา', 'ชื่อรายวิชา'], ['section', 'กลุ่มเรียน', '001'], ['teacherName', 'อาจารย์ผู้สอน', 'ชื่อและนามสกุล'], ['startTime', 'เวลาเริ่มเรียน', '09:00'], ['endTime', 'เวลาสิ้นสุดเรียน', '12:00'], ['roomName', 'ห้องเรียน / ออนไลน์', '51106 หรือ ออนไลน์']] as const;

export function TimetableUpload({ onImported }: { onImported: () => void }) {
  const [readProof, setReadProof] = useState<string | null>(null);
  const [identity, setIdentity] = useState<TimetableIdentity | null>(null);
  const [ownershipProof, setOwnershipProof] = useState<string | null>(null);
  const [hasRead, setHasRead] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [ocrText, setOcrText] = useState('');
  const [showText, setShowText] = useState(false);
  const [busy, setBusy] = useState<string | null>('กำลังโหลดตารางที่บันทึก…');
  const [error, setError] = useState<string | null>(null);
  const [persisted, setPersisted] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    apiFetch<SavedTimetable | null>('/me/timetable').then(value => {
      if (!active || !value) return;
      setIdentity(value.identity); setOwnershipProof(value.ownershipProof); setRows(value.rows); setExpiresAt(value.expiresAt); setPersisted(true); setHasRead(true);
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : 'โหลดตารางที่บันทึกไม่ได้ กรุณาเปิดหน้านี้ใหม่');
    }).finally(() => { if (active) setBusy(null); });
    return () => { active = false; };
  }, []);
  function edit(value: Row[]) { if (persisted || busy) return; setRows(value); setMatches(null); setResults([]); setError(null); }
  async function verifyOwner() {
    if (busy || !readProof) return;
    setBusy('กำลังตรวจสอบชื่อและเลขนักศึกษา…'); setError(null);
    try {
      const value = await apiFetch<{ identity: TimetableIdentity; ownershipProof: string }>('/me/timetable/verify-owner', { method: 'POST', body: JSON.stringify({ ownershipProof: readProof }) });
      setIdentity(value.identity); setOwnershipProof(value.ownershipProof);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'ตรวจสอบไม่สำเร็จ กรุณาลองใหม่'); }
    finally { setBusy(null); }
  }
  async function saveTimetable() {
    if (busy || persisted) return;
    if (!ownershipProof || !identity) { setError("กรุณาอัปโหลดตารางเพื่อตรวจสอบชื่อและเลขนักศึกษาก่อน Save"); return; }
    const incomplete = rows.findIndex(row => !row.courseCode.trim() || !row.courseName.trim() ||
      !row.section.trim() || !row.teacherName.trim() || !row.roomName.trim() || row.weekday === null ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.startTime) ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.endTime) || row.startTime >= row.endTime);
    if (incomplete >= 0) {
      setEditing(incomplete); setError(`กรุณาตรวจข้อมูลทั้ง 7 รายการของวิชา ${rows[incomplete].courseCode || incomplete + 1} ให้ครบ และตรวจเวลาเริ่ม–สิ้นสุด`); return;
    }
    setBusy('กำลังบันทึกตารางเรียน…'); setError(null);
    try {
      const value = await apiFetch<SavedTimetable>('/me/timetable', { method: 'PUT', body: JSON.stringify({ rows, ownershipProof }) });
      setIdentity(value.identity); setOwnershipProof(value.ownershipProof); setRows(value.rows); setExpiresAt(value.expiresAt); setPersisted(true); setEditing(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'บันทึกไม่สำเร็จ กรุณาลองใหม่'); }
    finally { setBusy(null); }
  }
  function upload() {
    if (busy || persisted) return;
    if (Platform.OS === 'web') { void choose('file'); return; }
    Alert.alert('อัปโหลดตารางเรียน', 'เลือกรูปภาพหรือ PDF ไม่เกิน 10 MB', [
      { text: 'คลังรูปภาพ', onPress: () => void choose('photos') },
      { text: 'เลือกไฟล์', onPress: () => void choose('file') },
      { text: 'ยกเลิก', style: 'cancel' },
    ]);
  }
  async function choose(source: 'file' | 'photos') {
    setBusy('กำลังเลือกไฟล์'); setError(null);
    let file: File | null = null;
    let pickedImage: File | null = null;
    try {
      if (source === 'photos') {
        const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsMultipleSelection: false });
        if (picked.canceled) return;
        pickedImage = new File(picked.assets[0].uri);
        const image = await ImageManipulator.manipulate(picked.assets[0].uri).renderAsync();
        const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 1 });
        file = new File(saved.uri);
      } else {
        const picked = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg', 'image/png'], copyToCacheDirectory: true, multiple: false });
        if (picked.canceled) return;
        file = new File(picked.assets[0].uri);
      }
      if (file.size > 10 * 1024 * 1024) throw new Error('ไฟล์ต้องไม่เกิน 10 MB กรุณาเลือกรูปหรือไฟล์ที่เล็กลง');
      setEditing(null); setShowText(false);
      setBusy('กำลังอ่านตารางเรียน…');
      const body = new FormData(); body.append('document', file);
      const draft = await apiFetch<{ identity: TimetableIdentity | null; ownershipProof: string | null; readProof: string | null; rows: Row[]; matches: Match[]; warnings: string[]; ocrText: string }>('/me/timetable/preview', { method: 'POST', body }, 120_000);
      setReadProof(draft.readProof); setIdentity(draft.identity); setOwnershipProof(draft.ownershipProof); setRows(draft.rows); setMatches(draft.matches); setWarnings(draft.warnings); setOcrText(draft.ocrText); setResults([]); setHasRead(true); setPersisted(false); setExpiresAt(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'อ่านตารางเรียนไม่สำเร็จ'); }
    finally {
      for (const cached of [file, pickedImage]) {
        try { if (cached?.exists) cached.delete(); } catch { /* cache cleanup is best effort */ }
      }
      setBusy(null);
    }
  }
  async function match() {
    setBusy('กำลังจับคู่รายวิชา…'); setError(null); setResults([]);
    try { setMatches(await apiFetch<Match[]>('/me/timetable/matches', { method: 'POST', body: JSON.stringify({ rows }) })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'จับคู่ไม่สำเร็จ'); }
    finally { setBusy(null); }
  }
  async function confirm() {
    setBusy('กำลังเพิ่มเข้ารายวิชา…'); setError(null);
    try {
      const response = await apiFetch<{ results: Result[] }>('/me/timetable/enroll', { method: 'POST', body: JSON.stringify({ rows, ownershipProof }) });
      setResults(response.results);
      if (response.results.some(result => result.status === 'enrolled' || result.status === 'existing')) onImported();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'บันทึกไม่สำเร็จ'); }
    finally { setBusy(null); }
  }
  const matchedCount = matches?.filter(item => item.status === 'matched').length ?? 0;
  const saved = results.length > 0 && !results.some(result => result.status === 'failed');
  return <View style={[styles.panel, !hasRead && styles.emptyPanel]}>
    {identity && <View style={styles.identityHeader}><Text style={styles.heading}>{identity.fullName}</Text><Text selectable style={styles.label}>เลขนักศึกษา {identity.studentId}</Text><Text style={styles.note}>{ownershipProof ? 'ตรวจสอบตรงกับบัญชีแล้ว' : 'ข้อมูลที่อ่านจากเอกสาร · ยังไม่ได้ตรวจสอบกับบัญชี'}</Text></View>}
    {!persisted && <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!busy }}
      style={({ pressed }) => [styles.primary, styles.upload, pressed && styles.pressed, !!busy && styles.disabled]}
      disabled={!!busy} onPress={upload}>
      <Svg width={22} height={22} viewBox="0 0 24 24" accessibilityElementsHidden>
        <Path d="M12 16V4m-4 4 4-4 4 4M4 16v4h16v-4" stroke={colors.onAction} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
      <Text style={styles.primaryText}>{hasRead ? 'อัปโหลดตารางเรียนใหม่' : 'อัปโหลดตารางเรียน'}</Text>
    </Pressable>}
    {busy && <View style={styles.busy}><ActivityIndicator color={colors.action} /><View style={styles.busyCopy}><Text accessibilityRole="alert" style={styles.label}>{busy}</Text><Text style={styles.note}>ระบบจะจัดข้อมูลเป็นการ์ดรายวิชาให้อัตโนมัติ</Text></View></View>}
    {error && <View style={styles.errorBox}><Text accessibilityRole="alert" style={styles.error}>{error}</Text></View>}
    {hasRead && <>
      {!ownershipProof && <View style={styles.feedback}>
        {!identity && <Text style={styles.error}>อ่านชื่อและเลขทะเบียนไม่ได้ กรุณาอัปโหลดเอกสารที่เห็นส่วนหัวครบ</Text>}
        <Pressable disabled={!!busy || !readProof} style={styles.primary} onPress={() => void verifyOwner()}><Text style={styles.primaryText}>ตรวจสอบกับบัญชี</Text></Pressable>
      </View>}
      {persisted && expiresAt && <View style={styles.feedback}><Text accessibilityRole="alert" style={styles.label}>บันทึกตารางเรียนไว้กับบัญชีแล้ว</Text><Text style={styles.note}>เปิดดูได้ถึง {new Date(expiresAt).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'long', year: 'numeric' })}</Text></View>}
      {rows.length > 0 && <TimetableGrid rows={rows} identity={identity ?? undefined} disabled={!!busy} />}
      <View style={styles.summary}>
        <Text accessibilityRole="header" style={styles.heading}>รายวิชาที่อ่านได้</Text>
        <Text style={styles.count}>{new Set(rows.map(row => `${row.courseCode}:${row.section}`)).size} วิชา · {rows.length} ช่วงเรียน</Text>
      </View>
      <Text style={styles.note}>ตรวจข้อมูลทั้ง 7 รายการก่อนยืนยัน แตะแก้ไขหากข้อมูลไม่ตรงกับต้นฉบับ</Text>
      {warnings.map(warning => <Text key={warning} style={styles.note}>{warning}</Text>)}
      {!rows.length && <View style={styles.feedback}><Text style={styles.label}>ยังไม่พบรายวิชาในไฟล์นี้</Text><Text style={styles.note}>ลองอัปโหลดรูปที่ชัดขึ้น ให้เห็นรหัสวิชาและรายละเอียดครบทั้งตาราง</Text></View>}
      {rows.map((row, index) => {
        const result = results.find(item => item.index === index);
        const matched = matches?.[index]?.status === 'matched';
        return <View key={index} style={styles.row}>
          <View style={styles.cardTop}>
            <Text style={styles.code}>{row.courseCode || 'ไม่พบรหัสวิชา'}</Text>
            <Text style={[styles.badge, !matched && !persisted && styles.warningBadge]}>{persisted ? 'บันทึกแล้ว' : matched ? 'จับคู่ได้' : 'ตรวจสอบข้อมูล'}</Text>
          </View>
          <Text accessibilityRole="header" style={styles.courseTitle}>{row.courseName || 'ไม่พบชื่อวิชา'}</Text>
          <View style={styles.schedule}>
            <Text style={styles.scheduleText}>{row.weekday === null ? 'ยังไม่ระบุวัน' : `วัน${days[row.weekday]}`}</Text>
            <Text style={styles.scheduleText}>{row.startTime && row.endTime ? `${row.startTime} – ${row.endTime}` : 'ยังไม่ระบุเวลา'}</Text>
          </View>
          <View style={styles.details}>
            <View style={styles.detail}><Text style={styles.note}>กลุ่มเรียน</Text><Text style={styles.detailValue}>{row.section || 'ยังไม่ระบุ'}</Text></View>
            <View style={styles.detail}><Text style={styles.note}>ห้องเรียน</Text><Text style={styles.detailValue}>{row.roomName || 'ยังไม่ระบุ'}</Text></View>
          </View>
          <View style={styles.field}><Text style={styles.note}>อาจารย์ผู้สอน</Text><Text style={styles.detailValue}>{row.teacherName || 'ยังไม่ระบุ'}</Text></View>
          {!persisted && editing === index && <View style={styles.editor}>
            {fields.map(([key, label, placeholder]) => <View key={key} style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={`${label} วิชาที่ ${index + 1}`} editable={!busy} style={styles.input} placeholder={placeholder} placeholderTextColor={colors.muted} value={row[key]} onChangeText={value => edit(rows.map((item, i) => i === index ? { ...item, [key]: value } : item))} /></View>)}
            <SelectField label="วันเรียน" placeholder="เลือกวัน" value={row.weekday === null ? null : String(row.weekday)} disabled={!!busy} options={days.map((label, value) => ({ label, value: String(value) }))} onChange={value => edit(rows.map((item, i) => i === index ? { ...item, weekday: Number(value) } : item))} />
          </View>}
          {result ? <Text accessibilityRole="alert" style={result.status === 'failed' ? styles.error : styles.link}>{result.message}</Text> : matches?.[index] && !matched && <Text style={styles.warningText}>{matches[index].message}</Text>}
          {!persisted && <View style={styles.cardActions}>
            <Pressable accessibilityRole="button" accessibilityLabel={`แก้ไขวิชา ${row.courseCode || index + 1}`} accessibilityState={{ expanded: editing === index, disabled: !!busy }} disabled={!!busy} style={styles.textButton} onPress={() => setEditing(editing === index ? null : index)}><Text style={styles.link}>{editing === index ? 'เสร็จสิ้นการแก้ไข' : 'แก้ไขข้อมูล'}</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`ลบวิชา ${row.courseCode || index + 1}`} disabled={!!busy} style={styles.textButton} onPress={() => { edit(rows.filter((_, i) => i !== index)); setEditing(null); }}><Text style={styles.error}>ลบวิชา</Text></Pressable>
          </View>}
        </View>;
      })}
      {rows.length > 0 && <View style={styles.footer}>
        <View style={styles.saveActions}>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!busy || persisted || !ownershipProof }} disabled={!!busy || persisted || !ownershipProof} style={[styles.primary, styles.saveButton, (!!busy || persisted) && styles.disabled]} onPress={() => void saveTimetable()}><Text style={styles.primaryText}>{persisted ? 'บันทึกแล้ว' : 'Save ตารางเรียน'}</Text></Pressable>
          {persisted && <Pressable disabled={!!busy} style={styles.editButton} onPress={() => { setPersisted(false); setEditing(null); }}><Text style={styles.link}>แก้ไข</Text></Pressable>}
        </View>
        <Text style={styles.note}>ตรวจทานข้อมูลแล้วกด Save เพื่อเก็บตารางไว้กับบัญชี 5 เดือน การแก้ไขหรืออัปโหลดใหม่ต้องกด Save อีกครั้ง</Text>
        {matches === null && <Pressable accessibilityRole="button" disabled={!!busy} style={[styles.primary, !!busy && styles.disabled]} onPress={() => void match()}><Text style={styles.primaryText}>ตรวจสอบข้อมูลที่แก้ไข</Text></Pressable>}
        {matchedCount > 0 && !!ownershipProof && <Pressable accessibilityRole="button" disabled={!!busy || saved} style={[styles.primary, (!!busy || saved) && styles.disabled]} onPress={() => void confirm()}><Text style={styles.primaryText}>{saved ? 'ยืนยันรายวิชาแล้ว' : `ยืนยันเพิ่ม ${matchedCount} วิชาที่จับคู่ได้`}</Text></Pressable>}
        <Text style={styles.note}>ระบบเพิ่มเฉพาะวิชาที่ตรงกับตารางของอาจารย์ในระบบ</Text>
      </View>}
      {!!ocrText && <><Pressable accessibilityRole="button" accessibilityState={{ expanded: showText }} style={styles.textButton} onPress={() => setShowText(value => !value)}><Text style={styles.link}>{showText ? 'ซ่อนข้อความต้นฉบับ' : 'ดูข้อความต้นฉบับที่อ่านได้'}</Text></Pressable>{showText && <Text selectable style={styles.note}>{ocrText}</Text>}</>}
    </>}
  </View>;
}

const styles = StyleSheet.create({
  identityHeader: { gap: 4, paddingBottom: 16, borderBottomWidth: 1, borderColor: colors.border },
  panel: { gap: 16, paddingVertical: 16 }, emptyPanel: { flexGrow: 1, justifyContent: 'center' },
  row: { gap: 14, padding: 20, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.surface },
  upload: { flexDirection: 'row', gap: 10, minHeight: 56 }, pressed: { backgroundColor: colors.actionHover },
  summary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginTop: 12 },
  saveActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  saveButton: { flex: 1 },
  editButton: { minHeight: 48, paddingHorizontal: 20, justifyContent: 'center', borderWidth: 1, borderColor: colors.action, borderRadius: 8 },
  count: { color: colors.identity, fontSize: 14, fontWeight: '600' },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  code: { color: colors.action, fontSize: 16, fontWeight: '600' },
  badge: { color: colors.identity, backgroundColor: colors.selected, fontSize: 12, lineHeight: 20, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  warningBadge: { color: colors.warning, backgroundColor: colors.warningBg },
  warningText: { color: colors.warning, fontSize: 14, lineHeight: 24 },
  courseTitle: { color: colors.ink, fontSize: 20, lineHeight: 30, fontWeight: '600' },
  schedule: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  scheduleText: { color: colors.identity, fontSize: 16, lineHeight: 26, fontWeight: '500' },
  details: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 }, detail: { flexGrow: 1, flexBasis: 120, gap: 4 },
  detailValue: { color: colors.ink, fontSize: 16, lineHeight: 26 },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', borderTopWidth: 1, borderColor: colors.border },
  textButton: { minHeight: 48, justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 4 },
  editor: { gap: 14, paddingTop: 16, borderTopWidth: 1, borderColor: colors.border },
  footer: { gap: 12, paddingVertical: 8 }, busyCopy: { flex: 1, gap: 4 },
  errorBox: { padding: 16, backgroundColor: colors.dangerBg, borderRadius: 12 },
  heading: { color: colors.identity, fontSize: 18, lineHeight: 28, fontWeight: '600' },
  label: { color: colors.ink, fontSize: 16, lineHeight: 26 }, note: { color: colors.muted, fontSize: 14, lineHeight: 24 },
  field: { gap: 6 }, input: { minHeight: 48, borderWidth: 1, borderColor: colors.outline, borderRadius: 8, padding: 12, fontSize: 16, color: colors.ink },
  link: { color: colors.action, fontSize: 16, lineHeight: 24 }, primary: { minHeight: 48, padding: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.action, borderRadius: 8 },
  primaryText: { color: colors.surface, fontSize: 16, fontWeight: '600' }, disabled: { opacity: 0.5 },
  error: { color: colors.danger, fontSize: 16, lineHeight: 24 }, busy: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  feedback: { padding: 12, gap: 8, borderRadius: 8, backgroundColor: colors.selected },
});
