import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { apiFetch } from '../lib/api';
import type { Me } from '../lib/types';

// ใบหน้าเป็นข้อมูลอ่อนไหวตาม PDPA ต้องขอแยกต่างหากและบอกให้ครบก่อนเปิดกล้อง
const PARAGRAPHS = [
  'ClassPing จะเก็บรูปหน้าของคุณ และข้อมูลที่คำนวณจากรูป เพื่อใช้เช็คชื่อผ่านกล้องในห้องเรียนและห้องสอบ และแสดงชื่อคุณบนภาพกล้องให้อาจารย์ดู เฉพาะวิชาที่คุณลงทะเบียนเรียน',
  'ก่อนลงทะเบียนใบหน้า คุณต้องส่งภาพหน้าจอบัตรนักศึกษาออนไลน์ เพื่อยืนยันว่าเป็นเจ้าของบัญชี ระบบอ่านรหัสและเทียบหน้าในบัตรแล้วลบภาพบัตรทันที ไม่เก็บไว้',
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
  onSignOut: () => void;
}

export function ConsentScreen({ onAccepted, onSignOut }: Props) {
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
      <View style={styles.center}>
        <Text style={styles.body}>
          กล้องจะยังเช็คชื่อให้คุณไม่ได้ ถ้าเปลี่ยนใจ กลับมากดยินยอมได้ทุกเมื่อ
        </Text>
        <Pressable style={styles.secondary} onPress={() => setDeclined(false)}>
          <Text>กลับไปอ่านอีกครั้ง</Text>
        </Pressable>
        <Pressable style={styles.link} onPress={onSignOut}>
          <Text style={styles.linkText}>ออกจากระบบ</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>ยินยอมให้ใช้ข้อมูลใบหน้า</Text>
        {PARAGRAPHS.map((text) => (
          <Text key={text} style={styles.body}>
            {text}
          </Text>
        ))}
        <Text style={styles.subtitle}>กล้องในห้องเรียนและห้องสอบ</Text>
        {CCTV_PARAGRAPHS.map((text) => (
          <Text key={text} style={styles.note}>
            {text}
          </Text>
        ))}
      </ScrollView>
      <View style={styles.footer}>
        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable
          style={[styles.primary, saving && styles.disabled]}
          onPress={accept}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
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
  root: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 24, paddingTop: 64, gap: 16 },
  center: { flex: 1, justifyContent: 'center', padding: 24, gap: 12, backgroundColor: '#fff' },
  title: { fontSize: 22, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 24, color: '#374151' },
  subtitle: { fontSize: 16, fontWeight: '600', marginTop: 8 },
  note: { fontSize: 13, lineHeight: 21, color: '#6b7280' },
  footer: { padding: 24, paddingBottom: 40, gap: 10, borderTopWidth: 1, borderColor: '#e5e7eb' },
  error: { color: '#dc2626' },
  primary: { backgroundColor: '#2563eb', borderRadius: 8, padding: 14, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 16 },
  secondary: { borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, padding: 14, alignItems: 'center' },
  disabled: { opacity: 0.5 },
  link: { alignItems: 'center', padding: 8 },
  linkText: { color: '#6b7280' },
});
