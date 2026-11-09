import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Pressable, Text, TextInput } from '../ui/primitives';
import { SelectField } from '../ui/SelectField';
import { colors } from '../ui/theme';
import { apiFetch } from '../lib/api';

interface Row {
  courseCode: string; courseName: string; section: string; teacherName: string;
  weekday: number | null; startTime: string; endTime: string; roomName: string;
}
interface Match {
  status: 'matched' | 'unmatched' | 'ambiguous'; message: string;
  course: { id: string; code: string; name: string; section: string | null; teacherName: string } | null;
}
interface Result { index: number; status: string; message: string }
const days = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const blank = (): Row => ({ courseCode: '', courseName: '', section: '', teacherName: '', weekday: null, startTime: '', endTime: '', roomName: '' });
const fields = [['courseCode', 'รหัสวิชา', 'CE360'], ['section', 'กลุ่มเรียน', '001'], ['teacherName', 'ชื่ออาจารย์', 'ชื่อและนามสกุล'], ['startTime', 'เวลาเริ่ม', '09:00'], ['endTime', 'เวลาจบ', '12:00'], ['roomName', 'ห้องเรียน (ถ้ามี)', 'ห้องเรียน']] as const;

export function TimetableUpload({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [ocrText, setOcrText] = useState('');
  const [showText, setShowText] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  function edit(value: Row[]) { setRows(value); setMatches(null); setResults([]); setError(null); }
  async function choose() {
    setBusy('กำลังเลือกไฟล์'); setError(null);
    let file: File | null = null;
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg', 'image/png'], copyToCacheDirectory: true, multiple: false });
      if (picked.canceled) return;
      const asset = picked.assets[0];
      file = new File(asset.uri);
      if ((asset.size ?? file.size) > 10 * 1024 * 1024) throw new Error('ไฟล์ต้องไม่เกิน 10 MB');
      setBusy('กำลังอ่านตารางเรียน…');
      const body = new FormData(); body.append('document', file);
      const draft = await apiFetch<{ rows: Row[]; matches: Match[]; warnings: string[]; ocrText: string }>('/me/timetable/preview', { method: 'POST', body }, 120_000);
      setRows(draft.rows); setMatches(draft.matches); setWarnings(draft.warnings); setOcrText(draft.ocrText); setResults([]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'อ่านตารางเรียนไม่สำเร็จ'); }
    finally { try { if (file?.exists) file.delete(); } catch { /* cache cleanup is best effort */ } setBusy(null); }
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
      const response = await apiFetch<{ results: Result[] }>('/me/timetable/enroll', { method: 'POST', body: JSON.stringify({ rows }) });
      setResults(response.results);
      if (response.results.some(result => result.status === 'enrolled' || result.status === 'existing')) onImported();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'บันทึกไม่สำเร็จ'); }
    finally { setBusy(null); }
  }
  if (!open) return <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => setOpen(true)}><Text style={styles.link}>อัปโหลดตารางเรียน</Text></Pressable>;
  return <View style={styles.panel}>
    <Text accessibilityRole="header" style={styles.heading}>อัปโหลดตารางเรียน</Text>
    <Text style={styles.note}>PDF, JPG หรือ PNG ไม่เกิน 10 MB ตรวจข้อมูลจากไฟล์ก่อนยืนยัน ระบบจะเพิ่มชื่อจากบัญชีของคุณให้รายวิชาที่อาจารย์ กลุ่ม วันและเวลาตรงกัน</Text>
    <Pressable accessibilityRole="button" style={styles.secondary} disabled={!!busy} onPress={() => void choose()}><Text style={styles.link}>เลือกไฟล์และอ่านข้อความ</Text></Pressable>
    {busy && <View style={styles.busy}><ActivityIndicator color={colors.action} /><Text accessibilityRole="alert" style={styles.note}>{busy}</Text></View>}
    {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {warnings.map(warning => <Text key={warning} style={styles.note}>{warning}</Text>)}
    {ocrText && <><Pressable accessibilityRole="button" accessibilityState={{ expanded: showText }} style={styles.secondary} onPress={() => setShowText(value => !value)}><Text style={styles.link}>{showText ? 'ซ่อนข้อความ' : 'ดูข้อความที่อ่านได้'}</Text></Pressable>{showText && <Text selectable style={styles.note}>{ocrText}</Text>}</>}
    {rows.map((row, index) => <View key={index} style={styles.row}>
      <Text style={styles.heading}>วิชาที่ {index + 1}{row.courseName ? ` · ${row.courseName}` : ''}</Text>
      {fields.map(([key, label, placeholder]) => <View key={key} style={styles.field}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={`${label} วิชาที่ ${index + 1}`} editable={!busy} style={styles.input} placeholder={placeholder} placeholderTextColor={colors.muted} value={row[key]} onChangeText={value => edit(rows.map((item, i) => i === index ? { ...item, [key]: value } : item))} /></View>)}
      <SelectField label="วันเรียน" placeholder="เลือกวัน" value={row.weekday === null ? null : String(row.weekday)} disabled={!!busy} options={days.map((label, value) => ({ label, value: String(value) }))} onChange={value => edit(rows.map((item, i) => i === index ? { ...item, weekday: Number(value) } : item))} />
      {matches?.[index] && <View style={styles.feedback}><Text style={styles.label}>{matches[index].message}</Text>{matches[index].course && <Text style={styles.note}>{matches[index].course!.code} · {matches[index].course!.name} · กลุ่ม {matches[index].course!.section ?? 'ไม่ระบุ'}{ '\n' }{matches[index].course!.teacherName}</Text>}</View>}
      {results.find(result => result.index === index) && <Text accessibilityRole="alert" style={styles.label}>{results.find(result => result.index === index)!.message}</Text>}
      <Pressable accessibilityRole="button" disabled={!!busy} style={styles.secondary} onPress={() => edit(rows.filter((_, i) => i !== index))}><Text style={styles.link}>ลบวิชานี้</Text></Pressable>
    </View>)}
    <Pressable accessibilityRole="button" disabled={!!busy || rows.length >= 100} style={styles.secondary} onPress={() => edit([...rows, blank()])}><Text style={styles.link}>เพิ่มแถว</Text></Pressable>
    {rows.length > 0 && <Pressable accessibilityRole="button" disabled={!!busy} style={styles.secondary} onPress={() => void match()}><Text style={styles.link}>ตรวจสอบการจับคู่</Text></Pressable>}
    {matches?.some(item => item.status === 'matched') && <Pressable accessibilityRole="button" disabled={!!busy || results.length > 0 && !results.some(result => result.status === 'failed')} style={[styles.primary, (!!busy || results.length > 0 && !results.some(result => result.status === 'failed')) && styles.disabled]} onPress={() => void confirm()}><Text style={styles.primaryText}>ยืนยันเพิ่มวิชาที่จับคู่ได้</Text></Pressable>}
    <Text style={styles.note}>วิชาที่ยังจับคู่ไม่ได้จะไม่เพิ่มรายชื่อ กรุณาตรวจข้อมูลหรือให้อาจารย์เพิ่มตารางในระบบก่อน</Text>
    <Pressable accessibilityRole="button" disabled={!!busy} style={styles.secondary} onPress={() => setOpen(false)}><Text style={styles.link}>ปิดการอัปโหลด</Text></Pressable>
  </View>;
}
const styles = StyleSheet.create({
  panel: { gap: 16, paddingVertical: 16 }, row: { gap: 12, paddingVertical: 20, borderTopWidth: 1, borderColor: colors.border },
  heading: { color: colors.identity, fontSize: 18, lineHeight: 28, fontWeight: '600' },
  label: { color: colors.ink, fontSize: 16, lineHeight: 26 }, note: { color: colors.muted, fontSize: 14, lineHeight: 24 },
  field: { gap: 6 }, input: { minHeight: 48, borderWidth: 1, borderColor: colors.outline, borderRadius: 8, padding: 12, fontSize: 16, color: colors.ink },
  secondary: { minHeight: 48, justifyContent: 'center', padding: 12, borderWidth: 1, borderColor: colors.outline, borderRadius: 8 },
  link: { color: colors.action, fontSize: 16, lineHeight: 24 }, primary: { minHeight: 48, padding: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.action, borderRadius: 8 },
  primaryText: { color: colors.surface, fontSize: 16, fontWeight: '600' }, disabled: { opacity: 0.5 },
  error: { color: colors.danger, fontSize: 16, lineHeight: 24 }, busy: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  feedback: { padding: 12, gap: 8, borderRadius: 8, backgroundColor: colors.selected },
});
