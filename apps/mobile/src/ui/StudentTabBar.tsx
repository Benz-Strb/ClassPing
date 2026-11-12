import {useCallback, useEffect, useRef, type ComponentRef} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {Pressable, Text} from './primitives';
import {colors, workspace} from './theme';

export const TABS = [
  {key: 'home', label: 'หน้าหลัก', path: 'M3 10 12 3l9 7v11h-6v-7H9v7H3Z'},
  {key: 'courses', label: 'รายวิชา', path: 'M4 4h6v16H4z M14 4h6v16h-6z'},
  {key: 'leave', label: 'เอกสาร', path: 'M6 3h8l4 4v14H6z M14 3v5h4 M9 12h6 M9 16h6'},
  {key: 'chat', label: 'ผู้ช่วย', path: 'M3 4h18v13H9l-6 4z M7 9h10 M7 13h6'},
  {key: 'account', label: 'บัญชี', path: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 22v-3a8 8 0 0 1 16 0v3'},
] as const;
export type Tab = typeof TABS[number]['key'];

export function StudentTabBar({tab, wide, bottom, onNavigate}: {tab: Tab; wide: boolean; bottom: number; onNavigate: (tab: Tab) => void}) {
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const positions = useRef<Partial<Record<Tab, number>>>({});
  const revealSelected = useCallback(() => {
    if (wide && positions.current[tab] !== undefined) scroll.current?.scrollTo({y: Math.max(0, positions.current[tab]! - 8), animated: false});
  }, [tab, wide]);
  useEffect(revealSelected, [revealSelected]);
  const items = TABS.map(item => <Pressable key={item.key} accessibilityRole="tab" accessibilityLabel={item.label} accessibilityState={{selected: tab === item.key}} onPress={() => onNavigate(item.key)} onLayout={event => {positions.current[item.key] = event.nativeEvent.layout.y; if (item.key === tab) revealSelected();}} style={[styles.tab, wide && styles.railTab]}>
    <View style={[styles.icon, tab === item.key && styles.selectedIcon]}><Svg width={23} height={23} viewBox="0 0 24 24" fill="none" stroke={tab === item.key ? colors.action : colors.muted} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><Path d={item.path}/></Svg></View>
    <Text maxFontSizeMultiplier={1.3} style={[styles.label, tab === item.key && styles.selectedLabel]}>{item.label}</Text>
  </Pressable>);
  return <View accessibilityRole="tablist" style={[styles.navigation, {paddingBottom: Math.max(8, bottom)}, wide && styles.rail]}>
    {wide ? <ScrollView ref={scroll} style={styles.scroll} contentContainerStyle={styles.railContent} onLayout={revealSelected} onContentSizeChange={revealSelected}>{items}</ScrollView> : items}
  </View>;
}

const styles = StyleSheet.create({
  navigation: {flexDirection: 'row', flexShrink: 0, borderTopWidth: 1, borderColor: workspace.divider, backgroundColor: colors.surface, paddingHorizontal: 8},
  rail: {width: 112, flexDirection: 'column', borderTopWidth: 0, borderRightWidth: 1},
  scroll: {flex: 1},
  railContent: {paddingTop: 24},
  tab: {flex: 1, minWidth: 0, minHeight: 62, alignItems: 'center', justifyContent: 'center', gap: 2, paddingTop: 8, paddingBottom: 2},
  railTab: {flex: 0, marginBottom: 8, paddingVertical: 12},
  icon: {width: 48, height: 30, borderRadius: 12, alignItems: 'center', justifyContent: 'center'},
  selectedIcon: {backgroundColor: colors.selected},
  label: {maxWidth: '100%', fontSize: 12, lineHeight: 18, color: colors.muted, textAlign: 'center'},
  selectedLabel: {color: colors.action, fontWeight: '500'},
});
