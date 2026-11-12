export const colors = {
  background: '#FAF8F4', surface: '#FFFFFF', ink: '#282330', muted: '#6D6477',
  border: '#E6DFEB', outline: '#6D6477', action: '#7652C5', actionHover: '#5D3C9E',
  selected: '#EEE8F7', onAction: '#FFFFFF', danger: '#AE2929', dangerBg: '#FFF0EE',
  warning: '#765000', warningBg: '#FFF3D5', info: '#5B21B6', infoBg: '#F1ECF8',
  identity: '#4D3282', subtle: '#F3EFF8', onSelected: '#5D3C9E',
} as const;

export const layout = { compact: 360, tablet: 768, desktop: 1024, content: 1040, form: 560, target: 48 } as const;

export const fontAssets = {
  'Kanit-Regular': require('../../assets/fonts/Kanit-400.ttf'),
  'Kanit-Medium': require('../../assets/fonts/Kanit-500.ttf'),
  'Kanit-SemiBold': require('../../assets/fonts/Kanit-600.ttf'),
  'Kanit-Bold': require('../../assets/fonts/Kanit-700.ttf'),
  'Geist-Regular': require('../../assets/fonts/Geist-400.ttf'),
  'Geist-Medium': require('../../assets/fonts/Geist-500.ttf'),
  'Geist-SemiBold': require('../../assets/fonts/Geist-600.ttf'),
  'Geist-Bold': require('../../assets/fonts/Geist-700.ttf'),
};

export const workspace = {
  background: '#F7F5FA',
  tint: '#F0EAF9',
  divider: '#EEEAF3',
  title: '#332B42',
  camera: '#181222',
  cameraActive: '#C4ADF4',
  cameraComplete: '#82D9BC',
  cameraScrim: 'rgba(24,18,34,0.82)',
} as const;

export const typography = {
  pageTitle: { fontSize: 24, lineHeight: 34, fontWeight: '600', color: workspace.title },
  sectionTitle: { fontSize: 18, lineHeight: 28, fontWeight: '500', color: workspace.title },
} as const;
