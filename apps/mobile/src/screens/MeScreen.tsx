import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError, apiFetch } from '../lib/api';
import { supabase } from '../lib/supabase';

interface Me {
  id: string;
  email: string;
  fullName: string | null;
  role: 'student' | 'teacher' | 'admin';
  studentId: string | null;
}

const ROLE_LABEL: Record<Me['role'], string> = {
  student: 'นักศึกษา',
  teacher: 'อาจารย์',
  admin: 'ผู้ดูแลระบบ',
};

interface Props {
  // เด้งกลับหน้า login พร้อมข้อความ
  onRejected: (message: string) => void;
}

export function MeScreen({ onRejected }: Props) {
  const [me, setMe] = useState<Me | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<Me>('/me')
      .then(setMe)
      .catch(async (e: unknown) => {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
          await supabase.auth.signOut();
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
        <Pressable style={styles.button} onPress={() => supabase.auth.signOut()}>
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

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{me.fullName ?? me.email}</Text>
      <Text>{me.email}</Text>
      <Text>บทบาท: {ROLE_LABEL[me.role]}</Text>
      {me.studentId && <Text>รหัสนักศึกษา: {me.studentId}</Text>}
      <Pressable style={styles.button} onPress={() => supabase.auth.signOut()}>
        <Text>ออกจากระบบ</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 10, backgroundColor: '#fff' },
  title: { fontSize: 20, fontWeight: '600' },
  error: { color: '#dc2626' },
  button: { borderWidth: 1, borderRadius: 8, padding: 12, alignItems: 'center', marginTop: 8 },
});
