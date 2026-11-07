import { colors } from '../ui/theme';
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Pressable, Text } from '../ui/primitives';
import { ApiError, apiFetch } from "../lib/api";
import { discardCard } from "../lib/face";
import { supabase } from "../lib/supabase";
import type { FaceStatus, Me } from "../lib/types";
import { ConsentScreen } from "./ConsentScreen";
import { StudentNavigator } from "./StudentNavigator";
import { EnrollScreen } from "./EnrollScreen";
import { IdentityScreen } from "./IdentityScreen";
import { SafeAreaView } from 'react-native-safe-area-context';
import { AccountScreen } from './AccountScreen';

interface Props {
  // เด้งกลับหน้า login พร้อมข้อความ
  onRejected: (message: string) => void;
}

// นักศึกษาต้องยินยอมก่อน ยืนยันบัตร แล้วถ่ายรูปให้ครบ ถึงจะเห็นข้อมูลบัญชี
export function MeScreen({ onRejected }: Props) {
  const signOut = () => supabase.auth.signOut();
  const [me, setMe] = useState<Me | null>(null);
  const [face, setFace] = useState<FaceStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [card, setCard] = useState<string | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const user = await apiFetch<Me>("/me");
      // บัญชีที่ไม่มีรหัสนักศึกษาไม่ต้องลงทะเบียนใบหน้า
      const status = user.studentId
        ? await apiFetch<FaceStatus>("/me/face")
        : null;
      setMe(user);
      setFace(status);
    })().catch(async (e: unknown) => {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        await signOut();
        onRejected(
          e.code === "DOMAIN_NOT_ALLOWED"
            ? "ใช้ได้เฉพาะเมล @dpu.ac.th"
            : e.message,
        );
        return;
      }
      setError(e instanceof Error ? e.message : "เรียกระบบไม่สำเร็จ");
    });
  }, [onRejected]);

  if (error) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.container}>
        <Text style={styles.error}>{error}</Text>
        <Pressable style={styles.button} onPress={signOut}>
          <Text>ออกจากระบบ</Text>
        </Pressable>
      </SafeAreaView>
    );
  }
  if (!me) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.container}>
        <ActivityIndicator color={colors.action} />
      </SafeAreaView>
    );
  }

  if (me.studentId && !me.pdpaConsentAt) {
    return <SafeAreaView edges={['bottom']} style={styles.screen}><ConsentScreen onAccepted={setMe} onSignOut={signOut} /></SafeAreaView>;
  }

  if (face && !face.verified && !card) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.screen}><IdentityScreen
        error={cardError}
        onPicked={(uri) => {
          setCard(uri);
          setCardError(null);
        }}
        onSignOut={signOut}
      /></SafeAreaView>
    );
  }

  if (face && !face.complete) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.screen}><EnrollScreen
        // ท่าที่ถ่ายไว้ก่อนยืนยันบัตรจะถูกล้าง เริ่มจากหน้าตรงใหม่
        done={face.verified ? face.done : []}
        card={face.verified ? null : card}
        onCardRejected={(message) => {
          discardCard(card);
          setFace({ ...face, verified: false });
          setCard(null);
          setCardError(message);
        }}
        onComplete={setFace}
        onUnauthorized={async (message) => {
          await signOut();
          onRejected(message);
        }}
        onSignOut={signOut}
      /></SafeAreaView>
    );
  }

  if (me.studentId) {
    return <StudentNavigator me={me} face={face} onSignOut={signOut} />;
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}><AccountScreen me={me} face={face} onSignOut={signOut} /></SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { flexGrow: 1, padding: 24, gap: 10 },
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    gap: 10,
    backgroundColor: colors.surface,
  },
  title: { fontSize: 20, fontWeight: "600" },
  error: { color: colors.danger },
  ok: { color: colors.action, marginTop: 8 },
  pending: { color: colors.muted, marginTop: 8 },
  primary: {
    backgroundColor: colors.action,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    marginTop: 8,
  },
  primaryText: { color: colors.surface, fontSize: 16 },
  button: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    marginTop: 8,
  },
});
