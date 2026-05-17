import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../src/lib/api';
import { colors, fonts, spacing, radius } from '../../src/lib/theme';
import ProductCard from '../../src/components/ui/ProductCard';
import { Product } from '../../src/types';

const CATEGORIES = ['All', 'boys', 'girls', 'newborn', 'sets', 'accessories'];
const PRICE_RANGES = [
  { label: 'All', value: '' },
  { label: 'Under ₹999', value: '0-999' },
  { label: '₹999–2499', value: '999-2499' },
  { label: '₹2500+', value: '2500-99999' },
];

export default function ShopScreen() {
  const params = useLocalSearchParams<{ category?: string }>();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(params.category ?? 'All');
  const [price, setPrice] = useState('');

  const { data, isLoading } = useQuery<Product[]>({
    queryKey: ['products', category, price, search],
    queryFn: async () => {
      const p = new URLSearchParams();
      p.set('limit', '50');
      if (category && category !== 'All') p.set('category', category);
      if (price) { const [min, max] = price.split('-'); p.set('minPrice', min); p.set('maxPrice', max); }
      if (search) p.set('search', search);
      const { data } = await api.get(`/products?${p.toString()}`);
      return data.data ?? data;
    },
  });

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {/* Search bar */}
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={18} color={colors.lightGray} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search products..."
          placeholderTextColor={colors.lightGray}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={colors.lightGray} />
          </TouchableOpacity>
        )}
      </View>

      {/* Category pills */}
      <FlatList
        horizontal
        data={CATEGORIES}
        keyExtractor={(c) => c}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillRow}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.pill, category === item && styles.pillActive]}
            onPress={() => setCategory(item)}
          >
            <Text style={[styles.pillText, category === item && styles.pillTextActive]}>
              {item === 'All' ? 'All' : item.charAt(0).toUpperCase() + item.slice(1)}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* Price filter */}
      <FlatList
        horizontal
        data={PRICE_RANGES}
        keyExtractor={(r) => r.value}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillRow}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.pill, price === item.value && styles.pillActive]}
            onPress={() => setPrice(item.value)}
          >
            <Text style={[styles.pillText, price === item.value && styles.pillTextActive]}>{item.label}</Text>
          </TouchableOpacity>
        )}
      />

      {/* Product grid */}
      {isLoading ? (
        <ActivityIndicator color={colors.gold} style={{ marginTop: spacing.xl }} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(p) => p._id}
          numColumns={2}
          renderItem={({ item }) => <ProductCard product={item} />}
          contentContainerStyle={styles.grid}
          ListEmptyComponent={<Text style={styles.empty}>No products found</Text>}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.light },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, margin: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm },
  searchIcon: { marginRight: 6 },
  searchInput: { flex: 1, height: 44, fontFamily: fonts.body, fontSize: 15, color: colors.black },
  pillRow: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm, gap: spacing.sm },
  pill: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  pillActive: { backgroundColor: colors.gold, borderColor: colors.gold },
  pillText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.gray },
  pillTextActive: { color: colors.black },
  grid: { paddingHorizontal: spacing.sm, paddingBottom: 80 },
  empty: { fontFamily: fonts.body, color: colors.lightGray, textAlign: 'center', marginTop: spacing.xl },
});
