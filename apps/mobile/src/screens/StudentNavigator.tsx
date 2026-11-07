import { layout, colors } from '../ui/theme';
import { useEffect, useState } from 'react';
import { BackHandler, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Pressable, ScrollView, Text } from '../ui/primitives';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FaceStatus, Me } from '../lib/types';
import { AttendanceSummarySection } from './AttendanceSummarySection';
import { HomeStudies } from './HomeStudies';
import { CoursesScreen } from './CoursesScreen';
import { ChatScreen } from './ChatScreen';
import { LeaveScreen } from './LeaveScreen';
import { AccountScreen } from './AccountScreen';
import {StudentTabBar, TABS, type Tab} from '../ui/StudentTabBar';


export function StudentNavigator({ me, face, onSignOut }: {
  me: Me;
  face: FaceStatus | null;
  onSignOut: () => void;
}) {
  const [tab, setTab] = useState<Tab>('home');
  const [visited, setVisited] = useState<Set<Tab>>(() => new Set(['home']));
  const { width, height } = useWindowDimensions();
  const { bottom } = useSafeAreaInsets();
  const wide = width >= layout.tablet || width >= 600 && width > height;
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
    <View style={[styles.main, wide && { paddingBottom: bottom }]}>
      <View style={styles.header}>
        <View style={styles.brandGroup}><View style={styles.brandMark}><Text allowFontScaling={false} style={styles.brandInitial}>C</Text></View><Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={styles.brand}>ClassPing</Text></View>
        <Pressable accessibilityLabel="เปิดข้อมูลบัญชี" onPress={() => navigate('account')} style={styles.avatar}><Text allowFontScaling={false} style={styles.avatarText}>{(me.fullName ?? me.email).trim().slice(0, 1).toUpperCase()}</Text></Pressable>
      </View>
      {TABS.map(({ key }) => visited.has(key) && <View key={key} style={[styles.scene, tab !== key && styles.hidden]} accessibilityElementsHidden={tab !== key} importantForAccessibility={tab === key ? 'auto' : 'no-hide-descendants'}>
        {key === 'home' && <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.greeting}>
            <Text accessibilityRole="header" maxFontSizeMultiplier={1.8} style={styles.homeName}>ตารางและงานของวันนี้</Text>
            <Text style={styles.secondary}>{me.fullName ?? me.studentId}</Text>
          </View>
          <View style={[styles.dashboard, wide && styles.dashboardWide]}>
            <View style={[styles.panel, styles.schedulePanel, wide && styles.widePanel]}><HomeStudies onOpenCourses={() => navigate('courses')} onOpenAccount={() => navigate('account')} /></View>
            <View style={[styles.panel, wide && styles.widePanel]}><AttendanceSummarySection onOpenAccount={() => navigate('account')} /></View>
          </View>
          <View style={styles.shortcuts}>
            {(['courses', 'leave'] as const).map((key) => <Pressable key={key} onPress={() => navigate(key)} style={[styles.shortcut, key === 'courses' && styles.primaryShortcut]}>
              <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={key === 'courses' ? colors.onAction : colors.action} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><Path d={TABS.find(item => item.key === key)!.path} /></Svg>
              <Text style={[styles.shortcutText, key === 'courses' && styles.primaryShortcutText]}>{key === 'courses' ? 'ดูรายวิชาของฉัน' : 'ยื่นใบลา'}</Text>
            </Pressable>)}
          </View>
          <View style={styles.tip}><Text style={styles.tipTitle}>เข้าเรียนได้โดยไม่ต้องกดเช็กชื่อ</Text><Text style={styles.tipText}>กล้องในห้องเรียนบันทึกการเข้าเรียนให้คุณ ตรวจสอบผลย้อนหลังได้ที่รายวิชา</Text></View>
        </ScrollView>}
        {key === 'courses' && <CoursesScreen active={tab === 'courses'} />}
        {key === 'leave' && <LeaveScreen />}
        {key === 'chat' && <ChatScreen authenticated />}
        {key === 'account' && <AccountScreen me={me} face={face} onSignOut={onSignOut} />}
      </View>)}
    </View>
    <StudentTabBar tab={tab} wide={wide} bottom={bottom} onNavigate={navigate} />
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  wide: { flexDirection: 'row-reverse' },
  main: { flex: 1, minWidth: 0 },
  header: { backgroundColor: colors.surface, paddingHorizontal: 24, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: colors.border, gap: 4 },
  brandGroup: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandMark: { width: 28, height: 28, borderRadius: 8, backgroundColor: colors.action, alignItems: 'center', justifyContent: 'center' },
  brandInitial: { fontSize: 20, lineHeight: 26, fontWeight: '600', color: colors.onAction },
  brand: { fontSize: 20, fontWeight: '700', color: colors.identity },
  scene: { flex: 1 },
  hidden: { display: 'none' },
  content: { padding: 24, gap: 24, flexGrow: 1, width: '100%', maxWidth: 1040, alignSelf: 'center', paddingBottom: 32 },
  avatar: { width: 44, minHeight: 44, flexShrink: 0, borderRadius: 22, backgroundColor: colors.selected, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.action, fontWeight: '600', fontSize: 18 },
  greeting: { gap: 6, paddingVertical: 4 },
  homeName: { fontSize: 27, lineHeight: 38, fontWeight: '500', color: colors.identity },
  shortcuts: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginVertical: 4 },
  shortcut: { flex: 1, minWidth: 130, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: 14, backgroundColor: colors.selected },
  primaryShortcut: { backgroundColor: colors.action },
  shortcutText: { fontSize: 14, color: colors.action, fontWeight: '500' },
  primaryShortcutText: { color: colors.onAction },
  dashboard: { gap: 16 },
  dashboardWide: { flexDirection: 'row', alignItems: 'flex-start' },
  panel: { flexGrow: 1, minWidth: 0, backgroundColor: colors.surface, padding: 20, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  schedulePanel: { flexGrow: 2 },
  widePanel: { flex: 1 },
  tip: { paddingVertical: 8, gap: 4 },
  tipTitle: { fontSize: 14, fontWeight: '500' },
  tipText: { fontSize: 13, lineHeight: 21, color: colors.muted },
  secondary: { fontSize: 16, color: colors.muted, lineHeight: 24 },
});
