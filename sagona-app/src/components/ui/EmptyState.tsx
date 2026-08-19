import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing } from '../../lib/theme';

interface Props {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  children?: React.ReactNode; // e.g. a <Button /> CTA
}

// Shared "nothing here yet" layout — used by skeleton screens in Phase 2
// (Wishlist, Return Request, Size Guide, Loyalty, Reviews) so placeholder
// states look consistent instead of each screen inventing its own.
export default function EmptyState({ icon, title, subtitle, children }: Props) {
  return (
    <View style={styles.wrap}>
      <Ionicons name={icon} size={64} color={colors.border} />
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {children ? <View style={styles.actions}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.xs },
  title: { fontFamily: fonts.heading, fontSize: 20, color: colors.black, marginTop: spacing.sm, textAlign: 'center' },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.gray, textAlign: 'center', lineHeight: 19, marginTop: spacing.xs },
  actions: { marginTop: spacing.lg, width: '100%', alignItems: 'center' },
});
