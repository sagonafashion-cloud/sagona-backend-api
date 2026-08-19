import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import api from '../src/lib/api';
import { colors, fonts, spacing, radius, typography } from '../src/lib/theme';
import Button from '../src/components/ui/Button';
import ScreenHeader from '../src/components/ui/ScreenHeader';
import ErrorState from '../src/components/ui/ErrorState';
import EmptyState from '../src/components/ui/EmptyState';
import { statusLabel } from '../src/lib/orderStatus';
import { Order, Product } from '../src/types';

// Phase 6. Reuses the exact backend flow already live on the website
// (frontend/nc_assets/js/account.js -> requestReturn/submitReturnRequest)
// hitting POST /orders/:id/return-request (initiateReturn in
// backend/controllers/orderController.js). No new endpoint invented.
//
// Backend rule (initiateReturn): only orders with status === 'delivered' are
// eligible, and submitting immediately flips order.status to
// 'return_requested' — so "eligible" and "has an existing request" are
// mutually exclusive in practice, which is mirrored below.
export default function ReturnRequestScreen() {
  const { orderId: paramOrderId } = useLocalSearchParams<{ orderId?: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pickedOrderId, setPickedOrderId] = useState<string | null>(null);
  const activeOrderId = paramOrderId || pickedOrderId;

  if (!activeOrderId) {
    return <OrderPicker onPick={setPickedOrderId} />;
  }

  return <ReturnForm orderId={activeOrderId} onChangeOrder={paramOrderId ? undefined : () => setPickedOrderId(null)} queryClient={queryClient} router={router} />;
}

/* ── Step 1: pick which delivered order (only shown when not deep-linked from Order Detail) ── */
function OrderPicker({ onPick }: { onPick: (id: string) => void }) {
  const { data: orders, isLoading, isError, refetch } = useQuery<Order[]>({
    queryKey: ['returnEligibleOrders'],
    queryFn: async () => {
      const { data } = await api.get('/orders/my');
      return data.data ?? data;
    },
  });

  const eligible = (orders ?? []).filter((o) => o.status === 'delivered');

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title="Return / Exchange" />
      <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: spacing.xl }}>
        <Text style={styles.sectionLabel}>SELECT AN ORDER</Text>

        {isLoading && <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.xl }} />}
        {!isLoading && isError && <ErrorState title="Couldn't load your orders" onRetry={refetch} />}
        {!isLoading && !isError && eligible.length === 0 && (
          <EmptyState
            icon="return-down-back-outline"
            title="No orders eligible yet"
            subtitle="Return or exchange requests can only be started once an order has been delivered."
          />
        )}
        {!isLoading && eligible.map((order) => (
          <TouchableOpacity key={order._id} style={styles.orderPickCard} onPress={() => onPick(order._id)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.orderPickNumber}>#{order.orderNumber}</Text>
              <Text style={styles.orderPickMeta}>
                {order.items.length} item{order.items.length > 1 ? 's' : ''} · ₹{(order.billing?.grandTotal ?? order.total ?? 0).toLocaleString('en-IN')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.lightGray} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ── Step 2: order status card, or the real form ── */
function ReturnForm({ orderId, onChangeOrder, queryClient, router }: {
  orderId: string;
  onChangeOrder?: () => void;
  queryClient: ReturnType<typeof useQueryClient>;
  router: ReturnType<typeof useRouter>;
}) {
  const { data: order, isLoading, isError, refetch } = useQuery<Order>({
    queryKey: ['order', orderId],
    queryFn: async () => {
      const { data } = await api.get(`/orders/${orderId}`);
      return data.data ?? data;
    },
  });

  const [reqType, setReqType] = useState<'return' | 'replace'>('return');
  const [reason, setReason] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<{ id: string; name: string; image: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Mirrors website's loadReplacementProducts() — same public list endpoint,
  // debounced the same way (searchReplacementProducts, 400ms).
  useEffect(() => {
    if (reqType !== 'replace') return;
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ status: 'active', limit: '12' });
        if (search) params.set('search', search);
        const { data } = await api.get(`/products?${params.toString()}`);
        if (!cancelled) setResults(data.data ?? data ?? []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [search, reqType]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScreenHeader title="Return / Exchange" />
        <ActivityIndicator color={colors.gold} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  if (isError || !order) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScreenHeader title="Return / Exchange" />
        <ErrorState title="Couldn't load this order" onRetry={refetch} />
      </SafeAreaView>
    );
  }

  // Already requested (or not yet delivered) — reflect real state, don't show a form.
  if (order.returnRequest) {
    const rr = order.returnRequest;
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScreenHeader title="Return / Exchange" />
        <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: spacing.xl }}>
          <Text style={styles.sectionLabel}>ORDER #{order.orderNumber}</Text>
          <View style={styles.statusCard}>
            <Text style={styles.statusCardType}>{rr.type === 'replace' ? 'Replacement' : 'Return'} request</Text>
            <View style={[styles.statusPill, { backgroundColor: statusPillColor(rr.status) + '22', borderColor: statusPillColor(rr.status) }]}>
              <Text style={[styles.statusPillText, { color: statusPillColor(rr.status) }]}>{rr.status.toUpperCase()}</Text>
            </View>
            <Text style={styles.statusCardReason}>"{rr.reason}"</Text>
            {rr.replacementProductName ? (
              <Text style={styles.statusCardMeta}>Replacement requested: {rr.replacementProductName}</Text>
            ) : null}
            <Text style={styles.statusCardMeta}>Submitted {new Date(rr.requestedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</Text>
            {rr.adminNote ? <Text style={styles.statusCardMeta}>Note: {rr.adminNote}</Text> : null}
          </View>
          <Text style={styles.footnote}>Our team will contact you within 24 hours about this request.</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (order.status !== 'delivered') {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScreenHeader title="Return / Exchange" />
        <EmptyState
          icon="time-outline"
          title="Not eligible yet"
          subtitle={`This order is currently "${statusLabel(order.status)}". Return and exchange requests can only be started once an order has been delivered.`}
        >
          <Button label="Back to Order" onPress={() => router.back()} variant="outline" style={{ width: 200 }} />
        </EmptyState>
      </SafeAreaView>
    );
  }

  const handleSubmit = async () => {
    if (!reason.trim()) return Alert.alert('Reason required', 'Please tell us why you want to return or exchange this order.');
    if (reqType === 'replace' && !selected) return Alert.alert('Select a replacement', 'Please choose the product you would like instead.');

    setSubmitting(true);
    setSubmitError(null);
    try {
      const { data } = await api.post(`/orders/${orderId}/return-request`, {
        returnType: reqType,
        reason: reason.trim(),
        replacementProductId: selected?.id || '',
        replacementProductName: selected?.name || '',
      });
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      queryClient.invalidateQueries({ queryKey: ['myOrders'] });
      queryClient.invalidateQueries({ queryKey: ['returnEligibleOrders'] });
      Alert.alert('Request submitted', data.message || 'Our team will contact you within 24 hours.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      setSubmitError(err.message || 'Could not submit this request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title="Return / Exchange" />
      <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: spacing.xl }} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionLabel}>ORDER</Text>
        <View style={styles.orderCard}>
          <Text style={styles.orderCardNumber}>#{order.orderNumber}</Text>
          {order.items.map((item, i) => (
            <Text key={i} style={styles.orderCardItem} numberOfLines={1}>{item.name} · {item.size} · {item.colour}</Text>
          ))}
          {onChangeOrder && (
            <TouchableOpacity onPress={onChangeOrder} style={{ marginTop: spacing.xs }}>
              <Text style={styles.changeOrderLink}>Change order</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.sectionLabel}>REQUEST TYPE</Text>
        <View style={styles.rowGroup}>
          <TouchableOpacity style={[styles.pill, reqType === 'return' && styles.pillActive]} onPress={() => setReqType('return')}>
            <Text style={[styles.pillText, reqType === 'return' && styles.pillTextActive]}>Return</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.pill, reqType === 'replace' && styles.pillActive]} onPress={() => setReqType('replace')}>
            <Text style={[styles.pillText, reqType === 'replace' && styles.pillTextActive]}>Exchange</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>REASON</Text>
        <TextInput
          style={styles.reasonInput}
          placeholder="e.g. Wrong size, defective product…"
          placeholderTextColor={colors.lightGray}
          value={reason}
          onChangeText={setReason}
          multiline
          numberOfLines={3}
        />

        {reqType === 'replace' && (
          <>
            <Text style={styles.sectionLabel}>CHOOSE A REPLACEMENT</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Search products…"
              placeholderTextColor={colors.lightGray}
              value={search}
              onChangeText={setSearch}
            />
            {selected && (
              <View style={styles.selectedBox}>
                <Text style={styles.selectedLabel}>SELECTED</Text>
                <Text style={styles.selectedName}>{selected.name}</Text>
              </View>
            )}
            {searching ? (
              <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.md }} />
            ) : (
              <View style={styles.productGrid}>
                {results.map((p) => {
                  const img = p.images?.[0] || p.image || '';
                  const isSel = selected?.id === p._id;
                  return (
                    <TouchableOpacity
                      key={p._id}
                      style={[styles.productCell, isSel && styles.productCellActive]}
                      onPress={() => setSelected({ id: p._id, name: p.name, image: img })}
                    >
                      {img ? <Image source={{ uri: img }} style={styles.productImg} contentFit="cover" /> : <View style={styles.productImg} />}
                      <Text style={styles.productName} numberOfLines={1}>{p.name}</Text>
                      <Text style={styles.productPrice}>₹{Number(p.price).toLocaleString('en-IN')}</Text>
                    </TouchableOpacity>
                  );
                })}
                {results.length === 0 && !searching && (
                  <Text style={styles.noResults}>No products found</Text>
                )}
              </View>
            )}
          </>
        )}

        {submitError && <Text style={styles.errorText}>{submitError}</Text>}

        <Button label="Submit Request" onPress={handleSubmit} loading={submitting} style={{ marginTop: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function statusPillColor(status: string) {
  if (status === 'approved' || status === 'completed') return colors.success;
  if (status === 'rejected') return colors.error;
  return colors.gold; // pending
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.light },
  body: { flex: 1, padding: spacing.md },
  sectionLabel: { ...typography.label, color: colors.lightGray, marginTop: spacing.lg, marginBottom: spacing.sm },
  orderPickCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm,
  },
  orderPickNumber: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.black },
  orderPickMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.lightGray, marginTop: 2 },
  orderCard: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  orderCardNumber: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.black, marginBottom: spacing.xs },
  orderCardItem: { fontFamily: fonts.body, fontSize: 13, color: colors.gray, marginTop: 2 },
  changeOrderLink: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.gold },
  rowGroup: { flexDirection: 'row', gap: spacing.sm },
  pill: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.full, paddingVertical: spacing.xs, paddingHorizontal: spacing.md },
  pillActive: { borderColor: colors.gold, backgroundColor: colors.gold },
  pillText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.gray },
  pillTextActive: { color: colors.black },
  reasonInput: {
    backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, fontFamily: fonts.body, fontSize: 14, color: colors.black, minHeight: 80, textAlignVertical: 'top',
  },
  searchInput: {
    backgroundColor: colors.white, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.md, height: 44, fontFamily: fonts.body, fontSize: 14, color: colors.black,
  },
  selectedBox: { backgroundColor: '#EAF3DE', borderRadius: radius.sm, padding: spacing.sm, marginTop: spacing.sm },
  selectedLabel: { fontFamily: fonts.bodySemiBold, fontSize: 10, letterSpacing: 0.5, color: colors.success },
  selectedName: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.black, marginTop: 2 },
  productGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  productCell: { width: '31%', borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, overflow: 'hidden', padding: 6 },
  productCellActive: { borderColor: colors.gold, borderWidth: 2, backgroundColor: '#FAEEDA' },
  productImg: { width: '100%', aspectRatio: 1, borderRadius: 4, backgroundColor: colors.light },
  productName: { fontFamily: fonts.bodyMedium, fontSize: 11, color: colors.black, marginTop: 4 },
  productPrice: { fontFamily: fonts.body, fontSize: 11, color: colors.gray },
  noResults: { fontFamily: fonts.body, fontSize: 13, color: colors.lightGray, padding: spacing.md },
  errorText: { fontFamily: fonts.body, fontSize: 13, color: colors.error, marginTop: spacing.md, textAlign: 'center' },
  statusCard: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.xs },
  statusCardType: { fontFamily: fonts.heading, fontSize: 16, color: colors.black },
  statusPill: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3, marginTop: 4 },
  statusPillText: { fontFamily: fonts.bodySemiBold, fontSize: 11, letterSpacing: 0.5 },
  statusCardReason: { fontFamily: fonts.body, fontSize: 13, color: colors.gray, marginTop: spacing.sm, fontStyle: 'italic' },
  statusCardMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.lightGray, marginTop: 4 },
  footnote: { ...typography.caption, textAlign: 'center', marginTop: spacing.md },
});
