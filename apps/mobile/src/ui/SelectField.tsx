import { useState } from 'react';
import { Keyboard, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Pressable, Text } from './primitives';
import { colors } from './theme';

interface Props {
  label: string;
  placeholder: string;
  value: string | null;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function SelectField({ label, placeholder, value, options, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const selected = options.find(option => option.value === value);
  return <View style={styles.group}>
    <Text style={styles.label}>{label}</Text>
    <Pressable accessibilityRole="combobox" accessibilityLabel={label}
      accessibilityState={{ expanded: open && !disabled, disabled }} disabled={disabled}
      onPress={() => { Keyboard.dismiss(); setOpen(!open); }}
      style={[styles.trigger, open && !disabled && styles.active]}>
      <Text style={[styles.value, !selected && styles.placeholder]}>{selected?.label ?? placeholder}</Text>
      <Svg width={20} height={20} viewBox="0 0 24 24" accessibilityElementsHidden>
        <Path d={open && !disabled ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} stroke={colors.action} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </Pressable>
    {open && !disabled && <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={styles.options}>
      {options.map(option => <Pressable key={option.value} accessibilityRole="radio"
        accessibilityState={{ checked: option.value === value }}
        style={[styles.option, option.value === value && styles.selected]}
        onPress={() => { onChange(option.value); setOpen(false); }}>
        <Text style={option.value === value && styles.selectedText}>{option.label}</Text>
      </Pressable>)}
    </ScrollView>}
  </View>;
}

const styles = StyleSheet.create({
  group: { gap: 8 },
  label: { fontSize: 14, fontWeight: '500', color: colors.ink },
  trigger: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1, borderColor: colors.outline, borderRadius: 12, backgroundColor: colors.surface },
  active: { borderColor: colors.action },
  value: { flex: 1 },
  placeholder: { color: colors.muted },
  options: { maxHeight: 260, borderWidth: 1, borderColor: colors.border, borderRadius: 12, backgroundColor: colors.surface },
  option: { minHeight: 52, padding: 12, justifyContent: 'center' },
  selected: { backgroundColor: colors.selected },
  selectedText: { color: colors.identity, fontWeight: '500' },
});
