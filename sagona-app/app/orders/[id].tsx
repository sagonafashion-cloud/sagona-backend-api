import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../src/lib/api';
import { colors, fonts, spacing, radius } from '../../src/lib/theme';
import { Order } from '../../src/types';

const STATUS_COLORS: Record<string, string> = {
  Processing: '#e67e22',
  Confirmed: '#2980b9',
  Shipped: '#8e44ad',
  Delivered: '#27ae60',
  Cancelled: '#c0392b',
};

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { data: order, isLoading } = useQuery<Order>({
    queryKey: ['order', id],
    queryFn: async () => {
      const { data } = await api.get(`/orders/${id}`);
      return data.data ?? data;
    },
    enabled: !!id,
  });

  if (isLoading || !order) {
    return <View style={styles.screen}><Text style={styles.loading}>Loading order...</Text></View>;
  }

  const statusColor = STATUS_COLORS[order.status] ?? colors.gray;

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.black} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Order #{order.orderNumber}</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Status */}
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '22', borderColor: statusColor }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>{order.status}</Text>
        </View>

        {/* Items */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Items</Text>
          {order.items.map((item, i) => (
            <View key={i} style={styles.itemRow}>
              <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
              <Text style={styles.itemMeta}>{item.size} · {item.colour} · ×{item.qty}</Text>
              <Text style={styles.itemPrice}>₹{(item.price * item.qty).toLocaleString('en-IN')}</Text>
            </View>
          ))}
        </View>

        {/* Address */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Delivery Address</Text>
          <Text style={styles.address}>{order.shippingAddress.name}</Text>
          <Text style={styles.address}>{order.shippingAddress.line1}{order.shippingAddress.line2 ? `, ${order.shippingAddress.line2}` : ''}</Text>
          <Text style={styles.address}>{order.shippingAddress.city}, {order.shippingAddress.state} – {order.shippingAddress.pincode}</Text>
          <Text style={styles.address}>Ph: {order.shippingAddress.phone}</Text>
        </View>

        {/* Pricing */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Payment</Text>
          <View style={styles.row}><Text style={styles.label}>Method</Text><Text style={styles.value}>{order.paymentMethod}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Status</Text><Text style={styles.value}>{order.paymentStatus}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Subtotal</Text><Text style={styles.value}>₹{order.subtotal?.toLocaleString('en-IN')}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Shipping</Text><Text style={styles.value}>{order.shippingCharge === 0 ? 'FREE' : `₹${order.shippingCharge}`}</Text></View>
          <View style={styles.row}><Text style={styles.label}>GST</Text><Text style={styles.value}>₹{order.gstAmount?.toLocaleString('en-IN')}</Text></View>
          <View style={[styles.row, styles.totalRow]}><Text style={styles.totalLabel}>Total</Text><Text style={styles.totalValue}>₹{order.total?.toLocaleString('en-IN')}</Text></View>
        </View>

        {order.invoiceUrl && (
          <TouchableOpacity style={styles.invoiceBtn} onPress={() => Linking.openURL(order.invoiceUrl!)}>
            <Ionicons name="document-outline" size={18} color={colors.gold} />
            <Text style={styles.invoiceBtnText}>Download Invoice</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.date}>Placed on {new Date(order.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.light },
  loading: { fontFamily: fonts.body, color: colors.gray, textAlign: 'center', marginTop: 80 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.border },
  topTitle: { fontFamily: fonts.heading, fontSize: 16, color: colors.black },
  content: { padding: spacing.md, paddingBottom: 60, gap: spacing.md },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1 },
  statusText: { fontFamily: fonts.bodySemiBold, fontSize: 13, letterSpacing: 0.5 },
  card: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  cardTitle: { fontFamily: fonts.heading, fontSize: 16, color: colors.black, marginBottom: spacing.sm },
  itemRow: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  itemName: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.black },
  itemMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.lightGray, marginTop: 2 },
  itemPrice: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.black, marginTop: 2 },
  address: { fontFamily: fonts.body, fontSize: 14, color: colors.gray, lineHeight: 22 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  label: { fontFamily: fonts.body, fontSize: 14, color: colors.gray },
  value: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.black },
  totalRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: spacing.sm },
  totalLabel: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: colors.black },
  totalValue: { fontFamily: fonts.heading, fontSize: 18, color: colors.black },
  invoiceBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, justifyContent: 'center', borderWidth: 1, borderColor: colors.gold, borderRadius: radius.sm, padding: spacing.md },
  invoiceBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.gold },
  date: { fontFamily: fonts.body, fontSize: 12, color: colors.lightGray, textAlign: 'center' },
});
