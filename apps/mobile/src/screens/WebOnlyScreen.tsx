import { StyleSheet, View } from 'react-native';
import { webOnlyMessage } from '../lib/access';
import type { FaceStatus, Me } from '../lib/types';
import { Pressable, Text } from '../ui/primitives';
import { colors } from '../ui/theme';
import { AccountScreen } from './AccountScreen';

interface Props {
  me: Me;
  face: FaceStatus | null;
  // แอดมินที่มีรหัสนักศึกษายังลงทะเบียนใบหน้าได้
  onEnroll?: () => void;
  onSignOut: () => void;
}

// หน้าบัญชีแบบเดียวกับนักศึกษา แต่บอกให้ใช้เว็บ
export function WebOnlyScreen({ me, face, onEnroll, onSignOut }: Props) {
  const canEnroll = !!onEnroll && !!face && !face.complete;
  const banner = (me.role === 'student' || canEnroll) && <View style={styles.banner}>
    {me.role === 'student' && <Text style={styles.muted}>{webOnlyMessage(me)}</Text>}
    {canEnroll && <Pressable accessibilityRole="button" style={styles.action} onPress={onEnroll}>
      <Text style={styles.actionText}>ลงทะเบียนใบหน้า</Text>
    </Pressable>}
  </View>;
  return <AccountScreen me={me} face={face} banner={banner} onSignOut={onSignOut} />;
}

const styles = StyleSheet.create({
  banner: { gap: 8 },
  muted: { fontSize: 14, lineHeight: 23, color: colors.muted },
  action: { minHeight: 48, padding: 12, borderRadius: 12, backgroundColor: colors.action, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 16, color: colors.onAction, fontWeight: '500' },
});
