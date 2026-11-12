import { StyleSheet, View } from 'react-native';
import { Text } from './primitives';
import { AppIcon, type AppIconName } from './AppIcon';
import { colors } from './theme';

const steps: { label: string; icon: AppIconName }[] = [
  { label: 'ยินยอม', icon: 'shield' },
  { label: 'บัตรนักศึกษา', icon: 'card' },
  { label: 'สแกนหน้า', icon: 'scan' },
];

export function EnrollmentProgress({ current }: { current: 0 | 1 | 2 }) {
  return <View style={styles.row} accessible accessibilityLabel={`ขั้นตอนที่ ${current + 1} จาก 3: ${steps[current].label}`}>
    {steps.map((step, index) => <View key={step.label} style={styles.step}>
      <View style={[styles.track, index <= current && styles.activeTrack]} />
      <View style={styles.label}><AppIcon name={index < current ? 'check' : step.icon} size={16} color={index <= current ? colors.action : colors.muted} /><Text style={[styles.text, index === current && styles.activeText]}>{step.label}</Text></View>
    </View>)}
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  step: { flex: 1, minWidth: 0, gap: 10 },
  track: { height: 3, borderRadius: 2, backgroundColor: colors.border },
  activeTrack: { backgroundColor: colors.action },
  label: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  text: { fontSize: 12, lineHeight: 20, color: colors.muted },
  activeText: { color: colors.action, fontWeight: '500' },
});
