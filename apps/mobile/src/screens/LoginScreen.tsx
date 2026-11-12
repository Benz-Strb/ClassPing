import { colors } from '../ui/theme';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { AccessibilityInfo, ActivityIndicator, AppState, Animated, Easing, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { Pressable, ScrollView, Text } from '../ui/primitives';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../lib/supabase';
import { getMobileAuthRedirectUri } from '../lib/auth-redirect';

WebBrowser.maybeCompleteAuthSession();

interface Props {
  error: string | null;
  onDpuChat: () => void;
  transitionZoom?: Animated.Value;
  preparing?: boolean;
}

export function LoginScreen({ error: initialError, onDpuChat, transitionZoom, preparing = false }: Props) {
  const [signingIn, setLoading] = useState(false);
  const loading = signingIn || !!transitionZoom;
  const { width, height } = useWindowDimensions();
  const [error, setError] = useState(initialError);
  const screenRef = useRef<ComponentRef<typeof View>>(null);
  const emblemRef = useRef<ComponentRef<typeof View>>(null);
  const [emblemPosition, setEmblemPosition] = useState<{ x: number; y: number } | null>(null);

  function measureEmblem() {
    if (!transitionZoom || !screenRef.current) return;
    emblemRef.current?.measureLayout(screenRef.current, (x, y, areaWidth, areaHeight) => {
      setEmblemPosition({ x: x + areaWidth / 2 - 56, y: y + areaHeight / 2 - 56 });
    });
  }

  const entrance = useRef(new Animated.Value(1)).current;
  const ping = useRef(new Animated.Value(1)).current;
  const press = useRef(new Animated.Value(1)).current;
  const reduceMotion = useRef(true);
  const [motionReduced, setMotionReduced] = useState(true);
  const waitingMotion = useRef(new Animated.Value(0)).current;
  const waiting = transitionZoom ? preparing : signingIn;
  const drift = Animated.multiply(waitingMotion, transitionZoom ? transitionZoom.interpolate({ inputRange: [0, 0.2, 1], outputRange: [1, 0, 0] }) : 1);
  const waitingTransform = [
    { translateY: drift.interpolate({ inputRange: [-1, 0, 1], outputRange: [3, 0, -5] }) },
    { rotate: drift.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-8deg', '-6deg', '-3deg'] }) },
  ];

  useEffect(() => {
    let animation: Animated.CompositeAnimation | undefined;
    const update = (state: string) => {
      animation?.stop();
      if (!waiting || motionReduced || state !== 'active') {
        animation = Animated.timing(waitingMotion, { toValue: 0, duration: motionReduced ? 0 : 140, useNativeDriver: true });
      } else {
        animation = Animated.loop(Animated.sequence([
          Animated.timing(waitingMotion, { toValue: 1, duration: 550, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(waitingMotion, { toValue: -1, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(waitingMotion, { toValue: 0, duration: 550, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]));
      }
      animation.start();
    };
    update(AppState.currentState ?? 'active');
    const subscription = AppState.addEventListener('change', update);
    return () => { animation?.stop(); subscription.remove(); };
  }, [waiting, motionReduced, waitingMotion]);

  useEffect(() => {
    let active = true;
    let animation: Animated.CompositeAnimation | undefined;
    const updateMotion = (reduced: boolean) => {
      reduceMotion.current = reduced;
      setMotionReduced(reduced);
      animation?.stop();
      entrance.setValue(1);
      ping.setValue(1);
      press.setValue(1);
      if (reduced || !active || transitionZoom) return;
      entrance.setValue(0);
      ping.setValue(0);
      animation = Animated.parallel([
        Animated.timing(entrance, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(ping, { toValue: 1, duration: 1000, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]);
      animation.start();
    };
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', updateMotion);
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) updateMotion(value); }).catch(() => {});
    return () => { active = false; subscription.remove(); animation?.stop(); press.stopAnimation(); };
  }, [entrance, ping, press, transitionZoom]);

  function animatePress(pressed: boolean) {
    if (reduceMotion.current) return;
    Animated.timing(press, { toValue: pressed ? 0.97 : 1, duration: 120, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }

  async function signIn() {
    setLoading(true);
    setError(null);
    try {
      const isWeb = Platform.OS === 'web';
      const redirectTo = isWeb
        ? `${window.location.origin}${window.location.pathname}`
        : getMobileAuthRedirectUri(Constants.appOwnership, (path) => Linking.createURL(path));

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: !isWeb,
          queryParams: { hd: 'dpu.ac.th', prompt: 'select_account' },
        },
      });
      if (error || !data.url) throw error ?? new Error('เปิดหน้า Google ไม่ได้');
      if (isWeb) return;

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success') return; // ผู้ใช้ปิดหน้า login เอง

      const params = new URL(result.url).searchParams;
      const code = params.get('code');
      if (!code) {
        throw new Error(params.get('error_description') ?? 'เข้าสู่ระบบไม่สำเร็จ');
      }
      // สำเร็จแล้ว App จะเปลี่ยนไปหน้า Me เองผ่าน onAuthStateChange
      const exchanged = await supabase.auth.exchangeCodeForSession(code);
      if (exchanged.error) throw exchanged.error;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'เข้าสู่ระบบไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View ref={screenRef} style={styles.screen}>
      <View pointerEvents="none" style={StyleSheet.absoluteFill} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Svg width="100%" height="100%" viewBox="0 0 400 850" preserveAspectRatio="xMidYMid slice">
          <Defs>
            <LinearGradient id="loginSky" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#E5DAF6" />
              <Stop offset="0.48" stopColor={colors.background} />
              <Stop offset="1" stopColor="#E8DFF2" />
            </LinearGradient>
            <LinearGradient id="loginArc" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={colors.action} stopOpacity="0.12" />
              <Stop offset="1" stopColor={colors.action} stopOpacity="0.02" />
            </LinearGradient>
          </Defs>
          <Rect width="400" height="850" fill="url(#loginSky)" />
          <Circle cx="365" cy="70" r="180" fill="none" stroke="url(#loginArc)" strokeWidth="32" />
          <Circle cx="365" cy="70" r="224" fill="none" stroke={colors.action} strokeOpacity="0.08" strokeWidth="1" />
          <Circle cx="-85" cy="780" r="205" fill="none" stroke="url(#loginArc)" strokeWidth="42" />
          <Circle cx="-85" cy="780" r="260" fill="none" stroke={colors.action} strokeOpacity="0.09" strokeWidth="1" />
          <Circle cx="50" cy="190" r="4" fill={colors.action} fillOpacity="0.22" />
          <Circle cx="350" cy="660" r="6" fill={colors.action} fillOpacity="0.16" />
        </Svg>
      </View>
      <SafeAreaView style={styles.safeContent}>
      <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.content}>
        <View style={styles.hero}>
          <View ref={emblemRef} onLayout={measureEmblem} collapsable={false} style={styles.emblemArea} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Animated.View style={[styles.pingRing, { opacity: ping.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.45, 0] }), transform: [{ scale: ping.interpolate({ inputRange: [0, 1], outputRange: [0.65, 1.45] }) }] }]} />
            <Animated.View style={[styles.emblem, { transform: waitingTransform }, transitionZoom && emblemPosition && { opacity: 0 }]}>
              <Animated.View style={transitionZoom ? { opacity: transitionZoom.interpolate({ inputRange: [0, 0.3, 1], outputRange: [1, 0, 0] }) } : undefined}>
              <Svg width={66} height={66} viewBox="0 0 64 64" fill="none">
                <Path d="M43 16a22 22 0 1 0 5 31" stroke={colors.onAction} strokeWidth={7} strokeLinecap="round" />
                <Path d="m24 31 8 8 19-22" stroke={colors.onAction} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
              </Animated.View>
            </Animated.View>
          </View>
          <Text style={styles.brand}>ClassPing</Text>
        </View>

        <Animated.View style={[styles.form, { opacity: entrance.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }), transform: [{ translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>
          {error && <View style={styles.errorBox}><Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{error}</Text></View>}
          <Animated.View style={{ transform: [{ scale: press }] }}>
            <Pressable accessibilityRole="button" accessibilityLabel="เข้าสู่ระบบด้วย Google" accessibilityState={{ disabled: loading, busy: loading }} style={({ pressed }) => [styles.button, pressed && styles.pressed]} onPress={signIn} onPressIn={() => animatePress(true)} onPressOut={() => animatePress(false)} disabled={loading}>
              {loading ? <ActivityIndicator color={colors.onAction} /> : <View style={styles.googleMark}><Svg width={21} height={21} viewBox="0 0 24 24" accessible={false}>
                <Path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.24c1.9-1.75 2.98-4.33 2.98-7.36Z" />
                <Path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.24-2.51c-.9.6-2.04.96-3.38.96-2.6 0-4.81-1.76-5.6-4.13H3.05v2.59A10 10 0 0 0 12 22Z" />
                <Path fill="#FBBC05" d="M6.4 13.91a6 6 0 0 1 0-3.82V7.5H3.05a10 10 0 0 0 0 9l3.35-2.59Z" />
                <Path fill="#EA4335" d="M12 5.96c1.47 0 2.79.51 3.82 1.5l2.86-2.86A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.95 5.5l3.35 2.59C7.19 7.72 9.4 5.96 12 5.96Z" />
              </Svg></View>}
              <Text style={styles.buttonText}>{loading ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบด้วย Google'}</Text>
            </Pressable>
          </Animated.View>
          <Text style={styles.subtitle}>สำหรับบัญชี <Text style={styles.domain}>@dpu.ac.th</Text></Text>
        </Animated.View>

        <View style={styles.guest}>
          <Pressable accessibilityRole="button" accessibilityLabel="เปิด DPU Chat" style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]} onPress={onDpuChat}>
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" accessible={false}><Path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l-3 3V11.5A7.5 7.5 0 0 1 9.5 4h3a7.5 7.5 0 0 1 7.5 7.5Z" stroke={colors.action} strokeWidth={1.6} strokeLinejoin="round" /><Path d="M7 10h8m-8 4h5" stroke={colors.action} strokeWidth={1.6} strokeLinecap="round" /></Svg>
            <Text style={styles.secondaryButtonText}>DPU Chat</Text>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" accessible={false}><Path d="M5 12h14m-6-6 6 6-6 6" stroke={colors.action} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></Svg>
          </Pressable>
        </View>
      </View>
      </ScrollView>
      </SafeAreaView>
      {transitionZoom && emblemPosition && <Animated.View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.emblem, { position: 'absolute', left: emblemPosition.x, top: emblemPosition.y, transform: [...waitingTransform, { scale: transitionZoom.interpolate({ inputRange: [0, 1], outputRange: [1, Math.hypot(width, height) / 25] }) }] }]}>
        <Animated.View style={{ opacity: transitionZoom.interpolate({ inputRange: [0, 0.3, 1], outputRange: [1, 0, 0] }) }}>
          <Svg width={66} height={66} viewBox="0 0 64 64" fill="none">
            <Path d="M43 16a22 22 0 1 0 5 31" stroke={colors.onAction} strokeWidth={7} strokeLinecap="round" />
            <Path d="m24 31 8 8 19-22" stroke={colors.onAction} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </Animated.View>
      </Animated.View>}
    </View>
  );
}

const styles = StyleSheet.create({
  safeContent: { flex: 1 },
  screen: { flex: 1, backgroundColor: colors.background, overflow: 'hidden' },
  container: { flexGrow: 1, justifyContent: 'center', paddingVertical: 28 },
  content: { width: '100%', maxWidth: 380, alignSelf: 'center' },
  brand: { fontSize: 32, lineHeight: 44, fontWeight: '700', color: colors.action, letterSpacing: -1 },
  hero: { zIndex: 1, paddingBottom: 48, alignItems: 'center' },
  emblemArea: { width: 180, height: 172, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  pingRing: { position: 'absolute', width: 142, height: 142, borderRadius: 71, borderWidth: 2, borderColor: colors.action },
  emblem: { width: 112, height: 112, borderRadius: 32, backgroundColor: colors.action, alignItems: 'center', justifyContent: 'center', shadowColor: colors.action, shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 20, elevation: 5, transform: [{ rotate: '-6deg' }] },
  form: { gap: 16, alignItems: 'stretch' },
  subtitle: { fontSize: 13, lineHeight: 22, color: colors.muted, textAlign: 'center' },
  domain: { fontSize: 13, color: colors.action, fontWeight: '500' },
  errorBox: { padding: 12, backgroundColor: colors.dangerBg, borderRadius: 12 },
  error: { fontSize: 15, lineHeight: 24, color: colors.danger },
  button: { minHeight: 60, flexDirection: 'row', gap: 12, backgroundColor: colors.action, borderRadius: 16, padding: 14, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  pressed: { opacity: 0.85 },
  googleMark: { width: 32, height: 32, borderRadius: 9, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: colors.onAction, fontSize: 16, fontWeight: '600', textAlign: 'center' },
  guest: { gap: 14, marginTop: 32, alignItems: 'center' },
  secondaryButton: { minHeight: 48, paddingHorizontal: 20, paddingVertical: 10, flexDirection: 'row', gap: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: colors.action, fontSize: 15, fontWeight: '600', textAlign: 'center' },
});
