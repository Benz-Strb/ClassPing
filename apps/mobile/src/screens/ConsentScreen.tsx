import { EnrollmentProgress } from '../ui/EnrollmentProgress';
import { AppIcon } from '../ui/AppIcon';
import { colors, typography, workspace } from '../ui/theme';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Pressable, ScrollView, Text } from '../ui/primitives';
import { apiFetch } from '../lib/api';
import type { Me } from '../lib/types';

// ใบหน้าเป็นข้อมูลอ่อนไหวตาม PDPA ต้องขอแยกต่างหากและบอกให้ครบก่อนเปิดกล้อง
const PARAGRAPHS = [
  'ClassPing จะเก็บรูปหน้าของคุณ และข้อมูลที่คำนวณจากรูป เพื่อใช้เช็คชื่อผ่านกล้องในห้องเรียนและห้องสอบ และแสดงชื่อคุณบนภาพกล้องให้อาจารย์ดู เฉพาะวิชาที่คุณลงทะเบียนเรียน',
  'ก่อนลงทะเบียนใบหน้า คุณต้องส่งภาพหน้าจอบัตรนักศึกษาออนไลน์ เพื่อยืนยันว่าเป็นเจ้าของบัญชี ระบบอ่านรหัส คณะ สาขา และเทียบหน้าในบัตร เก็บเฉพาะคณะกับสาขาไว้ในบัญชีของคุณ แล้วลบภาพบัตรทันที ไม่เก็บภาพไว้',
  'ข้อมูลนี้เห็นได้เฉพาะคุณ อาจารย์ผู้สอน อาจารย์คุมสอบ (เฉพาะคาบสอบที่คุม) และผู้ดูแลระบบ เราจะเก็บไว้จนคุณจบการศึกษา หรือจนกว่าคุณจะขอให้ลบ',
  'คุณถอนความยินยอมได้ทุกเมื่อโดยแจ้งผู้ดูแลระบบ ถ้าไม่ยินยอม อาจารย์จะเช็คชื่อให้แทน',
];

// กล้องวงจรปิดเป็นการแจ้งให้ทราบ ไม่ใช่ส่วนที่ต้องกดยินยอม
const CCTV_PARAGRAPHS = [
  'ห้องเรียนและห้องสอบมีกล้องวงจรปิด อัดเฉพาะภาพ ไม่อัดเสียง และอัดเฉพาะช่วงที่มีคาบ เพื่อเช็คชื่อ ดูแลความปลอดภัย และคุมสอบ',
  'ภาพดูได้เฉพาะอาจารย์ผู้สอน อาจารย์คุมสอบ และผู้ดูแลระบบ ทุกครั้งที่เปิดดูจะถูกบันทึกไว้ ระบบเก็บภาพ 30 วันแล้วลบ ยกเว้นคลิปที่อาจารย์ดาวน์โหลดไว้เป็นหลักฐาน',
  'ส่วนนี้เป็นการแจ้งให้ทราบ ไม่ขึ้นกับการกดยินยอมด้านบน ขอดูหรือขอสำเนาภาพของตัวเองได้ที่ผู้ดูแลระบบ',
];

interface Props {
  onAccepted: (me: Me) => void;
  // ไม่ยินยอมแล้วเข้าใช้ส่วนที่ไม่ใช้ใบหน้าต่อ (เฉพาะรอบนี้)
  onContinueWithout: () => void;
  onSignOut: () => void;
}

export function ConsentScreen({ onAccepted, onContinueWithout, onSignOut }: Props) {
  const [declined, setDeclined] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setSaving(true);
    setError(null);
    try {
      onAccepted(await apiFetch<Me>('/me/consent', { method: 'POST' }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง');
      setSaving(false);
    }
  }

  if (declined) {
    return (
      <ScrollView contentContainerStyle={styles.center}>
        <View style={styles.heroIcon}><AppIcon name="shield" size={32} /></View>
        <Text accessibilityRole="header" style={styles.title}>เลือกใช้งานได้ตามสะดวก</Text>
        <Text style={styles.body}>
          กล้องจะยังเช็คชื่อให้คุณไม่ได้ อาจารย์จะเช็คชื่อให้แทน ถ้าเปลี่ยนใจ กดลงทะเบียนใบหน้าในแอปได้ทุกเมื่อ ระบบจะถามยินยอมอีกครั้งตอนเปิดแอปใหม่
        </Text>
        <Pressable accessibilityRole="button" style={styles.primary} onPress={onContinueWithout}>
          <Text style={styles.primaryText}>เข้าใช้งานแอป</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => setDeclined(false)}>
          <Text>กลับไปอ่านอีกครั้ง</Text>
        </Pressable>
        <Pressable style={styles.link} onPress={onSignOut}>
          <Text style={styles.linkText}>ออกจากระบบ</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <EnrollmentProgress current={0} />
        <View style={styles.heroIcon}><AppIcon name="shield" size={32} /></View>
        <Text accessibilityRole="header" style={styles.title}>ยินยอมให้ใช้ข้อมูลใบหน้า</Text>
        <View style={styles.reading}>
        {PARAGRAPHS.map((text) => (
          <Text key={text} style={styles.body}>
            {text}
          </Text>
        ))}
        </View>
        <View style={styles.notice}>
        <View style={styles.noticeHeading}><AppIcon name="camera" size={20} /><Text style={styles.subtitle}>กล้องในห้องเรียนและห้องสอบ</Text></View>
        {CCTV_PARAGRAPHS.map((text) => (
          <Text key={text} style={styles.note}>
            {text}
          </Text>
        ))}
        </View>
      </ScrollView>
      <View style={styles.footer}>
        {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <Pressable
          style={[styles.primary, saving && styles.disabled]}
          onPress={accept}
          accessibilityState={{ busy: saving, disabled: saving }}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={colors.surface} />
          ) : (
            <Text style={styles.primaryText}>ยินยอม</Text>
          )}
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => setDeclined(true)} disabled={saving}>
          <Text>ไม่ยินยอม</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: workspace.background },
  content: { padding: 24, gap: 20, maxWidth: 640 },
  center: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 12, backgroundColor: workspace.background },
  heroIcon: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.selected },
  reading: { gap: 20, padding: 20, backgroundColor: colors.surface, borderRadius: 16 },
  notice: { gap: 16, padding: 20, backgroundColor: workspace.tint, borderRadius: 16 },
  noticeHeading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { ...typography.pageTitle },
  body: { fontSize: 16, lineHeight: 27, color: colors.ink },
  subtitle: { fontSize: 16, lineHeight: 26, fontWeight: '500', flex: 1 },
  note: { fontSize: 14, lineHeight: 24, color: colors.muted },
  footer: { width: "100%", maxWidth: 640, alignSelf: "center", padding: 24, paddingBottom: 16, gap: 10, backgroundColor: colors.surface },
  error: { color: colors.danger },
  primary: { minHeight: 52, justifyContent: "center", backgroundColor: colors.action, borderRadius: 12, padding: 14, alignItems: 'center' },
  primaryText: { color: colors.surface, fontSize: 16 },
  secondary: { minHeight: 52, justifyContent: "center", borderWidth: 1, borderColor: colors.outline, borderRadius: 12, padding: 14, alignItems: 'center' },
  disabled: { opacity: 0.5 },
  link: { alignItems: 'center', padding: 8 },
  linkText: { color: colors.muted },
});
