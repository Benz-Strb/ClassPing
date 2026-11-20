import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { useFonts } from 'expo-font';
import { colors, fontAssets } from './src/ui/theme';
import { StatusBar } from 'expo-status-bar';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabase';
import { LoginScreen } from './src/screens/LoginScreen';
import { AuthEntrance } from './src/ui/AuthEntrance';
import { MeScreen } from './src/screens/MeScreen';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

export default function App() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'SIGNED_IN') setLoginError(null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const onSignedOut = useCallback(() => setLoginError(null), []);
  const onRejected = useCallback((message: string) => setLoginError(message), []);

  return (
    <SafeAreaProvider>
    <SafeAreaView edges={session && fontsLoaded || session === null ? [] : ['top', 'left', 'right']} style={styles.root}>
      {!fontsLoaded && !fontError || session === undefined ? (
        <ActivityIndicator color={colors.action} style={styles.root} />
      ) : session ? (
        <AuthEntrance key={session.user.id}>{onReady => <SafeAreaView edges={['top', 'left', 'right']} style={styles.authenticatedScreen}><MeScreen onReady={onReady} onRejected={onRejected} onSignedOut={onSignedOut} /></SafeAreaView>}</AuthEntrance>
      ) : (
        <LoginScreen key={loginError ?? ''} error={loginError} />
      )}
      <StatusBar style="dark" />
    </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  authenticatedScreen: { flex: 1, backgroundColor: colors.surface },
});
