import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabase';
import { LoginScreen } from './src/screens/LoginScreen';
import { MeScreen } from './src/screens/MeScreen';
import { ChatScreen } from './src/screens/ChatScreen';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      setShowChat(false);
      if (event === 'SIGNED_IN') setLoginError(null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const onSignedOut = useCallback(() => setLoginError(null), []);
  const onRejected = useCallback((message: string) => setLoginError(message), []);

  return (
    <SafeAreaProvider>
    <SafeAreaView style={styles.root}>
      {session === null && showChat && <Pressable accessibilityRole="button" style={styles.chatButton} onPress={() => setShowChat((value) => !value)}>
        <Text>กลับเข้าสู่ระบบ</Text>
      </Pressable>}
      {session === undefined ? (
        <ActivityIndicator style={styles.root} />
      ) : !session && showChat ? (
        <ChatScreen key="public" authenticated={false} />
      ) : session ? (
        <MeScreen key={session.user.id} onRejected={onRejected} onSignedOut={onSignedOut} />
      ) : (
        <LoginScreen key={loginError ?? ''} error={loginError} onDpuChat={() => setShowChat(true)} />
      )}
      <StatusBar style="auto" />
    </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  chatButton: { padding: 16, backgroundColor: '#efefef' },
});
