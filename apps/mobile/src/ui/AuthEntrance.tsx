import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { LoginScreen } from '../screens/LoginScreen';
import { colors } from './theme';
import { Text } from './primitives';

interface Props {
  children: (onReady: (success: boolean) => void) => ReactNode;
}

export function AuthEntrance({ children }: Props) {
  const [ready, setReady] = useState<boolean | null>(null);
  const [finished, setFinished] = useState(false);
  const [reduced, setReduced] = useState<boolean | null>(null);
  const { height } = useWindowDimensions();
  const curtainOpacity = useRef(new Animated.Value(0)).current;
  const writing = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const zoom = useRef(new Animated.Value(0)).current;
  const wipe = useRef(new Animated.Value(0)).current;
  const reveal = useRef(new Animated.Value(0)).current;
  const onReady = useCallback((success: boolean) => setReady(current => current ?? success), []);

  useEffect(() => {
    let active = true;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduced(value); }).catch(() => { if (active) setReduced(true); });
    return () => { active = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    if (ready === null || reduced === null) return;
    const gentle = reduced || !ready;
    const animation = gentle ? Animated.timing(reveal, { toValue: 1, duration: 160, useNativeDriver: true }) : Animated.sequence([
      Animated.timing(zoom, { toValue: 1, duration: 650, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      Animated.timing(curtainOpacity, { toValue: 1, duration: 0, useNativeDriver: true }),
      Animated.delay(32),
      Animated.timing(reveal, { toValue: 1, duration: 0, useNativeDriver: true }),
      Animated.timing(titleOpacity, { toValue: 1, duration: 0, useNativeDriver: true }),
      Animated.timing(writing, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }),
      Animated.delay(200),
      Animated.timing(titleOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(wipe, { toValue: 1, duration: 850, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
    ]);
    animation.start(({ finished: completed }) => { if (completed) setFinished(true); });
    return () => animation.stop();
  }, [ready, reduced, reveal, zoom, wipe, curtainOpacity, writing, titleOpacity]);

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.root, { opacity: reveal }]} accessibilityElementsHidden={!finished} importantForAccessibility={finished ? 'auto' : 'no-hide-descendants'} pointerEvents={finished ? 'auto' : 'none'}>
        {children(onReady)}
      </Animated.View>
      {!finished && <Animated.View style={[styles.overlay, { opacity: reveal.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }]} accessibilityViewIsModal pointerEvents="none">
        <LoginScreen error={null} onDpuChat={() => {}} transitionZoom={zoom} preparing={ready === null} />
      </Animated.View>}
      {!finished && <Animated.View pointerEvents="none" style={[styles.curtain, { opacity: curtainOpacity, height: height + 160, transform: [{ translateY: wipe.interpolate({ inputRange: [0, 1], outputRange: [-160, height] }) }] }]}>
        <Svg width="100%" height={160} preserveAspectRatio="none" viewBox="0 0 1 160">
          <Defs><LinearGradient id="authMelt" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={colors.action} stopOpacity="0" /><Stop offset="0.5" stopColor={colors.action} stopOpacity="0.65" /><Stop offset="1" stopColor={colors.action} /></LinearGradient></Defs>
          <Rect width="1" height="160" fill="url(#authMelt)" />
        </Svg>
        <View style={styles.purple} />
      </Animated.View>}
      {!finished && <Animated.View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.titleLayer, { opacity: titleOpacity }]}>
        <View style={styles.wordmark}>
          <Text numberOfLines={1} allowFontScaling={false} style={styles.wordmarkText}>ClassPing</Text>
          <Animated.View style={[styles.inkMask, { transform: [{ translateX: writing.interpolate({ inputRange: [0, 1], outputRange: [0, 224] }) }] }]} />
        </View>
      </Animated.View>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  titleLayer: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  wordmark: { width: 224, height: 64, overflow: 'hidden' },
  wordmarkText: { width: 224, fontSize: 42, lineHeight: 64, fontWeight: '600', letterSpacing: -1, textAlign: 'center', color: colors.onAction },
  inkMask: { ...StyleSheet.absoluteFill, backgroundColor: colors.action },
  curtain: { position: 'absolute', top: 0, left: 0, right: 0 },
  purple: { flex: 1, backgroundColor: colors.action },
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.background },
});
