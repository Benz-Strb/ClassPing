import { layout, colors, typography, workspace } from '../ui/theme';
import { ProfileAvatar } from '../ui/ProfileAvatar';
import { useEffect, useState } from 'react';
import { AppState, BackHandler, RefreshControl, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Pressable, ScrollView, Text } from '../ui/primitives';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FaceStatus, Me } from '../lib/types';
import { AttendanceSummarySection } from './AttendanceSummarySection';
import { HomeStudies } from './HomeStudies';
import { CoursesScreen } from './CoursesScreen';
import { ChatScreen } from './ChatScreen';
import { DocumentsScreen } from './DocumentsScreen';
import { AccountScreen } from './AccountScreen';
import {StudentTabBar, TABS, type Tab} from '../ui/StudentTabBar';


export function StudentNavigator({ me, face, onEnroll, onRefresh, onSignOut }: {
  me: Me;
  face: FaceStatus | null;
  // กลับไปขั้นลงทะเบียนใบหน้า (ถามยินยอมก่อนถ้ายังไม่ยินยอม)
  onEnroll: () => void;
  // ดึงข้อมูลบัญชีและสถานะใบหน้าใหม่
  onRefresh: () => void;
  onSignOut: () => void;
}) {
  // เพิ่มทุกครั้งที่แอปกลับมาเปิด ให้แต่ละแท็บโหลดข้อมูลใหม่
  const [focusTick, setFocusTick] = useState(0);
  const [pulling, setPulling] = useState(false);
  const [pullTick, setPullTick] = useState(0);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setFocusTick((value) => value + 1);
    });
    return () => subscription.remove();
  }, []);
  const [tab, setTab] = useState<Tab>('home');
  const [visited, setVisited] = useState<Set<Tab>>(() => new Set(['home']));
  const { width, height } = useWindowDimensions();
  const { bottom } = useSafeAreaInsets();
  const wide = width >= layout.tablet || width >= 600 && width > height;
  const navigate = (next: Tab) => {
    setVisited((previous) => new Set([...previous, next]));
    setTab(next);
  };

  // เปิดหน้าบัญชีหรือกลับเข้าแอป ดึงสถานะใหม่ เช่นแอดมินรีเซ็ตใบหน้า
  useEffect(() => {
    if (tab === 'account') onRefresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, focusTick]);

  const needsFace = !!face && !face.complete;
  const enrollBanner = needsFace && <View style={styles.banner}>
    <Text style={styles.secondary}>{me.pdpaConsentAt ? 'ยังลงทะเบียนใบหน้าไม่ครบ กล้องในห้องเรียนจะยังเช็คชื่อให้คุณไม่ได้' : 'ยังไม่ได้ยินยอมให้ใช้ข้อมูลใบหน้า อาจารย์จะเช็คชื่อให้แทน'}</Text>
    <Pressable accessibilityRole="button" style={styles.action} onPress={onEnroll}><Text style={styles.actionText}>ลงทะเบียนใบหน้า</Text></Pressable>
  </View>;

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
        <View style={styles.brandGroup} accessible accessibilityLabel="ClassPing"><View style={styles.brandMark}><Svg width={25} height={25} viewBox="0 0 64 64" fill="none" accessible={false}><Path d="M43 16a22 22 0 1 0 5 31m-24-16 8 8 19-22" stroke={colors.onAction} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" /></Svg></View></View>
        <Pressable accessibilityLabel="เปิดข้อมูลบัญชี" onPress={() => navigate('account')} style={styles.avatarButton}><ProfileAvatar user={me} style={styles.avatar} textStyle={styles.avatarText} /></Pressable>
      </View>
      {TABS.map(({ key }) => visited.has(key) && <View key={key} style={[styles.scene, tab !== key && styles.hidden]} accessibilityElementsHidden={tab !== key} importantForAccessibility={tab === key ? 'auto' : 'no-hide-descendants'}>
        {key === 'home' && <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={pulling} tintColor={colors.action} onRefresh={() => { setPulling(true); setPullTick((value) => value + 1); }} />}>
          <View style={styles.greeting}>
            <Text accessibilityRole="header" maxFontSizeMultiplier={1.8} style={styles.homeName}>วันนี้ของคุณ</Text>
            <Text style={styles.secondary}>{me.fullName ?? me.studentId}</Text>
          </View>
          {enrollBanner}
          <View style={[styles.dashboard, wide && styles.dashboardWide]}>
            <View style={[styles.panel, styles.schedulePanel, wide && styles.widePanel]}><HomeStudies refreshTick={focusTick + pullTick} onOpenCourses={() => navigate('courses')} onOpenAccount={() => navigate('account')} /></View>
            <View style={[styles.panel, wide && styles.widePanel]}><AttendanceSummarySection active={tab === 'home'} refreshTick={focusTick + pullTick} onSettled={() => setPulling(false)} onOpenAccount={() => navigate('account')} /></View>
          </View>
          <View style={styles.shortcuts}>
            {(['courses', 'leave'] as const).map((key) => <Pressable key={key} onPress={() => navigate(key)} style={[styles.shortcut, key === 'courses' && styles.primaryShortcut]}>
              <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={key === 'courses' ? colors.onAction : colors.action} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><Path d={TABS.find(item => item.key === key)!.path} /></Svg>
              <Text style={[styles.shortcutText, key === 'courses' && styles.primaryShortcutText]}>{key === 'courses' ? 'รายวิชาของฉัน' : 'เอกสารของฉัน'}</Text>
            </Pressable>)}
          </View>
        </ScrollView>}
        {key === 'courses' && <CoursesScreen active={tab === 'courses'} refreshTick={focusTick + pullTick} onEnrollmentChanged={() => setFocusTick(value => value + 1)} />}
        {key === 'leave' && <DocumentsScreen active={tab === 'leave'} focusTick={focusTick} onTimetableImported={() => setFocusTick(value => value + 1)} />}
        {key === 'chat' && <ChatScreen authenticated />}
        {key === 'account' && <AccountScreen me={me} face={face} banner={enrollBanner} onSignOut={onSignOut} />}
      </View>)}
    </View>
    <StudentTabBar tab={tab} wide={wide} bottom={bottom} onNavigate={navigate} />
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: workspace.background },
  wide: { flexDirection: 'row-reverse' },
  main: { flex: 1, minWidth: 0 },
  header: { backgroundColor: colors.surface, paddingHorizontal: 24, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  brandGroup: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandMark: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.action, alignItems: 'center', justifyContent: 'center' },
  scene: { flex: 1 },
  hidden: { display: 'none' },
  content: { paddingTop: 24, paddingHorizontal: 24, gap: 20, flexGrow: 1, width: '100%', maxWidth: 1040, alignSelf: 'center', paddingBottom: 32 },
  avatarButton: { width: 48, height: 48, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 44, height: 44, flexShrink: 0, borderRadius: 22, backgroundColor: colors.selected, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.action, fontWeight: '600', fontSize: 18 },
  greeting: { gap: 6, paddingBottom: 4 },
  homeName: { ...typography.pageTitle },
  shortcuts: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  shortcut: { flex: 1, minWidth: 130, minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: 14, backgroundColor: colors.surface },
  primaryShortcut: { backgroundColor: colors.action },
  shortcutText: { fontSize: 14, color: colors.action, fontWeight: '500' },
  primaryShortcutText: { color: colors.onAction },
  dashboard: { gap: 16 },
  dashboardWide: { flexDirection: 'row', alignItems: 'flex-start' },
  panel: { flexGrow: 1, minWidth: 0, backgroundColor: colors.surface, padding: 20, borderRadius: 16 },
  schedulePanel: { flexGrow: 2, backgroundColor: workspace.tint },
  widePanel: { flex: 1 },
  secondary: { fontSize: 16, color: colors.muted, lineHeight: 24 },
  banner: { gap: 10, padding: 16, borderRadius: 16, backgroundColor: workspace.tint },
  action: { minHeight: 48, padding: 12, borderRadius: 12, backgroundColor: colors.action, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 16, color: colors.onAction, fontWeight: '500' },
});
