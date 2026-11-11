import type {ReactNode} from 'react';
import {StyleSheet, View} from 'react-native';
import {Pressable, ScrollView, Text} from '../ui/primitives';
import {colors} from '../ui/theme';
import type {FaceStatus, Me} from '../lib/types';

const ROLE = {student: 'นักศึกษา', teacher: 'อาจารย์', admin: 'ผู้ดูแลระบบ'};

export function AccountScreen({me, face, banner, onSignOut}: {me: Me; face: FaceStatus | null; banner?: ReactNode; onSignOut: () => void}) {
  return <ScrollView contentContainerStyle={styles.content}>
    <Text accessibilityRole="header" style={styles.title}>บัญชีของฉัน</Text>
    <View style={styles.profile}>
      <View style={styles.avatar}><Text style={styles.initial}>{(me.fullName ?? me.email).trim().slice(0, 1).toUpperCase()}</Text></View>
      <View style={styles.identity}><Text style={styles.name}>{me.fullName ?? me.email}</Text><Text selectable style={styles.muted}>{me.email}</Text></View>
    </View>
    <View style={styles.details}>
      {[
        ["บทบาท", ROLE[me.role]],
        ...(me.studentId ? [["รหัสนักศึกษา", me.studentId]] : []),
        ...(me.faculty ? [["คณะ", me.faculty]] : []),
        ...(me.major ? [["สาขา", me.major]] : []),
        ...(me.studentId ? [["ลงทะเบียนใบหน้า", face?.complete ? 'เรียบร้อยแล้ว' : 'ยังไม่ครบ']] : []),
      ].map(([label, value]) => <View key={label} style={styles.row}><Text style={styles.muted}>{label}</Text><Text selectable style={styles.value}>{value}</Text></View>)}
    </View>
    {banner}
    {me.role !== 'student' && <Text style={styles.muted}>จัดการรายวิชาและข้อมูลระบบผ่านเว็บไซต์ ClassPing</Text>}
    <Pressable style={styles.signOut} onPress={onSignOut}><Text style={styles.signOutText}>ออกจากระบบ</Text></Pressable>
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: {padding: 24, gap: 24, maxWidth: 800, width: '100%', alignSelf: 'center'},
  title: {fontSize: 27, lineHeight: 38, fontWeight: '500', color: colors.identity},
  profile: {flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 12},
  avatar: {width: 56, height: 56, borderRadius: 28, backgroundColor: colors.selected, alignItems: 'center', justifyContent: 'center'},
  initial: {fontSize: 24, fontWeight: '500', color: colors.identity},
  identity: {flex: 1, minWidth: 0, gap: 4},
  name: {fontSize: 20, lineHeight: 30, fontWeight: '500'},
  muted: {fontSize: 14, lineHeight: 23, color: colors.muted},
  details: {borderTopWidth: 1, borderColor: colors.border},
  row: {flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, paddingVertical: 18, borderBottomWidth: 1, borderColor: colors.border},
  value: {fontSize: 15, fontWeight: '500'},
  signOut: {alignItems: 'center', justifyContent: 'center', minHeight: 48, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 12, padding: 12},
  signOutText: {color: colors.danger, fontWeight: '500'},
});
