import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, radius } from '../../src/lib/theme';
import Button from '../../src/components/ui/Button';
import EmptyState from '../../src/components/ui/EmptyState';
import { useWishlistStore } from '../../src/stores/wishlistStore';
import { WishlistItem } from '../../src/types';

// Local-first wishlist (device storage — see src/stores/wishlistStore.ts).
// Replaces the Phase 2 static skeleton. There is no backend wishlist route
// (User.wishlist has no controller/route wired up server-side), so this is
// device-only for now — items are saved from the heart icon on product/[id].
export default function WishlistScreen() {
  const router = useRouter();
  const { items, remove } = useWishlistStore();

  const renderItem = ({ item }: { item: WishlistItem }) => (
    <TouchableOpacity style={styles.card} onPress={() => router.push(`/product/${item.productId}` as any)}>
      <Image source={{ uri: item.image }} style={styles.image} contentFit="cover" />
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.price}>₹{item.price.toLocaleString('en-IN')}</Text>
        {!!item.mrp && item.mrp > item.price && (
          <Text style={styles.mrp}>₹{item.mrp.toLocaleString('en-IN')}</Text>
        )}
      </View>
      <TouchableOpacity onPress={() => remove(item.productId)} style={styles.removeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="heart" size={20} color={colors.error} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Wishlist</Text>
      </View>

      {items.length === 0 ? (
        <EmptyState
          icon="heart-outline"
          title="Your wishlist is empty"
          subtitle="Save pieces you love and come back to them anytime — nothing here yet."
        >
          <Button label="Browse Shop" onPress={() => router.push('/(tabs)/shop' as any)} style={{ width: 220 }} />
        </EmptyState>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.productId}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.light },
  header: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  title: { fontFamily: fonts.heading, fontSize: 22, color: colors.black },
  list: { padding: spacing.md, paddingBottom: 80 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.sm, marginBottom: spacing.sm, gap: spacing.md },
  image: { width: 64, height: 80, borderRadius: radius.sm, backgroundColor: colors.border },
  info: { flex: 1 },
  name: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.black },
  price: { fontFamily: fonts.bodySemiBold, fontSize: 14, color: colors.black, marginTop: 4 },
  mrp: { fontFamily: fonts.body, fontSize: 12, color: colors.lightGray, textDecorationLine: 'line-through', marginTop: 2 },
  removeBtn: { padding: spacing.xs },
});
