import { colors } from '../ui/theme';
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Pressable, Text } from '../ui/primitives';
import { decideScreen, canEnrollFace } from "../lib/access";
import { ApiError, apiFetch } from "../lib/api";
import { discardCard } from "../lib/face";
import { supabase } from "../lib/supabase";
import type { FaceStatus, Me } from "../lib/types";
import { ConsentScreen } from "./ConsentScreen";
import { StudentNavigator } from "./StudentNavigator";
import { EnrollScreen } from "./EnrollScreen";
import { IdentityScreen } from "./IdentityScreen";
import { WebOnlyScreen } from "./WebOnlyScreen";
import { SafeAreaView } from 'react-native-safe-area-context';

interface Props {
  // เด้งกลับหน้า login พร้อมข้อความ
  onRejected: (message: string) => void;
  // ออกจากระบบตามปกติ ให้ล้างข้อความเก่าที่หน้า login
  onSignedOut?: () => void;
  onReady?: (success: boolean) => void;
}

// นักศึกษาต้องยินยอมก่อน ยืนยันบัตร แล้วถ่ายรูปให้ครบ ถึงจะเห็นข้อมูลบัญชี
export function MeScreen({ onRejected, onSignedOut, onReady }: Props) {
  const [me, setMe] = useState<Me | null>(null);
  const [face, setFace] = useState<FaceStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [card, setCard] = useState<string | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);
  // เก็บการปฏิเสธความยินยอมเฉพาะรอบนี้
  const [consentDeclined, setConsentDeclined] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (me || error) onReady?.(!error);
  }, [me, error, onReady]);

  const cardRef = useRef<string | null>(null);
  cardRef.current = card;

  // ภาพบัตรที่ค้างอยู่ต้องไม่ติดเครื่องเมื่อออกจากระบบกลางทาง
  useEffect(() => () => discardCard(cardRef.current), []);

  const signOut = () => {
    discardCard(cardRef.current);
    onSignedOut?.();
    return supabase.auth.signOut();
  };

  // ดึงสถานะใหม่ เช่นแอดมินรีเซ็ตใบหน้าหรือถอนความยินยอม
  const refresh = useCallback(async () => {
    try {
      const user = await apiFetch<Me>("/me");
      const status = user.studentId ? await apiFetch<FaceStatus>("/me/face") : null;
      setMe(user);
      setFace(status);
    } catch {
      // ใช้ข้อมูลเดิมต่อ
    }
  }, []);

  const startEnroll = () => {
    setConsentDeclined(false);
  };

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
        await supabase.auth.signOut();
        onRejected(
          e.code === "DOMAIN_NOT_ALLOWED"
            ? "ใช้ได้เฉพาะเมล @dpu.ac.th"
            : e.message,
        );
        return;
      }
      setError(e instanceof Error ? e.message : "เรียกระบบไม่สำเร็จ");
    });
  }, [onRejected, attempt]);

  if (error) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.container}>
        <Text style={styles.error}>{error}</Text>
        <Pressable
          accessibilityRole="button"
          style={styles.button}
          onPress={() => {
            setError(null);
            setAttempt((value) => value + 1);
          }}
        >
          <Text>ลองใหม่</Text>
        </Pressable>
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

  const screen = decideScreen({
    me,
    face,
    consentDeclined,
    enrolling: true,
    hasCard: !!card,
  });

  if (screen === "consent") {
    return <SafeAreaView edges={['bottom']} style={styles.screen}><ConsentScreen
      onAccepted={setMe}
      onContinueWithout={() => setConsentDeclined(true)}
      onSignOut={signOut}
    /></SafeAreaView>;
  }

  if (screen === "identity") {
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

  if (screen === "enroll" && face) {
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
        onComplete={(status) => {
          setFace(status);
          // ยืนยันบัตรแล้วชื่อไทย คณะ สาขาเปลี่ยน ดึงข้อมูลบัญชีใหม่
          void refresh();
        }}
        onUnauthorized={async (message) => {
          await supabase.auth.signOut();
          onRejected(message);
        }}
        onSignOut={signOut}
      /></SafeAreaView>
    );
  }

  if (screen === "student") {
    return (
      <StudentNavigator
        me={me}
        face={face}
        onEnroll={startEnroll}
        onRefresh={refresh}
        onSignOut={signOut}
      />
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}><WebOnlyScreen
      me={me}
      face={face}
      onEnroll={canEnrollFace(me) ? startEnroll : undefined}
      onSignOut={signOut}
    /></SafeAreaView>
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
