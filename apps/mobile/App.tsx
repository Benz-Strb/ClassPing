import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabase';
import { LoginScreen } from './src/screens/LoginScreen';
import { MeScreen } from './src/screens/MeScreen';
import { ChatScreen } from './src/screens/ChatScreen';

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const onRejected = useCallback((message: string) => setLoginError(message), []);

  return (
    <View style={styles.root}>
      {session !== undefined && <Pressable accessibilityRole="button" style={styles.chatButton} onPress={() => setShowChat((value) => !value)}>
        <Text>{showChat ? 'กลับหน้าบัญชี / เข้าสู่ระบบ' : 'แชทผู้ช่วย / Open House'}</Text>
      </Pressable>}
      {session === undefined ? (
        <ActivityIndicator style={styles.root} />
      ) : showChat ? (
        <ChatScreen key={session?.user.id ?? 'public'} authenticated={!!session} />
      ) : session ? (
        <MeScreen key={session.user.id} onRejected={onRejected} />
      ) : (
        <LoginScreen key={loginError ?? ''} error={loginError} />
      )}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  chatButton: { padding: 16, paddingTop: 48, backgroundColor: '#eff6ff' },
});
