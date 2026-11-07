import { colors } from '../ui/theme';
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

export function CoursesScreen({ active }: { active: boolean }) {
  const [data, setData] = useState<StudentStudies | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'courses' | 'timetable'>('courses');
  const [selected, setSelected] = useState<string | null>(null);
  const [day, setDay] = useState('');
  const [search, setSearch] = useState('');
  const [showAttendance, setShowAttendance] = useState(false);

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
  }, [active, reload]);

  useEffect(() => {
    if (!active || !selected) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { setSelected(null); setShowAttendance(false); return true; });
    return () => subscription.remove();
  }, [active, selected]);

  const course = data?.courses.find((item) => item.id === selected);
  const sessions = data?.sessions.filter((session) => course ? session.courseId === course.id : session.onDate === day) ?? [];
  const openCourse = (id: string) => { setSelected(id); setShowAttendance(false); };

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

  return <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={() => setReload((value) => value + 1)} tintColor={colors.ink} />}>
    {course ? <>
      <Pressable accessibilityRole="button" style={styles.back} onPress={() => { setSelected(null); setShowAttendance(false); }}><Text style={styles.link}>กลับ{mode === 'courses' ? 'รายวิชา' : 'ตารางเรียน'}</Text></Pressable>
      <Text style={styles.title}>{course.code}</Text>
      <Text style={styles.name}>{course.name}</Text>
      {course.section && <Text style={styles.muted}>กลุ่ม {course.section}</Text>}
    </> : <>
      <View accessibilityRole="tablist" style={styles.modes}>
        {([['courses', 'รายวิชา'], ['timetable', 'ตารางเรียน']] as const).map(([value, label]) => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: mode === value }} onPress={() => setMode(value)} style={[styles.mode, mode === value && styles.modeSelected]}><Text style={[styles.modeText, mode === value && styles.modeSelectedText]}>{label}</Text></Pressable>)}
      </View>
      <Text accessibilityRole="header" style={styles.title}>{mode === 'courses' ? 'รายวิชาของฉัน' : 'ตารางเรียน 7 วัน'}</Text>
    </>}
    {error && <View style={styles.feedback}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Pressable accessibilityRole="button" style={styles.back} onPress={() => setReload((value) => value + 1)}><Text style={styles.link}>ลองใหม่</Text></Pressable></View>}
    {!data ? loading && <ActivityIndicator accessibilityLabel="กำลังโหลดรายวิชา" color={colors.ink} /> : course ? <>
      <Text style={styles.heading}>คาบเรียนและสอบ · 7 วัน</Text>
      {sessionList()}
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: showAttendance }} style={styles.action} onPress={() => setShowAttendance((value) => !value)}><Text style={styles.actionText}>{showAttendance ? 'ซ่อนผลเข้าเรียน' : 'ดูผลเข้าเรียน'}</Text></Pressable>
      {showAttendance && <AttendanceCourseSection courseId={course.id} />}
    </> : mode === 'courses' ? <>
      <TextInput accessibilityLabel="ค้นหารายวิชา" placeholder="ค้นหารหัสหรือชื่อวิชา" placeholderTextColor={colors.muted} value={search} onChangeText={setSearch} style={styles.search} autoCapitalize="none" />
      {data.courses.filter((item) => `${item.code} ${item.name} ${item.section ?? ''}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).map((item) => <Pressable key={item.id} accessibilityRole="button" onPress={() => openCourse(item.id)} style={({ pressed }) => [styles.course, pressed && styles.pressed]}>
        <Text style={styles.code}>{item.code}{item.section ? ` · กลุ่ม ${item.section}` : ''}</Text>
        <Text style={styles.text}>{item.name}</Text>
        <Text style={styles.link}>ดูคาบเรียนและผลเข้าเรียน</Text>
      </Pressable>)}
      {data.courses.length === 0 ? <Text style={styles.empty}>ยังไม่มีรายวิชาที่ลงทะเบียน</Text> : !data.courses.some((item) => `${item.code} ${item.name} ${item.section ?? ''}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())) && <Text style={styles.empty}>ไม่พบรายวิชา</Text>}
    </> : <>
      <ScrollView horizontal style={styles.dayStrip} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days}>
        {daysFrom(data.from).map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: value === day }} style={[styles.day, value === day && styles.daySelected]} onPress={() => setDay(value)}><Text style={[styles.dayText, value === day && styles.daySelectedText]}>{value === data.from ? 'วันนี้' : dateLabel(value, true)}</Text></Pressable>)}
      </ScrollView>
      <Text style={styles.heading}>{day ? dateLabel(day) : ''}</Text>
      {sessionList()}
    </>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, padding: 24, gap: 16, width: '100%', maxWidth: 800, alignSelf: 'center' },
  modes: { flexDirection: 'row', gap: 8, backgroundColor: colors.selected, borderRadius: 12, padding: 4 },
  mode: { flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 6 },
  modeSelected: { backgroundColor: colors.surface },
  modeText: { fontSize: 16, color: colors.muted },
  modeSelectedText: { color: colors.action, fontWeight: '600' },
  title: { fontSize: 27, lineHeight: 38, color: colors.identity, fontWeight: '500' },
  name: { fontSize: 20, lineHeight: 30, color: colors.ink },
  heading: { fontSize: 18, lineHeight: 28, fontWeight: '600', color: colors.ink, marginTop: 8 },
  text: { fontSize: 16, lineHeight: 26, color: colors.ink },
  muted: { fontSize: 14, lineHeight: 22, color: colors.muted },
  search: { minHeight: 48, padding: 12, borderWidth: 1, borderColor: colors.outline, borderRadius: 8, fontSize: 16, color: colors.ink },
  course: { paddingVertical: 20, gap: 6, borderBottomWidth: 1, borderColor: colors.border },
  code: { fontSize: 18, lineHeight: 28, color: colors.identity, fontWeight: '500' },
  link: { fontSize: 14, lineHeight: 22, color: colors.action, textDecorationLine: 'underline' },
  back: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: 8 },
  dayStrip: { flexGrow: 0 },
  days: { gap: 8 },
  day: { minHeight: 48, padding: 12, borderRadius: 8, backgroundColor: colors.background, justifyContent: 'center' },
  daySelected: { backgroundColor: colors.action },
  dayText: { fontSize: 14, color: colors.ink },
  daySelectedText: { color: colors.surface },
  session: { paddingVertical: 20, gap: 16, flexDirection: 'row', flexWrap: 'wrap', borderBottomWidth: 1, borderColor: colors.border },
  time: { minWidth: 112, fontSize: 16, lineHeight: 28, color: colors.ink, fontWeight: '600', fontVariant: ['tabular-nums'] },
  sessionBody: { gap: 4, flex: 1, minWidth: 160 },
  courseLink: { minHeight: 48, justifyContent: 'center', gap: 4 },
  empty: { paddingVertical: 32, fontSize: 16, lineHeight: 26, color: colors.muted, textAlign: 'center' },
  feedback: { gap: 8 },
  error: { fontSize: 16, lineHeight: 24, color: colors.danger },
  action: { minHeight: 48, backgroundColor: colors.action, padding: 16, alignItems: 'center', borderRadius: 8 },
  actionText: { fontSize: 16, fontWeight: '600', color: colors.surface },
  pressed: { opacity: 0.9 },
});
