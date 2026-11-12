import Svg, { Path } from 'react-native-svg';
import { colors } from './theme';

const paths = {
  shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6',
  scan: 'M8 3H4v4m12-4h4v4M4 17v4h4m12-4v4h-4M9 9v2m6-2v2m-6 4c2 2 4 2 6 0',
  camera: 'M3 7h4l2-3h6l2 3h4v14H3V7Zm13 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  image: 'M3 3h18v18H3V3Zm0 14 6-6 5 5 3-3 4 4M16 7h.01',

  calendar: 'M8 3v4m8-4v4M4 10h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Zm3 9h3m2 0h3m-8 3h3',
  book: 'M12 5C9 3 5 3 3 4v15c3-1 6-1 9 1m0-15c3-2 7-2 9-1v15c-3-1-6-1-9 1V5Z',
  chart: 'M4 4v16h16M8 16v-4m5 4V8m5 8v-6',
  chevron: 'm9 5 7 7-7 7',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 21v-2a8 8 0 0 1 16 0v2',
  card: 'M3 5h18v14H3V5Zm4 5h3m-3 4h3m5-5h3m-3 4h3',
  school: 'm2 9 10-6 10 6-10 6L2 9Zm4 3v6l6 3 6-3v-6m4-3v8',
  check: 'm5 12 4 4L19 6',
  logout: 'M9 4H4v16h5m5-13 5 5-5 5m-6-5h11',
  send: 'm4 4 17 8-17 8 3-8-3-8Zm3 8h14',
  search: 'M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Zm-2 5 6 6',
} as const;

export type AppIconName = keyof typeof paths;

export function AppIcon({ name, size = 22, color = colors.action }: { name: AppIconName; size?: number; color?: string }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Path d={paths[name]} /></Svg>;
}
