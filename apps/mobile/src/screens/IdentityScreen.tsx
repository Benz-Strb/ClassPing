import { EnrollmentProgress } from '../ui/EnrollmentProgress';
import { AppIcon } from '../ui/AppIcon';
import { colors, typography, workspace } from '../ui/theme';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Pressable, Text, ScrollView } from '../ui/primitives';
import * as ImagePicker from 'expo-image-picker';
import { discardCard, prepareCard } from '../lib/face';

const STEPS = [
  'เปิดบัตรนักศึกษาออนไลน์ในแอปของมหาวิทยาลัย',
  'จับภาพหน้าจอทั้งใบ ต้องเห็นรหัส รูป และวันที่ด้านล่างรูป',
  'กดเลือกภาพด้านล่าง แล้วสแกนหน้าต่อ',
];

interface Props {
  // ข้อความจากรอบก่อน เช่น บัตรไม่ใช่ของวันนี้
  error: string | null;
  onPicked: (cardUri: string) => void;
  // ไว้ทีหลัง เข้าใช้ส่วนอื่นของแอปก่อน
  onSkip: () => void;
  onSignOut: () => void;
}

// ภาพบัตรใช้ยืนยันว่าเป็นเจ้าของบัญชี ส่งไปตรวจแล้วไม่ถูกเก็บ
export function IdentityScreen({ error, onPicked, onSkip, onSignOut }: Props) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function pick() {
    setBusy(true);
    setProblem(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      const asset = result.canceled ? null : result.assets[0];
      if (!asset) return;
      const card = await prepareCard(asset);
      // สำเนาที่ตัวเลือกรูปคัดลอกมาไม่ใช้แล้ว
      discardCard(asset.uri);
      onPicked(card);
    } catch {
      setProblem('เปิดภาพไม่สำเร็จ ลองเลือกใหม่อีกครั้ง');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <EnrollmentProgress current={1} />
      <View style={styles.heroIcon}><AppIcon name="card" size={36} /></View>
      <Text accessibilityRole="header" style={styles.title}>ยืนยันบัตรนักศึกษา</Text>
      <Text style={styles.body}>ใช้ภาพบัตรของวันนี้ ระบบจะเทียบรหัสกับบัญชี และเทียบหน้าในบัตรกับหน้าคุณ</Text>
      <View style={styles.instructions}>{STEPS.map((step, i) => (
        <View key={step} style={styles.step}><View style={styles.stepNumber}><Text style={styles.stepNumberText}>{i + 1}</Text></View><Text style={styles.stepText}>{step}</Text></View>
      ))}</View>
      {(problem ?? error) && <Text accessibilityRole="alert" style={styles.error}>{problem ?? error}</Text>}
      <Pressable style={styles.primary} onPress={pick} disabled={busy} accessibilityState={{ busy, disabled: busy }}>
        {busy ? <ActivityIndicator color={colors.surface} /> : <View style={styles.buttonContent}><AppIcon name="image" color={colors.onAction} size={22} /><Text style={styles.primaryText}>เลือกภาพบัตรนักศึกษา</Text></View>}
      </Pressable>
      <Pressable style={styles.link} onPress={onSkip} disabled={busy}>
        <Text style={styles.linkText}>ไว้ทีหลัง</Text>
      </Pressable>
      <Pressable style={styles.link} onPress={onSignOut}>
        <Text style={styles.linkText}>ออกจากระบบ</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1, justifyContent: 'center', maxWidth: 560, paddingVertical: 28, paddingHorizontal: 24, gap: 20, backgroundColor: workspace.background },
  heroIcon: { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selected },
  instructions: { gap: 20, padding: 20, borderRadius: 16, backgroundColor: colors.surface },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepNumber: { width: 28, height: 28, borderRadius: 10, backgroundColor: colors.selected, alignItems: 'center', justifyContent: 'center' },
  stepNumberText: { fontSize: 14, fontWeight: '500', color: colors.action },
  stepText: { flex: 1, fontSize: 15, lineHeight: 25, color: colors.ink },
  buttonContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  title: { ...typography.pageTitle },
  body: { fontSize: 15, lineHeight: 24, color: colors.muted },
  error: { color: colors.danger, fontSize: 15, padding: 14, borderRadius: 12, backgroundColor: colors.dangerBg },
  primary: { minHeight: 56, justifyContent: 'center', backgroundColor: colors.action, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 8 },
  primaryText: { color: colors.surface, fontSize: 16 },
  link: { minHeight: 48, justifyContent: 'center', alignItems: 'center', padding: 8 },
  linkText: { color: colors.muted },
});
