import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../src/lib/api';
import { useAuthStore } from '../../src/stores/authStore';
import Button from '../../src/components/ui/Button';
import { colors, fonts, spacing, radius } from '../../src/lib/theme';
import { Order } from '../../src/types';

const STATUS_COLORS: Record<string, string> = {
  Processing: '#e67e22',
  Confirmed: '#2980b9',
  Shipped: '#8e44ad',
  Delivered: '#27ae60',
  Cancelled: '#c0392b',
};

export default function AccountScreen() {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const { data: orders, isLoading } = useQuery<Order[]>({
    queryKey: ['myOrders'],
    queryFn: async () => {
      const { data } = await api.get('/orders/my');
      return data.data ?? data;
    },
    enabled: !!user,
  });

  const handleLogout = () => {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: logout },
    ]);
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.guestWrap}>
          <Ionicons name="person-circle-outline" size={80} color={colors.border} />
          <Text style={styles.guestTitle}>You're not signed in</Text>
          <Button label="Sign In" onPress={() => router.push('/auth/login' as any)} style={{ width: 200, marginTop: spacing.md }} />
          <TouchableOpacity onPress={() => router.push('/auth/register' as any)} style={{ marginTop: spacing.md }}>
            <Text style={styles.link}>Create account</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <FlatList
        data={orders ?? []}
        keyExtractor={(o) => o._id}
        ListHeaderComponent={
          <>
            {/* Profile header */}
            <View style={styles.profileCard}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{user.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{user.name}</Text>
                <Text style={styles.profileEmail}>{user.email}</Text>
              </View>
            </View>

            {/* Loyalty points */}
            <View style={styles.loyaltyCard}>
              <Ionicons name="star" size={22} color={colors.gold} />
              <Text style={styles.loyaltyPoints}>{user.loyaltyPoints ?? 0}</Text>
              <Text style={styles.loyaltyLabel}>loyalty points</Text>
            </View>

            <Text style={styles.sectionTitle}>My Orders</Text>
            {isLoading && <Text style={styles.loading}>Loading orders...</Text>}
            {!isLoading && (!orders || orders.length === 0) && (
              <Text style={styles.emptyText}>No orders yet</Text>
            )}
          </>
        }
        renderItem={({ item: order }) => {
          const statusColor = STATUS_COLORS[order.status] ?? colors.gray;
          return (
            <TouchableOpacity style={styles.orderCard} onPress={() => router.push(`/orders/${order._id}` as any)}>
              <View style={styles.orderHeader}>
                <Text style={styles.orderNumber}>#{order.orderNumber}</Text>
                <View style={[styles.statusBadge, { backgroundColor: statusColor + '22' }]}>
                  <Text style={[styles.statusText, { color: statusColor }]}>{order.status}</Text>
                </View>
              </View>
              <Text style={styles.orderDate}>{new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
              <Text style={styles.orderTotal}>₹{order.total?.toLocaleString('en-IN')} · {order.items.length} item{order.items.length > 1 ? 's' : ''}</Text>
            </TouchableOpacity>
          );
        }}
        ListFooterComponent={
          <View style={styles.footer}>
            <Button label="Sign Out" onPress={handleLogout} variant="outline" style={{ marginTop: spacing.lg }} />
          </View>
        }
        contentContainerStyle={styles.list}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.light },
  guestWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, padding: spacing.lg },
  guestTitle: { fontFamily: fonts.heading, fontSize: 22, color: colors.black },
  link: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.gold },
  list: { padding: spacing.md, paddingBottom: 80 },
  profileCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, gap: spacing.md, marginBottom: spacing.md },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.heading, fontSize: 22, color: colors.black },
  profileInfo: { flex: 1 },
  profileName: { fontFamily: fonts.heading, fontSize: 18, color: colors.black },
  profileEmail: { fontFamily: fonts.body, fontSize: 13, color: colors.lightGray },
  loyaltyCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.black, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.lg },
  loyaltyPoints: { fontFamily: fonts.heading, fontSize: 24, color: colors.gold },
  loyaltyLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.lightGray },
  sectionTitle: { fontFamily: fonts.heading, fontSize: 20, color: colors.black, marginBottom: spacing.md },
  loading: { fontFamily: fonts.body, color: colors.lightGray, textAlign: 'center' },
  emptyText: { fontFamily: fonts.body, color: colors.lightGray, textAlign: 'center', marginVertical: spacing.lg },
  orderCard: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderNumber: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.black },
  statusBadge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full },
  statusText: { fontFamily: fonts.bodySemiBold, fontSize: 12 },
  orderDate: { fontFamily: fonts.body, fontSize: 12, color: colors.lightGray, marginTop: 4 },
  orderTotal: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.black, marginTop: 4 },
  footer: { paddingBottom: spacing.xl },
});
