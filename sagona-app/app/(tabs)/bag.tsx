import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useCartStore, cartItemKey } from '../../src/stores/cartStore';
import Button from '../../src/components/ui/Button';
import { colors, fonts, spacing, radius } from '../../src/lib/theme';
import { CartItem } from '../../src/types';

const GST_RATE = 0.05;
const FREE_SHIP = 999;
const SHIP_CHARGE = 99;

export default function BagScreen() {
  const router = useRouter();
  const { items, updateQty, removeItem } = useCartStore();

  const subtotal = items.reduce((n, i) => n + i.price * i.qty, 0);
  const shipping = subtotal >= FREE_SHIP ? 0 : SHIP_CHARGE;
  const gst = Math.round((subtotal + shipping) * GST_RATE);
  const total = subtotal + shipping + gst;

  if (items.length === 0) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <View style={styles.emptyWrap}>
          <Ionicons name="bag-outline" size={64} color={colors.border} />
          <Text style={styles.emptyTitle}>Your bag is empty</Text>
          <Text style={styles.emptySub}>Add items to get started</Text>
          <Button label="Shop Now" onPress={() => router.push('/(tabs)/shop' as any)} style={{ marginTop: spacing.lg, width: 180 }} />
        </View>
      </SafeAreaView>
    );
  }

  const renderItem = ({ item }: { item: CartItem }) => {
    const key = cartItemKey(item);
    return (
      <View style={styles.cartRow}>
        <Image source={{ uri: item.image }} style={styles.thumb} contentFit="cover" />
        <View style={styles.cartInfo}>
          <Text style={styles.cartName} numberOfLines={2}>{item.name}</Text>
          <Text style={styles.cartMeta}>{item.size} · {item.colour}</Text>
          <Text style={styles.cartPrice}>₹{item.price.toLocaleString('en-IN')}</Text>
          <View style={styles.qtyRow}>
            <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQty(key, item.qty - 1)}>
              <Ionicons name="remove" size={16} color={colors.black} />
            </TouchableOpacity>
            <Text style={styles.qtyText}>{item.qty}</Text>
            <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQty(key, item.qty + 1)}>
              <Ionicons name="add" size={16} color={colors.black} />
            </TouchableOpacity>
          </View>
        </View>
        <TouchableOpacity onPress={() => removeItem(key)} style={styles.removeBtn}>
          <Ionicons name="trash-outline" size={18} color={colors.lightGray} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <Text style={styles.title}>My Bag</Text>
      <FlatList
        data={items}
        keyExtractor={(i) => cartItemKey(i)}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListFooterComponent={
          <View style={styles.summary}>
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Subtotal</Text><Text style={styles.summaryValue}>₹{subtotal.toLocaleString('en-IN')}</Text></View>
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Shipping</Text><Text style={styles.summaryValue}>{shipping === 0 ? 'FREE' : `₹${shipping}`}</Text></View>
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>GST (5%)</Text><Text style={styles.summaryValue}>₹{gst.toLocaleString('en-IN')}</Text></View>
            <View style={[styles.summaryRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>₹{total.toLocaleString('en-IN')}</Text>
            </View>
            {subtotal < FREE_SHIP && (
              <Text style={styles.freeShipNote}>Add ₹{FREE_SHIP - subtotal} more for free shipping</Text>
            )}
            <Button label="Proceed to Checkout" onPress={() => router.push('/checkout' as any)} style={{ marginTop: spacing.md }} />
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.light },
  title: { fontFamily: fonts.heading, fontSize: 24, color: colors.black, padding: spacing.lg, paddingBottom: spacing.sm },
  list: { paddingHorizontal: spacing.md, paddingBottom: 80 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  emptyTitle: { fontFamily: fonts.heading, fontSize: 22, color: colors.black },
  emptySub: { fontFamily: fonts.body, fontSize: 14, color: colors.lightGray },
  cartRow: { flexDirection: 'row', backgroundColor: colors.white, borderRadius: radius.md, marginBottom: spacing.sm, padding: spacing.md, gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  thumb: { width: 80, height: 100, borderRadius: radius.sm, backgroundColor: colors.light },
  cartInfo: { flex: 1 },
  cartName: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.black, lineHeight: 20 },
  cartMeta: { fontFamily: fonts.body, fontSize: 12, color: colors.lightGray, marginTop: 2 },
  cartPrice: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.black, marginTop: 4 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  qtyBtn: { width: 28, height: 28, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  qtyText: { fontFamily: fonts.bodySemiBold, fontSize: 15, color: colors.black, width: 24, textAlign: 'center' },
  removeBtn: { alignSelf: 'flex-start', padding: 4 },
  summary: { backgroundColor: colors.white, borderRadius: radius.md, padding: spacing.lg, marginTop: spacing.md, borderWidth: 1, borderColor: colors.border },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  summaryLabel: { fontFamily: fonts.body, fontSize: 14, color: colors.gray },
  summaryValue: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.black },
  totalRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm, marginTop: spacing.sm, marginBottom: 0 },
  totalLabel: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: colors.black },
  totalValue: { fontFamily: fonts.heading, fontSize: 18, color: colors.black },
  freeShipNote: { fontFamily: fonts.body, fontSize: 12, color: colors.gold, textAlign: 'center', marginTop: spacing.sm },
});
