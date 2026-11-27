import {useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentRef} from 'react';
import {AccessibilityInfo, Animated, Easing, ScrollView, StyleSheet, View, type LayoutChangeEvent} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {Pressable, Text} from './primitives';
import {colors, workspace} from './theme';

export const TABS = [
  {key: 'home', label: 'หน้าหลัก', path: 'M3 10 12 3l9 7v11h-6v-7H9v7H3Z'},
  {key: 'courses', label: 'รายวิชา', path: 'M4 4h6v16H4z M14 4h6v16h-6z'},
  {key: 'leave', label: 'เอกสาร', path: 'M6 3h8l4 4v14H6z M14 3v5h4 M9 12h6 M9 16h6'},
  {key: 'account', label: 'บัญชี', path: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 22v-3a8 8 0 0 1 16 0v3'},
] as const;
export type Tab = typeof TABS[number]['key'];

const iconWidth = 56;
const tabTop = 6;

function TabItem({item, selected, localIndicator, wide, motion, onPress, onLayout}: {
  item: typeof TABS[number];
  selected: boolean;
  localIndicator: boolean;
  wide: boolean;
  motion: boolean;
  onPress: () => void;
  onLayout: (event: LayoutChangeEvent) => void;
}) {
  const [press] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (!motion) press.setValue(1);
    return () => press.stopAnimation();
  }, [motion, press]);

  const animatePress = (pressed: boolean) => {
    if (!motion) return;
    Animated.timing(press, {
      toValue: pressed ? 0.9 : 1, duration: pressed ? 90 : 150,
      easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start();
  };

  return <Pressable
    accessibilityRole="tab"
    accessibilityLabel={item.label}
    accessibilityState={{selected}}
    onPress={onPress}
    onPressIn={() => animatePress(true)}
    onPressOut={() => animatePress(false)}
    onLayout={onLayout}
    style={[styles.tab, wide && styles.railTab]}
  >
    <Animated.View style={[styles.icon, localIndicator && selected && styles.selectedIcon, {transform: [{scale: press}]}]}>
      <Svg width={23} height={23} viewBox="0 0 24 24" fill="none" stroke={selected ? colors.action : colors.muted} strokeWidth={selected ? 2 : 1.7} strokeLinecap="round" strokeLinejoin="round"><Path d={item.path}/></Svg>
    </Animated.View>
    <Text maxFontSizeMultiplier={1.3} style={[styles.label, selected && styles.selectedLabel]}>{item.label}</Text>
  </Pressable>;
}

export function StudentTabBar({tab, wide, bottom, onNavigate}: {tab: Tab; wide: boolean; bottom: number; onNavigate: (tab: Tab) => void}) {
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const positions = useRef<Partial<Record<Tab, number>>>({});
  const [centers, setCenters] = useState<Partial<Record<Tab, number>>>({});
  const [indicator] = useState(() => new Animated.Value(0));
  const previousTab = useRef<Tab | null>(null);
  const target = wide ? undefined : centers[tab];
  const [motion, setMotion] = useState(false);
  useLayoutEffect(() => {
    if (target === undefined) {
      previousTab.current = null;
      return;
    }
    const shouldSlide = motion && previousTab.current !== null && previousTab.current !== tab;
    previousTab.current = tab;
    if (!shouldSlide) {
      indicator.setValue(target);
      return;
    }
    const animation = Animated.timing(indicator, {
      toValue: target, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [indicator, motion, tab, target]);
  useEffect(() => {
    let pending = true;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', reduced => {
      pending = false;
      setMotion(!reduced);
    });
    AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (pending) setMotion(!reduced);
    }).catch(() => {});
    return () => {
      pending = false;
      subscription.remove();
    };
  }, []);
  const revealSelected = useCallback(() => {
    if (wide && positions.current[tab] !== undefined) scroll.current?.scrollTo({y: Math.max(0, positions.current[tab]! - 8), animated: false});
  }, [tab, wide]);
  useEffect(revealSelected, [revealSelected]);
  const items = TABS.map(item => <TabItem
    key={item.key}
    item={item}
    selected={tab === item.key}
    localIndicator={target === undefined}
    wide={wide}
    motion={motion}
    onPress={() => onNavigate(item.key)}
    onLayout={event => {
      const {x, y, width} = event.nativeEvent.layout;
      if (wide) {
        positions.current[item.key] = y;
        if (item.key === tab) revealSelected();
      } else {
        const left = x + (width - iconWidth) / 2;
        setCenters(current => current[item.key] === left ? current : {...current, [item.key]: left});
      }
    }}
  />);
  return <View accessibilityRole="tablist" style={[styles.navigation, {paddingBottom: Math.max(8, bottom)}, wide && styles.rail]}>
    {wide ? <ScrollView ref={scroll} style={styles.scroll} contentContainerStyle={styles.railContent} onLayout={revealSelected} onContentSizeChange={revealSelected}>{items}</ScrollView> :
      <View style={styles.bottomTabs}>
        {target !== undefined && <Animated.View pointerEvents="none" style={[styles.indicator, styles.selectedIcon, {transform: [{translateX: indicator}]}]} />}
        {items}
      </View>}
  </View>;
}

const styles = StyleSheet.create({
  navigation: {flexDirection: 'row', flexShrink: 0, borderTopWidth: 1, borderColor: workspace.divider, backgroundColor: colors.surface, paddingHorizontal: 12, gap: 4},
  rail: {width: 112, flexDirection: 'column', borderTopWidth: 0, borderRightWidth: 1},
  scroll: {flex: 1},
  railContent: {paddingTop: 24},
  bottomTabs: {flex: 1, flexDirection: 'row', gap: 4},
  tab: {flex: 1, minWidth: 0, minHeight: 60, alignItems: 'center', gap: 2, paddingTop: tabTop, paddingBottom: 2},
  railTab: {flex: 0, marginBottom: 8, paddingVertical: 12},
  icon: {width: iconWidth, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center'},
  indicator: {position: 'absolute', top: tabTop, left: 0, width: iconWidth, height: 30, borderRadius: 15},
  selectedIcon: {backgroundColor: colors.selected},
  label: {maxWidth: '100%', fontSize: 12, lineHeight: 18, color: colors.muted, textAlign: 'center'},
  selectedLabel: {color: colors.onSelected, fontWeight: '600'},
});
