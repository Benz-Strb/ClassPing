import { useEffect, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { FaceStatus, Me } from '../lib/types';
import { AttendanceSummarySection } from './AttendanceSummarySection';
import { CoursesScreen } from './CoursesScreen';
import { ChatScreen } from './ChatScreen';
import { LeaveScreen } from './LeaveScreen';

const TABS = [
  { key: 'home', label: 'หน้าหลัก', path: 'M3 10 12 3l9 7v11h-6v-7H9v7H3Z' },
  { key: 'courses', label: 'รายวิชา', path: 'M4 3h7v18H4z M14 3h6v18h-6z M4 7h7 M14 7h6' },
  { key: 'leave', label: 'การลา', path: 'M5 4h14v17H5z M9 2v4 M15 2v4 M8 11h8 M8 15h5' },
  { key: 'chat', label: 'ผู้ช่วย', path: 'M3 4h18v13H9l-6 4z M7 9h10 M7 13h6' },
  { key: 'account', label: 'บัญชี', path: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 22v-3a8 8 0 0 1 16 0v3' },
] as const;
type Tab = typeof TABS[number]['key'];

export function StudentNavigator({ me, face, onSignOut }: {
  me: Me;
  face: FaceStatus | null;
  onSignOut: () => void;
}) {
  const [tab, setTab] = useState<Tab>('home');
  const [visited, setVisited] = useState<Set<Tab>>(() => new Set(['home']));
  const wide = useWindowDimensions().width >= 768;
  const navigate = (next: Tab) => {
    setVisited((previous) => new Set([...previous, next]));
    setTab(next);
  };

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (tab === 'home') return false;
      setTab('home');
      return true;
    });
    return () => subscription.remove();
  }, [tab]);

  return <View style={[styles.root, wide && styles.wide]}>
    <View style={styles.main}>
      <View style={styles.header}>
        <Text style={styles.brand}>ClassPing</Text>
        <Text style={styles.subtitle}>{TABS.find((item) => item.key === tab)?.label}</Text>
      </View>
      {TABS.map(({ key }) => visited.has(key) && <View key={key} style={[styles.scene, tab !== key && styles.hidden]} accessibilityElementsHidden={tab !== key} importantForAccessibility={tab === key ? 'auto' : 'no-hide-descendants'}>
        {key === 'home' && <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>สวัสดี {me.fullName ?? me.studentId}</Text>
          <Text style={styles.secondary}>ติดตามการเข้าเรียนของคุณ</Text>
          <AttendanceSummarySection />
          <Pressable accessibilityRole="button" style={styles.action} onPress={() => navigate('courses')}>
            <Text style={styles.actionText}>ดูรายวิชาและรายละเอียดเข้าเรียน</Text>
          </Pressable>
        </ScrollView>}
        {key === 'courses' && <CoursesScreen active={tab === 'courses'} />}
        {key === 'leave' && <LeaveScreen />}
        {key === 'chat' && <ChatScreen authenticated />}
        {key === 'account' && <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>ข้อมูลบัญชี</Text>
          <Text style={styles.name}>{me.fullName ?? me.email}</Text>
          <Text selectable style={styles.secondary}>{me.email}</Text>
          <View style={styles.row}><Text>รหัสนักศึกษา</Text><Text selectable>{me.studentId}</Text></View>
          <View style={styles.row}><Text>บทบาท</Text><Text>นักศึกษา</Text></View>
          <View style={styles.row}><Text>ใบหน้า</Text><Text>{face?.complete ? 'ลงทะเบียนแล้ว' : 'ยังไม่ครบ'}</Text></View>
          <Pressable accessibilityRole="button" style={styles.action} onPress={onSignOut}><Text style={styles.actionText}>ออกจากระบบ</Text></Pressable>
        </ScrollView>}
      </View>)}
    </View>
    <View accessibilityRole="tablist" style={[styles.navigation, wide && styles.rail]}>
      {TABS.map((item) => <Pressable key={item.key} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{ selected: tab === item.key }} onPress={() => navigate(item.key)} style={[styles.tab, wide && styles.railTab, tab === item.key && styles.selected]}>
        <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={tab === item.key ? '#111111' : '#5e6168'} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><Path d={item.path} /></Svg>
        <Text style={[styles.label, tab === item.key && styles.selectedLabel]}>{item.label}</Text>
      </Pressable>)}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  wide: { flexDirection: 'row-reverse' },
  main: { flex: 1, minWidth: 0 },
  header: { paddingHorizontal: 24, paddingVertical: 16, borderBottomWidth: 1, borderColor: '#e5e5e5', gap: 4 },
  brand: { fontSize: 20, fontWeight: '700', color: '#111' },
  subtitle: { fontSize: 14, color: '#5e6168' },
  scene: { flex: 1 },
  hidden: { display: 'none' },
  content: { padding: 24, gap: 16, flexGrow: 1, width: '100%', maxWidth: 800, alignSelf: 'center' },
  title: { fontSize: 24, fontWeight: '600', color: '#111' },
  name: { fontSize: 18, fontWeight: '600', marginTop: 16 },
  secondary: { fontSize: 16, color: '#5e6168', lineHeight: 24 },
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, paddingVertical: 16, borderBottomWidth: 1, borderColor: '#e5e5e5' },
  action: { minHeight: 48, padding: 16, borderRadius: 8, backgroundColor: '#111', alignItems: 'center', marginTop: 16 },
  actionText: { fontSize: 16, color: '#fff', fontWeight: '600' },
  navigation: { flexDirection: 'row', borderTopWidth: 1, borderColor: '#dedede', backgroundColor: '#efefef', padding: 4, gap: 4 },
  rail: { width: 120, flexDirection: 'column', borderTopWidth: 0, borderRightWidth: 1, paddingTop: 24 },
  tab: { flex: 1, minHeight: 64, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 8 },
  railTab: { flex: 0, marginBottom: 8 },
  selected: { backgroundColor: '#fff' },
  label: { fontSize: 12, color: '#5e6168', textAlign: 'center' },
  selectedLabel: { color: '#111', fontWeight: '700' },
});
