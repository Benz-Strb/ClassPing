import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { ROLE_LABEL, webOnlyMessage } from '../lib/access';
import type { FaceStatus, Me } from '../lib/types';

interface Props {
  me: Me;
  face: FaceStatus | null;
  // แอดมินที่มีรหัสนักศึกษายังลงทะเบียนใบหน้าได้
  onEnroll?: () => void;
  onSignOut: () => void;
}

export function WebOnlyScreen({ me, face, onEnroll, onSignOut }: Props) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{me.fullName ?? me.email}</Text>
      <Text>{me.email}</Text>
      <Text>บทบาท: {ROLE_LABEL[me.role]}</Text>
      {me.studentId && <Text>รหัสนักศึกษา: {me.studentId}</Text>}
      <Text style={styles.pending}>{webOnlyMessage(me)}</Text>
      {onEnroll && face && !face.complete && (
        <Pressable accessibilityRole="button" style={styles.button} onPress={onEnroll}>
          <Text>ลงทะเบียนใบหน้า</Text>
        </Pressable>
      )}
      {face?.complete && <Text style={styles.ok}>ลงทะเบียนใบหน้าแล้ว</Text>}
      <Pressable accessibilityRole="button" style={styles.button} onPress={onSignOut}>
        <Text>ออกจากระบบ</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  content: { flexGrow: 1, padding: 24, gap: 10 },
  title: { fontSize: 20, fontWeight: '600' },
  ok: { color: '#15803d', marginTop: 8 },
  pending: { color: '#6b7280', marginTop: 8 },
  button: { borderWidth: 1, borderRadius: 8, padding: 12, alignItems: 'center', marginTop: 8 },
});
