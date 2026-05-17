import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { colors, fonts, spacing, radius } from '../../lib/theme';
import { Product } from '../../types';

interface Props {
  product: Product;
}

export default function ProductCard({ product }: Props) {
  const router = useRouter();
  const image = product.images?.[0] ?? product.image ?? '';
  const price = product.salePrice ?? product.basePrice ?? product.variants?.[0]?.price ?? 0;

  return (
    <TouchableOpacity style={styles.card} onPress={() => router.push(`/product/${product._id}` as any)} activeOpacity={0.85}>
      <View style={styles.imageWrap}>
        <Image source={{ uri: image }} style={styles.image} contentFit="cover" transition={200} />
        {product.isSale && <View style={[styles.badge, styles.badgeSale]}><Text style={styles.badgeText}>SALE</Text></View>}
        {product.isNew && !product.isSale && <View style={[styles.badge, styles.badgeNew]}><Text style={styles.badgeText}>NEW</Text></View>}
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={2}>{product.name}</Text>
        <Text style={styles.price}>₹{price.toLocaleString('en-IN')}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, margin: spacing.xs },
  imageWrap: { position: 'relative', borderRadius: radius.sm, overflow: 'hidden' },
  image: { width: '100%', aspectRatio: 3 / 4, backgroundColor: colors.light },
  badge: { position: 'absolute', top: 8, left: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 2 },
  badgeSale: { backgroundColor: colors.gold },
  badgeNew: { backgroundColor: colors.black },
  badgeText: { fontFamily: fonts.bodySemiBold, fontSize: 10, color: colors.white, letterSpacing: 1 },
  info: { paddingTop: spacing.sm },
  name: { fontFamily: fonts.body, fontSize: 13, color: colors.black, lineHeight: 18 },
  price: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.black, marginTop: 4 },
});
