import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError, apiFetch } from '../lib/api';
import { supabase } from '../lib/supabase';
import type { FaceStatus, Me } from '../lib/types';
import { ConsentScreen } from './ConsentScreen';
import { EnrollScreen } from './EnrollScreen';
import { IdentityScreen } from './IdentityScreen';

const ROLE_LABEL: Record<Me['role'], string> = {
  student: 'นักศึกษา',
  teacher: 'อาจารย์',
  admin: 'ผู้ดูแลระบบ',
};

interface Props {
  // เด้งกลับหน้า login พร้อมข้อความ
  onRejected: (message: string) => void;
}

const signOut = () => supabase.auth.signOut();

// นักศึกษาต้องยินยอมก่อน ยืนยันบัตร แล้วถ่ายรูปให้ครบ ถึงจะเห็นข้อมูลบัญชี
export function MeScreen({ onRejected }: Props) {
  const [me, setMe] = useState<Me | null>(null);
  const [face, setFace] = useState<FaceStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [card, setCard] = useState<string | null>(null);
  const [cardError, setCardError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const user = await apiFetch<Me>('/me');
      // บัญชีที่ไม่มีรหัสนักศึกษาไม่ต้องลงทะเบียนใบหน้า
      const status = user.studentId ? await apiFetch<FaceStatus>('/me/face') : null;
      setMe(user);
      setFace(status);
    })().catch(async (e: unknown) => {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
        await signOut();
        onRejected(e.code === 'DOMAIN_NOT_ALLOWED' ? 'ใช้ได้เฉพาะเมล @dpu.ac.th' : e.message);
        return;
      }
      setError(e instanceof Error ? e.message : 'เรียกระบบไม่สำเร็จ');
    });
  }, [onRejected]);

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.error}>{error}</Text>
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

  if (me.studentId && !me.pdpaConsentAt) {
    return <ConsentScreen onAccepted={setMe} onSignOut={signOut} />;
  }

  if (face && !face.verified && !card) {
    return (
      <IdentityScreen
        error={cardError}
        onPicked={(uri) => {
          setCard(uri);
          setCardError(null);
        }}
        onSignOut={signOut}
      />
    );
  }

  if (face && !face.complete) {
    return (
      <EnrollScreen
        // ท่าที่ถ่ายไว้ก่อนยืนยันบัตรจะถูกล้าง เริ่มจากหน้าตรงใหม่
        done={face.verified ? face.done : []}
        card={face.verified ? null : card}
        onCardRejected={(message) => {
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
      />
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{me.fullName ?? me.email}</Text>
      <Text>{me.email}</Text>
      <Text>บทบาท: {ROLE_LABEL[me.role]}</Text>
      {me.studentId && <Text>รหัสนักศึกษา: {me.studentId}</Text>}
      {face ? (
        <Text style={face.complete ? styles.ok : styles.pending}>
          {face.complete ? 'ลงทะเบียนใบหน้าแล้ว' : 'ยังไม่ได้ลงทะเบียนใบหน้า'}
        </Text>
      ) : (
        <Text style={styles.pending}>บัญชีนี้ใช้งานบนเว็บ</Text>
      )}
      <Pressable style={styles.button} onPress={signOut}>
        <Text>ออกจากระบบ</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 10, backgroundColor: '#fff' },
  title: { fontSize: 20, fontWeight: '600' },
  error: { color: '#dc2626' },
  ok: { color: '#15803d', marginTop: 8 },
  pending: { color: '#6b7280', marginTop: 8 },
  button: { borderWidth: 1, borderRadius: 8, padding: 12, alignItems: 'center', marginTop: 8 },
});
