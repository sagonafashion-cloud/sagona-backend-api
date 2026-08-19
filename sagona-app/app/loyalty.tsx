import React from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import api from '../src/lib/api';
import { colors, fonts, spacing, radius, typography } from '../src/lib/theme';
import ScreenHeader from '../src/components/ui/ScreenHeader';
import ErrorState from '../src/components/ui/ErrorState';
import { useAuthStore } from '../src/stores/authStore';
import { User } from '../src/types';

// Phase 6. Real balance comes from the same field Account already displays
// (User.loyaltyPoints), fetched fresh via GET /auth/me so a points update
// from an order placed since last login shows immediately rather than
// relying on the possibly-stale cached auth-store user.
//
// Earn rate below (1 point per Rs.100 spent) is read directly from the real
// backend logic in orderController.js (Math.floor(billing.grandTotal / 100),
// $inc'd at order creation) — NOT from the website's account.html copy,
// which currently claims "1 point per Rs.10" and "100 points = Rs.10 off".
// Both of those website claims were verified against the backend and don't
// match any real code path; using them here would just re-copy the wrong
// number into a second place. There is no backend config endpoint for this
// rate, so it's a literal reflection of current code — if that logic ever
// changes, this text needs a manual update too.
//
// No redemption logic exists anywhere in the backend (checkout.js only ever
// displays the balance, never applies it as a discount), so this screen does
// not present redemption as a working feature.
export default function LoyaltyScreen() {
  const storeUser = useAuthStore((s) => s.user);

  const { data: user, isLoading, isError, refetch } = useQuery<User>({
    queryKey: ['loyaltyMe'],
    queryFn: async () => {
      const { data } = await api.get('/auth/me');
      return data.user ?? data;
    },
    enabled: !!storeUser,
    initialData: storeUser ?? undefined,
  });

  const points = user?.loyaltyPoints ?? storeUser?.loyaltyPoints ?? 0;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title="Loyalty Points" />

      <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: spacing.xl }}>
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>YOUR BALANCE</Text>
          {isLoading && !user ? (
            <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.xs }} />
          ) : (
            <Text style={styles.balanceValue}>{points.toLocaleString('en-IN')} pts</Text>
          )}
        </View>

        {isError && <ErrorState title="Couldn't refresh your balance" subtitle="Showing your last known balance above." onRetry={refetch} />}

        <Text style={styles.sectionLabel}>WAYS TO EARN</Text>
        <View style={styles.row}>
          <Ionicons name="bag-outline" size={18} color={colors.gold} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Earn on every order</Text>
            <Text style={styles.rowSub}>1 point for every ₹100 spent, credited automatically when your order is placed.</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>REDEEM</Text>
        <View style={styles.row}>
          <Ionicons name="pricetag-outline" size={18} color={colors.lightGray} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Coming soon</Text>
            <Text style={styles.rowSub}>Redeeming points at checkout isn't available yet — your points are safe and building up in the meantime.</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.light },
  body: { flex: 1, padding: spacing.md },
  balanceCard: {
    backgroundColor: colors.black, borderRadius: radius.lg, padding: spacing.lg,
    alignItems: 'center', marginBottom: spacing.lg, minHeight: 84, justifyContent: 'center',
  },
  balanceLabel: { fontFamily: fonts.bodySemiBold, fontSize: 11, letterSpacing: 1, color: colors.gold, marginBottom: spacing.xs },
  balanceValue: { fontFamily: fonts.heading, fontSize: 32, color: colors.white },
  sectionLabel: { ...typography.label, color: colors.lightGray, marginTop: spacing.md, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md,
  },
  rowTitle: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.black, marginBottom: 2 },
  rowSub: { fontFamily: fonts.body, fontSize: 12, color: colors.lightGray, lineHeight: 17 },
});
