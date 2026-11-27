export const colors = {
  background: '#F6FAFD', surface: '#FFFFFF', ink: '#223A51', muted: '#4B6075',
  border: '#D5E2EE', outline: '#4B6075', action: '#365E83', actionHover: '#294E71',
  selected: '#E6F0FA', onAction: '#FFFFFF', danger: '#AE2929', dangerBg: '#FFF0EE',
  warning: '#765000', warningBg: '#FFF3D5', info: '#294E71', infoBg: '#EAF3FB',
  actionFill: '#AACCEB', actionFillPressed: '#99BFE3',
  identity: '#223A51', subtle: '#EDF5FC', onSelected: '#294E71',
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
  background: '#F6FAFD',
  tint: '#D6E7F7',
  divider: '#E2ECF5',
  title: '#223A51',
  camera: '#142638',
  cameraActive: '#AACCEB',
  cameraComplete: '#82D9BC',
  cameraScrim: 'rgba(20,38,56,0.82)',
} as const;

export const typography = {
  pageTitle: { fontSize: 24, lineHeight: 34, fontWeight: '600', color: workspace.title },
  sectionTitle: { fontSize: 18, lineHeight: 28, fontWeight: '500', color: workspace.title },
} as const;
