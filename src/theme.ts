// Daily Mattr design tokens — premium pass.
// Blue is scarce; gradients do the heavy lifting; borders barely exist.

export type Palette = {
  brand: string;
  brandDark: string;
  brandLight: string;
  brandSubtle: string;
  bg: string;
  canvas: [string, string]; // full-screen background gradient
  bgSoft: string;
  card: string;
  glass: string; // translucent glass surface
  glassBorder: string;
  ink: string;
  inkSoft: string;
  inkFaint: string;
  border: string;
  divider: string;
  dark: string;
  success: string;
  warning: string;
  danger: string;
  breaking: string;
  white: string;
};

export const light: Palette = {
  brand: '#3979FF',
  brandDark: '#2E61CC',
  brandLight: '#6694FF',
  brandSubtle: '#EAF1FF',
  bg: '#F7F8FA',
  canvas: ['#F8F9FB', '#F3F5F9'],
  bgSoft: '#EEF1F6',
  card: '#FFFFFF',
  glass: '#FFFFFF',
  glassBorder: 'rgba(255,255,255,0)',
  ink: '#0B0D12',
  inkSoft: '#5F6774',
  inkFaint: '#9AA1AE',
  border: '#EEF2F6',
  divider: 'rgba(17,17,17,0.06)',
  dark: '#0E1524',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  breaking: '#FF3B30',
  white: '#FFFFFF',
};

export const darkPalette: Palette = {
  brand: '#3979FF',
  brandDark: '#2E61CC',
  brandLight: '#7AA5FF',
  brandSubtle: 'rgba(77,136,255,0.16)',
  bg: '#0A0E17',
  canvas: ['#0D1424', '#080B12'],
  bgSoft: 'rgba(255,255,255,0.07)',
  card: 'rgba(255,255,255,0.055)',
  glass: 'rgba(255,255,255,0.07)',
  glassBorder: 'rgba(255,255,255,0.09)',
  ink: '#F2F5FA',
  inkSoft: '#9BA6B8',
  inkFaint: '#5F6A7E',
  border: 'rgba(255,255,255,0.08)',
  divider: 'rgba(255,255,255,0.06)',
  dark: '#0E1524',
  success: '#34D399',
  warning: '#FBBF24',
  danger: '#F87171',
  breaking: '#FF4D42',
  white: '#FFFFFF',
};

// Backward-compat static palette (light). Screens should prefer useTheme().
export const colors = light;

export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
} as const;

// Display voice — a normal sans, just a better-drawn one than the UI face.
// Plus Jakarta Sans has tighter apertures and more character at large sizes,
// so headlines read as set rather than defaulted; Inter carries everything else.
export const display = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
} as const;

// Extreme hierarchy — type dominates the interface.
export const type = {
  hero: { size: 40, lh: 45, ls: -1.3, f: display.extrabold },
  storyTitle: { size: 32, lh: 37, ls: -1.0, f: display.extrabold },
  headline: { size: 28, lh: 34, ls: -0.8, f: display.bold },
  section: { size: 23, lh: 28, ls: -0.6, f: font.bold },
  cardTitle: { size: 17.5, lh: 23, ls: -0.4, f: font.bold },
  subtitle: { size: 16, lh: 22, ls: -0.2, f: font.medium },
  body: { size: 17, lh: 29, ls: 0, f: font.regular },
  caption: { size: 13, lh: 18, ls: 0, f: font.medium },
  meta: { size: 12, lh: 16, ls: 0.1, f: font.medium },
  overline: { size: 11, lh: 15, ls: 1.4, f: font.semibold },
} as const;

export const gutter = 24;
export const sectionGap = 48;

export const radius = { sm: 12, md: 16, lg: 22, xl: 28, sheet: 32, pill: 999 } as const;

// Cross-platform shadows (render on web AND native, unlike shadow* props)
export const shadow = {
  soft: { boxShadow: '0 8px 30px rgba(10,20,40,0.07)' },
  lift: { boxShadow: '0 16px 44px rgba(10,20,40,0.12)' },
  hero: { boxShadow: '0 24px 60px rgba(10,20,40,0.18)' },
  nav: { boxShadow: '0 12px 36px rgba(10,27,61,0.16), 0 2px 8px rgba(10,27,61,0.08)' },
  glowBrand: { boxShadow: '0 10px 40px rgba(57,121,255,0.25)' },
} as const;

// Critically damped springs — fast settle, no visible oscillation.
// `playful` is reserved for rare celebratory moments (heart burst) only.
export const spring = {
  snappy: { damping: 30, stiffness: 280, mass: 0.8 },
  gentle: { damping: 26, stiffness: 170, mass: 0.9 },
  bouncy: { damping: 16, stiffness: 230, mass: 0.7 },
} as const;

/* Eased scrims — 6 stops approximating a cubic ease so photo overlays
   never band. Use with expo-linear-gradient. */
export const scrim = {
  bottom: {
    colors: [
      'rgba(8,11,20,0)',
      'rgba(8,11,20,0.04)',
      'rgba(8,11,20,0.14)',
      'rgba(8,11,20,0.38)',
      'rgba(8,11,20,0.68)',
      'rgba(8,11,20,0.88)',
    ] as [string, string, ...string[]],
    locations: [0, 0.35, 0.52, 0.68, 0.85, 1] as [number, number, ...number[]],
  },
  top: {
    colors: [
      'rgba(8,11,20,0.55)',
      'rgba(8,11,20,0.28)',
      'rgba(8,11,20,0.1)',
      'rgba(8,11,20,0)',
    ] as [string, string, ...string[]],
    locations: [0, 0.35, 0.65, 1] as [number, number, ...number[]],
  },
  toWhite: {
    colors: [
      'rgba(255,255,255,0)',
      'rgba(255,255,255,0.06)',
      'rgba(255,255,255,0.25)',
      'rgba(255,255,255,0.62)',
      'rgba(255,255,255,0.9)',
      'rgba(255,255,255,1)',
    ] as [string, string, ...string[]],
    locations: [0, 0.4, 0.58, 0.75, 0.9, 1] as [number, number, ...number[]],
  },
} as const;

// Per-topic identity. grad = rich duotone, wash = translucent color cast for photos.
export const topicMeta: Record<
  string,
  { icon: string; grad: [string, string]; wash: string; pastel: [string, string]; pastelInk: string }
> = {
  'Tech & AI': { icon: 'cpu', grad: ['#7C7AFF', '#2B2A86'], wash: 'rgba(99,102,241,0.18)', pastel: ['#EEEDFF', '#DCD9FF'], pastelInk: '#3B3670' },
  Business: { icon: 'briefcase-business', grad: ['#12C2B0', '#0B4E49'], wash: 'rgba(14,165,160,0.16)', pastel: ['#E2F7F0', '#CBEEDF'], pastelInk: '#0F5B45' },
  Politics: { icon: 'landmark', grad: ['#4D88FF', '#16295C'], wash: 'rgba(57,121,255,0.16)', pastel: ['#E9F0FF', '#D6E4FF'], pastelInk: '#24447F' },
  India: { icon: 'map-pin', grad: ['#FF9A4D', '#8A2E0E'], wash: 'rgba(249,115,22,0.16)', pastel: ['#FFEEDD', '#FFDFC2'], pastelInk: '#8A4318' },
  World: { icon: 'globe', grad: ['#9B6CFF', '#3A1B7E'], wash: 'rgba(139,92,246,0.16)', pastel: ['#F1E9FF', '#E3D6FF'], pastelInk: '#4A2E85' },
  Sports: { icon: 'trophy', grad: ['#2BD96A', '#0F4A28'], wash: 'rgba(34,197,94,0.16)', pastel: ['#E4F8EA', '#CFF0DA'], pastelInk: '#1B5E37' },
  Science: { icon: 'atom', grad: ['#22C8E6', '#0D3F52'], wash: 'rgba(6,182,212,0.16)', pastel: ['#E1F6FA', '#CBEDF5'], pastelInk: '#0E5468' },
  Automobile: { icon: 'car-front', grad: ['#FF5A5A', '#6E1414'], wash: 'rgba(239,68,68,0.15)', pastel: ['#FDE8E8', '#FBD5D5'], pastelInk: '#7A2222' },
  'Real Estate': { icon: 'building-2', grad: ['#FFB020', '#6E4004'], wash: 'rgba(245,158,11,0.16)', pastel: ['#FDF1D8', '#FAE5BC'], pastelInk: '#7A5410' },
  'Health & Wellness': { icon: 'heart-pulse', grad: ['#FF63A5', '#701540'], wash: 'rgba(236,72,153,0.15)', pastel: ['#FDE7F1', '#FBD3E5'], pastelInk: '#7A2450' },
  'Markets & Startups': { icon: 'trending-up', grad: ['#17CE8C', '#053D2E'], wash: 'rgba(16,185,129,0.16)', pastel: ['#E1F6EC', '#CDEFDE'], pastelInk: '#0D5C43' },
  Explained: { icon: 'lightbulb', grad: ['#7C8BA6', '#1B2432'], wash: 'rgba(100,116,139,0.15)', pastel: ['#EDF1F6', '#DEE5EE'], pastelInk: '#39445A' },
  'Corporate Case': { icon: 'scale', grad: ['#2FB6F5', '#083D5F'], wash: 'rgba(14,165,233,0.16)', pastel: ['#E1F2FC', '#CBE7F8'], pastelInk: '#0D4A6B' },
};

export const fallbackTopic = {
  icon: 'newspaper',
  grad: ['#4D88FF', '#16295C'] as [string, string],
  wash: 'rgba(57,121,255,0.16)',
  pastel: ['#E9F0FF', '#D6E4FF'] as [string, string],
  pastelInk: '#24447F',
};

export function topicOf(topic: string | null | undefined) {
  return (topic && topicMeta[topic]) || fallbackTopic;
}

export const personalityOf = (topic: string | null): string =>
  topic
    ? ({
        'Tech & AI': 'AI Enthusiast',
        Business: 'Investor',
        'Markets & Startups': 'Investor',
        Politics: 'Analyst',
        World: 'Explorer',
        India: 'Nation Watcher',
        Sports: 'Champion',
        Science: 'Curious Mind',
        'Health & Wellness': 'Wellness Seeker',
        Automobile: 'Gearhead',
        'Real Estate': 'City Builder',
      } as Record<string, string>)[topic] ?? 'Explorer'
    : 'Explorer';
