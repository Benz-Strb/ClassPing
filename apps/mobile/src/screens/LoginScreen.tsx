import { colors } from '../ui/theme';
import { useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
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
}

export function LoginScreen({ error: initialError, onDpuChat }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);

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
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.content}>
        <Text style={styles.brand}>ClassPing</Text>
        <View style={styles.form}>
          <Text style={styles.heading}>เข้าสู่ระบบนักศึกษา</Text>
          <Text style={styles.subtitle}>ใช้บัญชี @dpu.ac.th</Text>
          {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          <Pressable accessibilityRole="button" accessibilityLabel="เข้าสู่ระบบด้วย Google" accessibilityState={{ disabled: loading, busy: loading }} style={({ pressed }) => [styles.button, pressed && styles.pressed, loading && styles.disabled]} onPress={signIn} disabled={loading}>
            {loading ? <ActivityIndicator color={colors.surface} /> : <Text style={styles.buttonText}>เข้าสู่ระบบด้วย Google</Text>}
          </Pressable>
        </View>
        <View style={styles.guest}>
          <Text style={styles.subtitle}>ถามข้อมูลมหาวิทยาลัย ไม่ต้องเข้าสู่ระบบ</Text>
          <Pressable accessibilityRole="button" style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]} onPress={onDpuChat}>
            <Text style={styles.secondaryButtonText}>DPU Chat</Text>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: 28 },
  brand: { fontSize: 26, fontWeight: '700', color: colors.identity },
  subtitle: { fontSize: 16, lineHeight: 24, color: colors.muted },
  form: { gap: 16, padding: 24, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  heading: { fontSize: 28, lineHeight: 40, fontWeight: '500', color: colors.identity },
  error: { fontSize: 16, lineHeight: 24, color: colors.danger },
  button: { minHeight: 52, backgroundColor: colors.action, borderRadius: 12, padding: 16, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.9 },
  buttonText: { color: colors.surface, fontSize: 16, fontWeight: '600', textAlign: 'center' },
  guest: { gap: 12, paddingTop: 24, borderTopWidth: 1, borderColor: colors.border },
  secondaryButton: { minHeight: 48, padding: 12, borderWidth: 1, borderColor: colors.ink, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: colors.ink, fontSize: 16, fontWeight: '600', textAlign: 'center' },
});
