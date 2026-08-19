import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing } from '../../lib/theme';
import Button from './Button';

interface Props {
  title?: string;
  subtitle?: string;
  onRetry?: () => void;
}

// Shared "something went wrong" layout — the error-state counterpart to
// EmptyState. Used by any screen driving a useQuery/network fetch so a
// failed request shows a message + retry action instead of a stuck
// "Loading..." label or a blank screen. Final-pass addition (Phase 5 polish).
export default function ErrorState({
  title = 'Something went wrong',
  subtitle = "We couldn't load this. Check your connection and try again.",
  onRetry,
}: Props) {
  return (
    <View style={styles.wrap}>
      <Ionicons name="cloud-offline-outline" size={56} color={colors.border} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
      {onRetry ? (
        <Button label="Try Again" onPress={onRetry} variant="outline" style={{ marginTop: spacing.lg, width: 160 }} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.xs },
  title: { fontFamily: fonts.heading, fontSize: 18, color: colors.black, marginTop: spacing.sm, textAlign: 'center' },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.gray, textAlign: 'center', lineHeight: 19, marginTop: spacing.xs },
});
