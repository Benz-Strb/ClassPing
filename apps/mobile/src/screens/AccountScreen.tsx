import {useWindowDimensions} from 'react-native';
import {AppIcon, type AppIconName} from '../ui/AppIcon';
import type {ReactNode} from 'react';
import {ProfileAvatar} from '../ui/ProfileAvatar';
import {StyleSheet, View} from 'react-native';
import {Pressable, ScrollView, Text} from '../ui/primitives';
import {colors, typography, workspace} from '../ui/theme';
import type {FaceStatus, Me} from '../lib/types';

const DETAIL_ICONS: Record<string, AppIconName> = { 'บทบาท': 'user', 'รหัสนักศึกษา': 'card', 'คณะ': 'school', 'สาขา': 'book', 'ลงทะเบียนใบหน้า': 'check' };

const ROLE = {student: 'นักศึกษา', teacher: 'อาจารย์', admin: 'ผู้ดูแลระบบ'};

export function AccountScreen({me, face, banner, onSignOut}: {me: Me; face: FaceStatus | null; banner?: ReactNode; onSignOut: () => void}) {
  const {width, fontScale} = useWindowDimensions();
  const compact = width < 360 || fontScale > 1.4;
  return <ScrollView contentContainerStyle={styles.content}>
    <Text accessibilityRole="header" style={styles.title}>บัญชีของฉัน</Text>
    <View style={[styles.profile, compact && styles.profileStacked]}>
      <ProfileAvatar user={me} style={styles.avatar} textStyle={styles.initial} />
      <View style={[styles.identity, compact && styles.identityStacked]}><Text style={styles.name}>{me.fullName ?? me.email}</Text><Text selectable style={styles.muted}>{me.email}</Text></View>
    </View>
    <View style={styles.details}>
      {[
        ["บทบาท", ROLE[me.role]],
        ...(me.studentId ? [["รหัสนักศึกษา", me.studentId]] : []),
        ...(me.faculty ? [["คณะ", me.faculty]] : []),
        ...(me.major ? [["สาขา", me.major]] : []),
        ...(me.studentId ? [["ลงทะเบียนใบหน้า", face?.complete ? 'เรียบร้อยแล้ว' : 'ยังไม่ครบ']] : []),
      ].map(([label, value]) => <View key={label} style={[styles.row, compact && styles.rowStacked]}><View style={styles.detailLabel}><AppIcon name={DETAIL_ICONS[label] ?? "card"} size={18} color={colors.muted} /><Text style={styles.muted}>{label}</Text></View><Text selectable style={styles.value}>{value}</Text></View>)}
    </View>
    {banner}
    {me.role !== 'student' && <Text style={styles.muted}>จัดการรายวิชาและข้อมูลระบบผ่านเว็บไซต์ ClassPing</Text>}
    <Pressable style={styles.signOut} onPress={onSignOut}><AppIcon name="logout" color={colors.danger} size={20} /><Text style={styles.signOutText}>ออกจากระบบ</Text></Pressable>
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: {padding: 24, gap: 24, maxWidth: 800, width: '100%', alignSelf: 'center'},
  title: {...typography.pageTitle},
  profile: {flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20, backgroundColor: workspace.tint, borderRadius: 16},
  avatar: {width: 64, height: 64, borderRadius: 24, backgroundColor: colors.selected, alignItems: 'center', justifyContent: 'center'},
  initial: {fontSize: 24, fontWeight: '500', color: colors.identity},
  profileStacked: {flexDirection: 'column', alignItems: 'flex-start'},
  identityStacked: {flex: 0, width: '100%'},
  rowStacked: {flexDirection: 'column', alignItems: 'flex-start'},
  detailLabel: {flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1},
  identity: {flex: 1, minWidth: 0, gap: 4},
  name: {fontSize: 20, lineHeight: 30, fontWeight: '500'},
  muted: {fontSize: 14, lineHeight: 23, color: colors.muted},
  details: {backgroundColor: colors.surface, borderRadius: 16, paddingHorizontal: 20, overflow: 'hidden'},
  row: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, paddingVertical: 16, borderBottomWidth: 1, borderColor: workspace.divider},
  value: {fontSize: 15, fontWeight: '500', flexShrink: 1},
  signOut: {flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', minHeight: 48, backgroundColor: colors.dangerBg, borderRadius: 12, padding: 12},
  signOutText: {color: colors.danger, fontWeight: '500'},
});
