export const colors = {
  gold:       '#C9A84C',
  goldDark:   '#b8943e',
  black:      '#0A0A0A',
  gray:       '#555550',
  lightGray:  '#999990',
  light:      '#F8F6F3',   // brand "cream" — matches --cream on sagona.in
  border:     '#E8E5E0',
  white:      '#ffffff',
  error:      '#c0392b',
  success:    '#27ae60',
} as const;

// Only these weights are registered via useFonts() in app/_layout.tsx.
// Referencing any other Playfair/Inter weight string (e.g. "..._600SemiBold"
// for Playfair, which isn't loaded) silently falls back to the system font —
// stick to the keys below.
export const fonts = {
  heading: 'PlayfairDisplay_700Bold',
  headingRegular: 'PlayfairDisplay_400Regular',
  headingItalic: 'PlayfairDisplay_400Regular_Italic',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 4,
  md: 8,
  lg: 16,
  full: 999,
} as const;

// Shared text presets so new screens don't each reinvent heading/body sizes.
// Additive only — existing screens that hardcode their own styles are
// untouched and keep working exactly as before.
export const typography = {
  h1:        { fontFamily: fonts.heading, fontSize: 26, color: colors.black },
  h2:        { fontFamily: fonts.heading, fontSize: 20, color: colors.black },
  h3:        { fontFamily: fonts.heading, fontSize: 17, color: colors.black },
  body:      { fontFamily: fonts.body, fontSize: 14, color: colors.black },
  bodyMuted: { fontFamily: fonts.body, fontSize: 13, color: colors.gray },
  label:     { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.black },
  caption:   { fontFamily: fonts.body, fontSize: 11, color: colors.lightGray },
} as const;
