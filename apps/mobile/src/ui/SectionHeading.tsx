import { StyleSheet, View } from 'react-native';
import { Text } from './primitives';
import { AppIcon, type AppIconName } from './AppIcon';
import { colors, typography } from './theme';

export function SectionHeading({ icon, children }: { icon: AppIconName; children: string }) {
  return <View style={styles.row}>
    <View style={styles.icon}><AppIcon name={icon} size={20} /></View>
    <Text accessibilityRole="header" style={styles.title}>{children}</Text>
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.selected, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.sectionTitle, flex: 1 },
});
