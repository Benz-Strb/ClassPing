import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../lib/supabase';

WebBrowser.maybeCompleteAuthSession();

interface Props {
  error: string | null;
}

export function LoginScreen({ error: initialError }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);

  async function signIn() {
    setLoading(true);
    setError(null);
    try {
      // ใน Expo Go จะได้ exp://<ip>:8081/--/... ต้องอยู่ใน Redirect URLs ของ Supabase
      const redirectTo = AuthSession.makeRedirectUri();
      console.log('redirectTo', redirectTo);

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          queryParams: { hd: 'dpu.ac.th', prompt: 'select_account' },
        },
      });
      if (error || !data.url) throw error ?? new Error('เปิดหน้า Google ไม่ได้');

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
    <View style={styles.container}>
      <Text style={styles.title}>ClassPing</Text>
      <Text style={styles.subtitle}>เข้าสู่ระบบด้วยเมลมหาวิทยาลัย (@dpu.ac.th)</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable style={[styles.button, loading && styles.disabled]} onPress={signIn} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>เข้าสู่ระบบด้วย Google</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12, backgroundColor: '#fff' },
  title: { fontSize: 24, fontWeight: '600' },
  subtitle: { color: '#4b5563' },
  error: { color: '#dc2626' },
  button: { backgroundColor: '#2563eb', borderRadius: 8, padding: 14, alignItems: 'center' },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 16 },
});
