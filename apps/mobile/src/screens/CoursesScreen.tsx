import { uploadedCourses } from '../lib/uploaded-courses';
import type { TimetableEntry } from '../lib/timetable-grid';
import { AppIcon } from '../ui/AppIcon';
import { colors, typography } from '../ui/theme';
import { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, RefreshControl, StyleSheet, View } from 'react-native';
import { Pressable, ScrollView, Text, TextInput } from '../ui/primitives';
import { apiFetch } from '../lib/api';
import type { StudentStudies } from '../lib/types';
import { AttendanceCourseSection } from './AttendanceCourseSection';

const time = (value: string) => new Date(value).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
const dateLabel = (value: string, short = false) => new Date(`${value}T12:00:00+07:00`).toLocaleDateString('th-TH', {
  timeZone: 'Asia/Bangkok', weekday: short ? 'short' : 'long', day: 'numeric', month: 'short',
});
function daysFrom(from: string) {
  return Array.from({ length: 7 }, (_, index) => new Date(Date.parse(`${from}T00:00:00Z`) + index * 86400000).toISOString().slice(0, 10));
}

export function CoursesScreen({ active, refreshTick = 0, onEnrollmentChanged }: { active: boolean; refreshTick?: number; onEnrollmentChanged?: () => void }) {
  const [ownershipProof, setOwnershipProof] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [uploadedRows, setUploadedRows] = useState<TimetableEntry[]>([]);
  const [uploadedLoading, setUploadedLoading] = useState(true);
  const [uploadError, setUploadError] = useState(false);
  const [expandedUpload, setExpandedUpload] = useState<string | null>(null);
  const [data, setData] = useState<StudentStudies | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'courses' | 'timetable'>('courses');
  const [selected, setSelected] = useState<string | null>(null);
  const [day, setDay] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!active) return;
    let current = true;
    setUploadError(false);
    setUploadedLoading(true);
    apiFetch<{ rows: TimetableEntry[]; expiresAt: string; ownershipProof: string } | null>('/me/timetable')
      .then(value => { if (current) { const valid = value && Date.parse(value.expiresAt) > Date.now(); setUploadedRows(valid ? value.rows : []); setOwnershipProof(valid ? value.ownershipProof : null); } })
      .catch(() => { if (current) setUploadError(true); })
      .finally(() => { if (current) setUploadedLoading(false); });
    return () => { current = false; };
  }, [active, reload, refreshTick]);

  useEffect(() => {
    if (!active) return;
    let current = true;
    setLoading(true);
    setError(null);
    apiFetch<StudentStudies>('/me/studies').then((result) => {
      if (!current) return;
      setData(result);
      setDay((previous) => previous >= result.from && previous <= result.to ? previous : result.from);
      setSelected((previous) => result.courses.some((course) => course.id === previous) ? previous : null);
    }).catch((cause: unknown) => {
      if (current) setError(cause instanceof Error ? cause.message : 'โหลดรายวิชาไม่สำเร็จ');
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [active, reload, refreshTick]);

  useEffect(() => {
    if (!active || (!selected && !expandedUpload)) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { setSelected(null); setExpandedUpload(null); return true; });
    return () => subscription.remove();
  }, [active, selected, expandedUpload]);

  const imported = uploadedCourses(uploadedRows, data?.courses ?? []);
  const matchesSearch = (item: { code: string; name: string; section: string | null }) => `${item.code} ${item.name} ${item.section ?? ''}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  const filteredImported = imported.filter(matchesSearch);
  const weekdays = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
  const course = data?.courses.find((item) => item.id === selected);
  const sessions = data?.sessions.filter((session) => course ? session.courseId === course.id : session.onDate === day) ?? [];
  const openCourse = (id: string) => { setSelected(id); };

  function sessionList() {
    return sessions.length ? sessions.map((session) => {
      const subject = data?.courses.find((item) => item.id === session.courseId);
      return <View key={session.id} style={styles.session}>
        <Text style={styles.time}>{time(session.startsAt)}–{time(session.endsAt)}</Text>
        <View style={styles.sessionBody}>
          {course ? <Text style={styles.text}>{dateLabel(session.onDate, true)}</Text> : <Pressable accessibilityRole="button" accessibilityLabel={`ดูรายวิชา ${subject?.code ?? ''}`} style={styles.courseLink} onPress={() => openCourse(session.courseId)}>
            <Text style={styles.code}>{subject?.code}</Text><Text style={styles.text}>{subject?.name}</Text>
          </Pressable>}
          <Text style={styles.muted}>{session.kind === 'exam' ? 'สอบ' : 'เรียน'}{session.title ? ` · ${session.title}` : ''} · {session.roomName || 'ยังไม่ระบุห้อง'}</Text>
          {!course && subject?.section && <Text style={styles.muted}>กลุ่ม {subject.section}</Text>}
        </View>
      </View>;
    }) : <Text style={styles.empty}>{course ? 'ยังไม่มีคาบใน 7 วันนี้' : 'ไม่มีคาบในวันนี้'}</Text>;
  }

  const uploadedDetail = imported.find(item => item.key === expandedUpload);
  async function connectUploadedCourse() {
    if (!uploadedDetail || !ownershipProof || connecting) return;
    setConnecting(true);
    setConnectError(null);
    try {
      const result = await apiFetch<{ results: { status: string; message: string; courseId?: string }[] }>('/me/timetable/enroll', { method: 'POST', body: JSON.stringify({ rows: uploadedDetail.rows, ownershipProof }) });
      const connected = result.results.find(item => (item.status === 'enrolled' || item.status === 'existing') && item.courseId);
      if (!connected) throw new Error(result.results[0]?.message ?? 'ยังเชื่อมรายวิชาไม่ได้');
      onEnrollmentChanged?.();
      const studies = await apiFetch<StudentStudies>('/me/studies');
      setData(studies);
      setSelected(connected.courseId!);
      setExpandedUpload(null);
    } catch (cause) {
      setConnectError(cause instanceof Error ? cause.message : 'เชื่อมรายวิชาไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setConnecting(false);
    }
  }

  if (uploadedDetail) return <ScrollView contentContainerStyle={styles.content}>
    <Pressable style={styles.back} onPress={() => setExpandedUpload(null)}><Text style={styles.link}>กลับรายวิชา</Text></Pressable>
    <Text accessibilityRole="header" style={styles.title}>{uploadedDetail.code}</Text>
    <Text style={styles.name}>{uploadedDetail.name || 'ยังไม่ระบุชื่อวิชา'}</Text>
    <Text style={styles.muted}>กลุ่ม {uploadedDetail.section || 'ยังไม่ระบุ'} · จากตารางที่อัปโหลด</Text>
    <View style={styles.course}><Text accessibilityRole="header" style={styles.heading}>ผลเข้าเรียนของฉัน</Text><Text style={styles.muted}>วิชานี้ยังไม่เชื่อมกับรายวิชาที่ลงทะเบียนในระบบ จึงยังแสดงผลมาเรียน มาสาย ขาด และลาไม่ได้</Text>
      <Pressable disabled={connecting || !ownershipProof} accessibilityState={{ disabled: connecting || !ownershipProof, busy: connecting }} style={styles.action} onPress={() => void connectUploadedCourse()}><Text style={styles.actionText}>{connecting ? 'กำลังตรวจสอบรายวิชา…' : 'ยืนยันเข้ารายวิชาเพื่อดูผลเข้าเรียน'}</Text></Pressable>
      {connectError && <Text accessibilityRole="alert" style={styles.error}>{connectError}</Text>}
    </View>
    {uploadedDetail.rows.map((row, index) => <View key={index} style={styles.course}>
      <Text style={styles.text}>{row.weekday === null ? 'ยังไม่ระบุวัน' : `วัน${weekdays[row.weekday]}`} · {row.startTime || '—'}–{row.endTime || '—'}</Text>
      <Text style={styles.muted}>{row.roomName || 'ยังไม่ระบุห้อง'}</Text>
      <Text style={styles.muted}>{row.teacherName || 'ยังไม่ระบุอาจารย์'}</Text>
    </View>)}
  </ScrollView>;

  return <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={() => setReload((value) => value + 1)} tintColor={colors.ink} />}>
    {course ? <>
      <Pressable accessibilityRole="button" style={styles.back} onPress={() => { setSelected(null); }}><Text style={styles.link}>กลับ{mode === 'courses' ? 'รายวิชา' : 'ตารางเรียน'}</Text></Pressable>
      <Text style={styles.title}>{course.code}</Text>
      <Text style={styles.name}>{course.name}</Text>
      {course.section && <Text style={styles.muted}>กลุ่ม {course.section}</Text>}
    </> : <>
      <Text accessibilityRole="header" style={styles.title}>{mode === 'courses' ? 'รายวิชาของฉัน' : 'ตารางเรียน 7 วัน'}</Text>
      <View accessibilityRole="tablist" style={styles.modes}>
        {([['courses', 'รายวิชา'], ['timetable', 'ตารางเรียน']] as const).map(([value, label]) => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: mode === value }} onPress={() => setMode(value)} style={[styles.mode, mode === value && styles.modeSelected]}><Text style={[styles.modeText, mode === value && styles.modeSelectedText]}>{label}</Text></Pressable>)}
      </View>
    </>}
    {error && <View style={styles.feedback}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Pressable accessibilityRole="button" style={styles.back} onPress={() => setReload((value) => value + 1)}><Text style={styles.link}>ลองใหม่</Text></Pressable></View>}
    {!data ? loading && <ActivityIndicator accessibilityLabel="กำลังโหลดรายวิชา" color={colors.ink} /> : course ? <>
      <AttendanceCourseSection key={course.id} courseId={course.id} />
      <Text style={styles.heading}>คาบเรียนและสอบ · 7 วัน</Text>
      {sessionList()}
    </> : mode === 'courses' ? <>
      <View style={styles.searchField}><AppIcon name="search" color={colors.muted} size={20} /><TextInput accessibilityLabel="ค้นหารายวิชา" placeholder="ค้นหารหัสหรือชื่อวิชา" placeholderTextColor={colors.muted} value={search} onChangeText={setSearch} style={styles.search} autoCapitalize="none" /></View>
      {data.courses.filter((item) => `${item.code} ${item.name} ${item.section ?? ''}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).map((item) => <Pressable key={item.id} accessibilityRole="button" onPress={() => openCourse(item.id)} style={({ pressed }) => [styles.course, pressed && styles.pressed]}>
        <View style={styles.courseTop}><View style={styles.courseSymbol}><AppIcon name="book" /></View><Text style={styles.code}>{item.code}{item.section ? ` · กลุ่ม ${item.section}` : ''}</Text><AppIcon name="chevron" size={18} color={colors.muted} /></View>
        <Text style={styles.courseName}>{item.name}</Text>
        <Text style={styles.muted}>คาบเรียนและผลเข้าเรียน</Text>
      </Pressable>)}
      {data.courses.length === 0 && imported.length === 0 && !uploadError && !uploadedLoading ? <Text style={styles.empty}>ยังไม่มีรายวิชาที่ลงทะเบียน</Text> : !filteredImported.length && !uploadError && !uploadedLoading && !data.courses.some(matchesSearch) && <Text style={styles.empty}>ไม่พบรายวิชา</Text>}
    </> : <>
      <ScrollView horizontal style={styles.dayStrip} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days}>
        {daysFrom(data.from).map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: value === day }} style={[styles.day, value === day && styles.daySelected]} onPress={() => setDay(value)}><Text style={[styles.dayText, value === day && styles.daySelectedText]}>{value === data.from ? 'วันนี้' : dateLabel(value, true)}</Text></Pressable>)}
      </ScrollView>
      <Text style={styles.heading}>{day ? dateLabel(day) : ''}</Text>
      {sessionList()}
    </>}
    {!course && mode === 'courses' && <>
      {filteredImported.map(item => <View key={item.key} style={styles.course}>
        <Pressable accessibilityLabel={`ดูรายละเอียด ${item.code} จากตารางที่อัปโหลด`} accessibilityState={{ expanded: expandedUpload === item.key }} onPress={() => { setConnectError(null); setExpandedUpload(item.key); }} style={styles.uploadedButton}>
          <View style={styles.courseTop}><View style={styles.courseSymbol}><AppIcon name="book" /></View><Text style={styles.code}>{item.code}{item.section ? ` · กลุ่ม ${item.section}` : ''}</Text><AppIcon name="chevron" size={18} color={colors.muted} /></View>
          <Text style={styles.courseName}>{item.name || 'ยังไม่ระบุชื่อวิชา'}</Text>
          <Text style={styles.uploadedBadge}>จากตารางที่อัปโหลด</Text>
        </Pressable>

      </View>)}
      {uploadError && <View style={styles.feedback}><Text accessibilityRole="alert" style={styles.error}>โหลดรายวิชาจากตารางที่บันทึกไม่สำเร็จ</Text><Pressable style={styles.back} onPress={() => setReload(value => value + 1)}><Text style={styles.link}>ลองใหม่</Text></Pressable></View>}
    </>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  uploadedButton: { gap: 8 },
  uploadedBadge: { fontSize: 12, lineHeight: 20, color: colors.action },
  content: { flexGrow: 1, padding: 24, gap: 16, width: '100%', maxWidth: 800, alignSelf: 'center' },
  modes: { flexDirection: 'row', gap: 4, backgroundColor: colors.selected, borderRadius: 14, padding: 4 },
  mode: { flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 10 },
  modeSelected: { backgroundColor: colors.surface },
  modeText: { fontSize: 15, color: colors.muted },
  modeSelectedText: { color: colors.action, fontWeight: '600' },
  title: { ...typography.pageTitle },
  name: { fontSize: 20, lineHeight: 30, color: colors.ink },
  heading: { fontSize: 18, lineHeight: 28, fontWeight: '600', color: colors.ink, marginTop: 8 },
  text: { fontSize: 16, lineHeight: 26, color: colors.ink },
  muted: { fontSize: 14, lineHeight: 22, color: colors.muted },
  searchField: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.outline, borderRadius: 14 },
  search: { flex: 1, minWidth: 0, minHeight: 52, paddingHorizontal: 0, fontSize: 16, color: colors.ink },
  courseTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  courseSymbol: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.selected, justifyContent: 'center', alignItems: 'center' },
  courseName: { fontSize: 18, lineHeight: 28, fontWeight: '500', color: colors.ink },
  course: { padding: 20, gap: 8, backgroundColor: colors.surface, borderRadius: 16 },
  code: { flex: 1, fontSize: 15, lineHeight: 24, color: colors.action, fontWeight: '600' },
  link: { fontSize: 14, lineHeight: 22, color: colors.action, textDecorationLine: 'underline' },
  back: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: 8 },
  dayStrip: { flexGrow: 0 },
  days: { gap: 8 },
  day: { minHeight: 48, padding: 12, borderRadius: 12, backgroundColor: colors.surface, justifyContent: 'center' },
  daySelected: { backgroundColor: colors.action },
  dayText: { fontSize: 14, color: colors.ink },
  daySelectedText: { color: colors.surface },
  session: { padding: 18, gap: 12, flexDirection: 'row', flexWrap: 'wrap', backgroundColor: colors.surface, borderRadius: 16 },
  time: { minWidth: 112, fontSize: 15, lineHeight: 28, color: colors.ink, fontWeight: '600', fontVariant: ['tabular-nums'] },
  sessionBody: { gap: 4, flex: 1, minWidth: 160 },
  courseLink: { minHeight: 48, justifyContent: 'center', gap: 4 },
  empty: { paddingVertical: 32, fontSize: 16, lineHeight: 26, color: colors.muted, textAlign: 'center' },
  feedback: { gap: 8 },
  error: { fontSize: 16, lineHeight: 24, color: colors.danger },
  action: { minHeight: 48, backgroundColor: colors.action, padding: 16, alignItems: 'center', borderRadius: 12 },
  actionText: { fontSize: 16, fontWeight: '600', color: colors.surface },
  pressed: { opacity: 0.9 },
});
