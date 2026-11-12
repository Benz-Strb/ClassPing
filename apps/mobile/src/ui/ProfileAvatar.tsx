import { useState } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle, type TextStyle } from 'react-native';
import { Text } from './primitives';
import type { Me } from '../lib/types';

export function ProfileAvatar({ user, style, textStyle }: { user: Me; style: StyleProp<ViewStyle>; textStyle: StyleProp<TextStyle> }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return <View style={style} accessible={false}>
    {user.avatarUrl && failedUrl !== user.avatarUrl
      ? <Image source={{ uri: user.avatarUrl }} onError={() => setFailedUrl(user.avatarUrl!)} style={[StyleSheet.absoluteFill, { borderRadius: 999 }]} resizeMode="cover" />
      : <Text allowFontScaling={false} style={textStyle}>{(user.fullName ?? user.email).trim().slice(0, 1).toUpperCase()}</Text>}
  </View>;
}
