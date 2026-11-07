import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
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

interface Props {
  // เด้งกลับหน้า login พร้อมข้อความ
  onRejected: (message: string) => void;
  // ออกจากระบบตามปกติ ให้ล้างข้อความเก่าที่หน้า login
  onSignedOut?: () => void;
}

// นักศึกษาต้องยินยอมก่อน ยืนยันบัตร แล้วถ่ายรูปให้ครบ ถึงจะเห็นข้อมูลบัญชี
export function MeScreen({ onRejected, onSignedOut }: Props) {
  const [me, setMe] = useState<Me | null>(null);
  const [face, setFace] = useState<FaceStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [card, setCard] = useState<string | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);
  // ไม่ยินยอมและข้ามการลงทะเบียน เก็บเฉพาะรอบนี้ ไม่ได้บันทึกฝั่งเซิร์ฟเวอร์
  const [consentDeclined, setConsentDeclined] = useState(false);
  const [enrolling, setEnrolling] = useState(true);
  const [attempt, setAttempt] = useState(0);
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
    setEnrolling(true);
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
      <View style={styles.container}>
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
      </View>
    );
  }
  if (!me) {
    return (
      <View style={styles.container}>
        <ActivityIndicator />
      </View>
    );
  }

  const screen = decideScreen({
    me,
    face,
    consentDeclined,
    enrolling,
    hasCard: !!card,
  });

  if (screen === "consent") {
    return (
      <ConsentScreen
        onAccepted={setMe}
        onContinueWithout={() => setConsentDeclined(true)}
        onSignOut={signOut}
      />
    );
  }

  if (screen === "identity") {
    return (
      <IdentityScreen
        error={cardError}
        onPicked={(uri) => {
          setCard(uri);
          setCardError(null);
        }}
        onSkip={() => setEnrolling(false)}
        onSignOut={signOut}
      />
    );
  }

  if (screen === "enroll" && face) {
    return (
      <EnrollScreen
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
          await supabase.auth.signOut();
          onRejected(message);
        }}
        onSkip={() => {
          discardCard(card);
          setCard(null);
          setEnrolling(false);
          // ยืนยันบัตรไปแล้วแต่ยังไม่ครบท่า ดึงสถานะจริงมาก่อนกลับหน้าหลัก
          void refresh();
        }}
        onSignOut={signOut}
      />
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
    <WebOnlyScreen
      me={me}
      face={face}
      onEnroll={canEnrollFace(me) ? startEnroll : undefined}
      onSignOut={signOut}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  content: { flexGrow: 1, padding: 24, gap: 10 },
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    gap: 10,
    backgroundColor: "#fff",
  },
  title: { fontSize: 20, fontWeight: "600" },
  error: { color: "#dc2626" },
  ok: { color: "#15803d", marginTop: 8 },
  pending: { color: "#6b7280", marginTop: 8 },
  primary: {
    backgroundColor: "#2563eb",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    marginTop: 8,
  },
  primaryText: { color: "#fff", fontSize: 16 },
  button: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    marginTop: 8,
  },
});
