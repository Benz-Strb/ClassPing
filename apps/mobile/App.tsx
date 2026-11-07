import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { Pressable, Text } from './src/ui/primitives';
import { useFonts } from 'expo-font';
import { colors, fontAssets } from './src/ui/theme';
import { StatusBar } from 'expo-status-bar';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabase';
import { LoginScreen } from './src/screens/LoginScreen';
import { MeScreen } from './src/screens/MeScreen';
import { ChatScreen } from './src/screens/ChatScreen';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

export default function App() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); setShowChat(false); });
    return () => data.subscription.unsubscribe();
  }, []);

  const onRejected = useCallback((message: string) => setLoginError(message), []);

  return (
    <SafeAreaProvider>
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.root}>
      {session === null && showChat && <Pressable accessibilityRole="button" style={styles.chatButton} onPress={() => setShowChat((value) => !value)}>
        <Text>กลับเข้าสู่ระบบ</Text>
      </Pressable>}
      {!fontsLoaded && !fontError || session === undefined ? (
        <ActivityIndicator color={colors.action} style={styles.root} />
      ) : !session && showChat ? (
        <SafeAreaView edges={['bottom']} style={styles.screen}><ChatScreen key="public" authenticated={false} /></SafeAreaView>
      ) : session ? (
        <MeScreen key={session.user.id} onRejected={onRejected} />
      ) : (
        <SafeAreaView edges={['bottom']} style={styles.screen}><LoginScreen key={loginError ?? ''} error={loginError} onDpuChat={() => setShowChat(true)} /></SafeAreaView>
      )}
      <StatusBar style="dark" />
    </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  screen: { flex: 1, backgroundColor: colors.background },
  chatButton: { padding: 16, backgroundColor: colors.selected },
});
