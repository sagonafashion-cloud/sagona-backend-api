import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, radius, typography } from '../src/lib/theme';
import ScreenHeader from '../src/components/ui/ScreenHeader';

// Phase 2 shell only. Closes the P2 gap from the Aug 2026 UX report — no
// product reviews/ratings UI exists anywhere in the app today (backend has
// no reviews model/endpoint either, so this is layout-only pending a Phase 3
// backend decision). Static placeholder values only. Not linked from the PDP
// yet (product/[id].tsx is marked "working" in Phase 1).
export default function ReviewsScreen() {
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title="Reviews & Ratings" />

      <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: spacing.xl }}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryScore}>—</Text>
          <View style={styles.starsRow}>
            {[0, 1, 2, 3, 4].map((i) => (
              <Ionicons key={i} name="star-outline" size={18} color={colors.gold} />
            ))}
          </View>
          <Text style={styles.summaryCount}>No reviews yet</Text>
        </View>

        <Text style={styles.sectionLabel}>WHAT CUSTOMERS SAY</Text>
        <View style={styles.placeholderRow}>
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.lightGray} />
          <Text style={styles.placeholderText}>Customer reviews — coming soon</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.light },
  body: { flex: 1, padding: spacing.md },
  summaryCard: {
    backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    padding: spacing.lg, alignItems: 'center', marginBottom: spacing.lg,
  },
  summaryScore: { fontFamily: fonts.heading, fontSize: 32, color: colors.black },
  starsRow: { flexDirection: 'row', gap: 4, marginTop: spacing.xs, marginBottom: spacing.xs },
  summaryCount: { ...typography.caption, marginTop: spacing.xs },
  sectionLabel: { ...typography.label, color: colors.lightGray, marginBottom: spacing.sm },
  placeholderRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    borderStyle: 'dashed', padding: spacing.md,
  },
  placeholderText: { fontFamily: fonts.body, fontSize: 13, color: colors.lightGray },
});
