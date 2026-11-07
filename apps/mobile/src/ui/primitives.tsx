import { Children, cloneElement, isValidElement, forwardRef, createContext, useContext, type ComponentRef } from 'react';
import {
  Text as NativeText, TextInput as NativeTextInput, ScrollView as NativeScrollView, Pressable as NativePressable,
  ActivityIndicator, StyleSheet, useWindowDimensions, type ActivityIndicatorProps, type TextProps, type TextInputProps, type ScrollViewProps, type PressableProps,
} from 'react-native';
import { isLoaded } from 'expo-font';
import { colors, layout } from './theme';

const InactiveControl = createContext(false);

function fontStyle(style: TextProps['style'], latin = false) {
  const flat = StyleSheet.flatten(style);
  const weight = flat?.fontWeight;
  const face = weight === 'bold' || Number(weight) >= 700 ? 'Bold' : Number(weight) >= 600 ? 'SemiBold' : Number(weight) >= 500 ? 'Medium' : 'Regular';
  const family = `${latin ? 'Geist' : 'Kanit'}-${face}`;
  return isLoaded(family) ? { fontFamily: family, fontWeight: 'normal' as const } : {};
}

export function Text({ style, children, ...props }: TextProps) {
  const inactive = useContext(InactiveControl);
  const latin = (typeof children === 'string' || typeof children === 'number') && !/[\u0E00-\u0E7F]/.test(String(children));
  const flat = StyleSheet.flatten(style);
  const lineHeight = flat?.lineHeight ?? Math.ceil((flat?.fontSize ?? 16) * 1.5);
  return <NativeText {...props} style={[styles.text, { lineHeight }, style, inactive && {color: colors.muted}, fontStyle(style, latin)]}>{children}</NativeText>;
}

export const Pressable = forwardRef<ComponentRef<typeof NativePressable>, PressableProps>(function Pressable({ style, children, disabled, accessibilityState, ...props }, ref) {
  const inactive = disabled || accessibilityState?.disabled;
  return <NativePressable ref={ref} accessibilityRole="button" {...props} disabled={inactive} accessibilityState={accessibilityState} style={state => [styles.target, typeof style === 'function' ? style(state) : style, state.pressed && !inactive && styles.pressed, inactive && styles.disabled]}>
    {state => <InactiveControl.Provider value={!!inactive}>{Children.map(typeof children === 'function' ? children(state) : children, child => {
      if (!inactive) return child;
      if (isValidElement<ActivityIndicatorProps>(child) && child.type === ActivityIndicator) return cloneElement(child, { color: colors.muted });
      return child;
    })}</InactiveControl.Provider>}
  </NativePressable>;
});

export const TextInput = forwardRef<ComponentRef<typeof NativeTextInput>, TextInputProps>(function TextInput({ style, placeholderTextColor = colors.muted, ...props }, ref) {
  return <NativeTextInput ref={ref} {...props} placeholderTextColor={placeholderTextColor} selectionColor={colors.action} style={[styles.input, style, fontStyle(style)]} />;
});

export const ScrollView = forwardRef<ComponentRef<typeof NativeScrollView>, ScrollViewProps>(function ScrollView({ contentContainerStyle, style, horizontal, ...props }, ref) {
  const { width } = useWindowDimensions();
  const gutter = width < layout.compact ? 16 : width < layout.tablet ? 24 : 32;
  return <NativeScrollView ref={ref} keyboardShouldPersistTaps="handled" {...props} horizontal={horizontal} style={[styles.scroll, style]} contentContainerStyle={horizontal ? contentContainerStyle : [styles.content, contentContainerStyle, { paddingHorizontal: gutter }]} />;
});

const styles = StyleSheet.create({
  pressed: { opacity: 0.72 },
  target: { minHeight: layout.target, minWidth: 0 },
  disabled: { opacity: 1, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.outline },
  text: { color: colors.ink, fontSize: 16, lineHeight: 25, flexShrink: 1 },
  input: { minHeight: layout.target, color: colors.ink, backgroundColor: colors.surface, borderRadius: 12, fontSize: 16, lineHeight: 24, paddingHorizontal: 12 },
  scroll: { minWidth: 0 },
  content: { flexGrow: 1, width: '100%', maxWidth: layout.content, alignSelf: 'center' },
});
