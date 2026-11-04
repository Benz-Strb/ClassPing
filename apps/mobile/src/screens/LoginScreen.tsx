import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>เข้าสู่ระบบด้วย Google</Text>}
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
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, backgroundColor: '#efefef' },
  content: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: 32 },
  brand: { fontSize: 22, fontWeight: '700', color: '#111' },
  subtitle: { fontSize: 16, lineHeight: 24, color: '#5e6168' },
  form: { gap: 12, paddingVertical: 24, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#d5d5d5' },
  heading: { fontSize: 18, fontWeight: '600', color: '#111' },
  error: { fontSize: 16, lineHeight: 24, color: '#b42318' },
  button: { minHeight: 52, backgroundColor: '#111', borderRadius: 8, padding: 16, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  guest: { gap: 12 },
  secondaryButton: { minHeight: 48, padding: 12, borderWidth: 1, borderColor: '#111', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: '#111', fontSize: 16, fontWeight: '600', textAlign: 'center' },
});
