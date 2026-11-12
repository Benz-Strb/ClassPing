import { SectionHeading } from '../ui/SectionHeading';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, useWindowDimensions } from 'react-native';
import { ApiError, apiFetch } from '../lib/api';
import type { StudentStudies } from '../lib/types';
import { Pressable, Text } from '../ui/primitives';
import { colors, typography } from '../ui/theme';

export function HomeStudies({ refreshTick = 0, onOpenCourses, onOpenAccount }: { refreshTick?: number; onOpenCourses: () => void; onOpenAccount: () => void }) {
  const {fontScale} = useWindowDimensions();
  const [data, setData] = useState<StudentStudies | null>(null);
  const [error, setError] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setError(null);
    apiFetch<StudentStudies>('/me/studies').then(value => { if (active) setData(value); }).catch(cause => { if (active) setError(cause instanceof ApiError ? cause.status : 0); });
    return () => { active = false; };
  }, [revision, refreshTick]);
  const sessions = data?.sessions.filter(session => session.onDate === data.from) ?? [];
  const time = (value: string) => new Date(value).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
  return <View style={styles.section}>
    <SectionHeading icon="calendar">คาบเรียนวันนี้</SectionHeading>
    <Text style={styles.date}>{new Date().toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', weekday: 'long', day: 'numeric', month: 'short' })}</Text>
    {error !== null ? <View style={styles.feedback}><Text style={styles.muted}>{error === 403 ? 'บัญชีนี้ยังไม่มีสิทธิ์ดูตารางเรียน' : 'ยังโหลดตารางเรียนไม่ได้ กรุณาลองอีกครั้ง'}</Text><Pressable onPress={error === 403 ? onOpenAccount : () => setRevision(value => value + 1)} style={styles.retry}><Text style={styles.retryText}>{error === 403 ? 'ตรวจสอบบัญชี' : 'ลองใหม่'}</Text></Pressable></View> : !data ? <ActivityIndicator color={colors.action} /> : sessions.length ? sessions.map(session => {
      const course = data.courses.find(item => item.id === session.courseId);
      return <Pressable key={session.id} onPress={onOpenCourses} style={[styles.lesson, fontScale > 1.6 && styles.lessonStacked]} accessibilityLabel={`ดูรายละเอียด ${course?.code ?? 'รายวิชา'}`}>
        <View style={[styles.time, fontScale > 1.6 && styles.timeExpanded]}><Text>{time(session.startsAt)}</Text><Text style={styles.muted}>{time(session.endsAt)}</Text></View>
        <View style={styles.details}><Text style={styles.code}>{course?.code}{course?.section ? ` · กลุ่ม ${course.section}` : ''}</Text><Text>{course?.name}</Text><Text style={styles.muted}>{session.roomName || 'ยังไม่ระบุห้อง'} · {session.kind === 'exam' ? 'คาบสอบ' : 'คาบเรียน'}</Text></View>
      </Pressable>;
    }) : <Text style={styles.muted}>ไม่มีคาบเรียนหรือสอบในวันนี้</Text>}
  </View>;
}

const styles = StyleSheet.create({
  section: { gap: 14 },
  date: { fontSize: 13, color: colors.muted },
  feedback: { gap: 4 },
  retry: { alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.selected },
  retryText: { fontSize: 14, fontWeight: '500', color: colors.action },
  lesson: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, paddingTop: 16, borderTopWidth: 1, borderColor: colors.border },
  time: { width: 64, gap: 4, paddingVertical: 8, alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12 },
  lessonStacked: { flexDirection: 'column' },
  timeExpanded: { width: '100%', flexDirection: 'row', gap: 16 },
  details: { flex: 1, minWidth: 140, gap: 4 },
  code: { fontSize: 15, fontWeight: '600', color: colors.action },
  muted: { fontSize: 14, lineHeight: 22, color: colors.muted },
});
