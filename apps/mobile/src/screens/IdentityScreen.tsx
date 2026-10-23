import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { prepareCard } from '../lib/face';

const STEPS = [
  'เปิดบัตรนักศึกษาออนไลน์ในแอปของมหาวิทยาลัย',
  'จับภาพหน้าจอทั้งใบ ต้องเห็นรหัส รูป และวันที่ด้านล่างรูป',
  'กดเลือกภาพด้านล่าง แล้วสแกนหน้าต่อ',
];

interface Props {
  // ข้อความจากรอบก่อน เช่น บัตรไม่ใช่ของวันนี้
  error: string | null;
  onPicked: (cardUri: string) => void;
  onSignOut: () => void;
}

// ภาพบัตรใช้ยืนยันว่าเป็นเจ้าของบัญชี ส่งไปตรวจแล้วไม่ถูกเก็บ
export function IdentityScreen({ error, onPicked, onSignOut }: Props) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function pick() {
    setBusy(true);
    setProblem(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      if (result.canceled || !result.assets[0]) return;
      onPicked(await prepareCard(result.assets[0]));
    } catch {
      setProblem('เปิดภาพไม่สำเร็จ ลองเลือกใหม่อีกครั้ง');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>ยืนยันตัวตนด้วยบัตรนักศึกษา</Text>
      <Text style={styles.body}>ใช้ภาพบัตรของวันนี้ ระบบจะเทียบรหัสกับบัญชี และเทียบหน้าในบัตรกับหน้าคุณ</Text>
      {STEPS.map((step, i) => (
        <Text key={step} style={styles.body}>
          {i + 1}. {step}
        </Text>
      ))}
      {(problem ?? error) && <Text style={styles.error}>{problem ?? error}</Text>}
      <Pressable style={styles.primary} onPress={pick} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>เลือกภาพบัตร</Text>}
      </Pressable>
      <Pressable style={styles.link} onPress={onSignOut}>
        <Text style={styles.linkText}>ออกจากระบบ</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', padding: 24, gap: 12, backgroundColor: '#fff' },
  title: { fontSize: 20, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 24, color: '#374151' },
  error: { color: '#dc2626', fontSize: 15 },
  primary: { backgroundColor: '#2563eb', borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  primaryText: { color: '#fff', fontSize: 16 },
  link: { alignItems: 'center', padding: 8 },
  linkText: { color: '#6b7280' },
});
