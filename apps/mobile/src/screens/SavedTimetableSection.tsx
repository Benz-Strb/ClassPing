import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { apiFetch } from '../lib/api';
import type { TimetableEntry } from '../lib/timetable-grid';
import { Pressable, Text } from '../ui/primitives';
import { colors } from '../ui/theme';
import { TimetableGrid } from './TimetableGrid';

interface SavedTimetable {
  rows: TimetableEntry[];
  identity: { fullName: string; studentId: string };
  expiresAt: string;
}

export function SavedTimetableSection({ active, refreshTick }: { active: boolean; refreshTick: number }) {
  const [data, setData] = useState<SavedTimetable | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!active) return;
    let current = true;
    setLoading(true);
    setError(false);
    apiFetch<SavedTimetable | null>('/me/timetable')
      .then(value => { if (current) setData(value); })
      .catch(() => { if (current) setError(true); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [active, refreshTick, retry]);

  if (!data && !loading && !error) return null;
  return <View style={styles.surface}>
    {data && Date.parse(data.expiresAt) > Date.now() && <TimetableGrid rows={data.rows} identity={data.identity} inlinePreview />}
    {loading && !data && <ActivityIndicator color={colors.action} accessibilityLabel="กำลังโหลดตารางเรียนที่บันทึก" />}
    {error && <View style={styles.feedback}>
      <Text style={styles.message}>โหลดตารางเรียนที่บันทึกไม่สำเร็จ</Text>
      <Pressable onPress={() => setRetry(value => value + 1)} style={styles.retry}><Text style={styles.retryText}>ลองใหม่</Text></Pressable>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  surface: { padding: 16, borderRadius: 16, backgroundColor: colors.surface },
  feedback: { gap: 8, alignItems: 'flex-start' },
  message: { color: colors.muted, fontSize: 14, lineHeight: 22 },
  retry: { minHeight: 48, paddingHorizontal: 16, justifyContent: 'center', backgroundColor: colors.selected, borderRadius: 12 },
  retryText: { color: colors.action, fontSize: 14, fontWeight: '500' },
});
