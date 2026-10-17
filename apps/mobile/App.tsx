import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './src/lib/supabase';
import { LoginScreen } from './src/screens/LoginScreen';
import { MeScreen } from './src/screens/MeScreen';

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const onRejected = useCallback((message: string) => setLoginError(message), []);

  return (
    <View style={styles.root}>
      {session === undefined ? (
        <ActivityIndicator style={styles.root} />
      ) : session ? (
        <MeScreen onRejected={onRejected} />
      ) : (
        <LoginScreen key={loginError ?? ''} error={loginError} />
      )}
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
});
