import React from 'react';
import { View, Text, ScrollView, FlatList, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import api from '../../src/lib/api';
import { colors, fonts, spacing } from '../../src/lib/theme';
import ProductCard from '../../src/components/ui/ProductCard';
import { Product } from '../../src/types';

const { width } = Dimensions.get('window');

const CATEGORIES = [
  { label: 'Boys', value: 'boys', emoji: '👦' },
  { label: 'Girls', value: 'girls', emoji: '👧' },
  { label: 'Newborn', value: 'newborn', emoji: '🍼' },
  { label: 'Sets', value: 'sets', emoji: '✨' },
];

export default function HomeScreen() {
  const router = useRouter();

  const { data: newArrivals } = useQuery<Product[]>({
    queryKey: ['newArrivals'],
    queryFn: async () => {
      const { data } = await api.get('/products?limit=6&sort=newest');
      return data.data ?? data;
    },
  });

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.brand}>SAGONA</Text>
          <Text style={styles.tagline}>Premium Kidswear</Text>
        </View>

        {/* Hero banner */}
        <View style={styles.hero}>
          <Image
            source={{ uri: 'https://images.unsplash.com/photo-1519457431-44ccd64a579b?w=800' }}
            style={styles.heroImage}
            contentFit="cover"
          />
          <LinearGradient
            colors={['transparent', 'rgba(10,10,10,0.85)']}
            style={styles.heroGradient}
          />
          <View style={styles.heroContent}>
            <Text style={styles.heroTitle}>New Arrivals{'\n'}SS 2026</Text>
            <TouchableOpacity style={styles.heroBtn} onPress={() => router.push('/(tabs)/shop' as any)}>
              <Text style={styles.heroBtnText}>SHOP NOW</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Categories */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Shop by Category</Text>
          <View style={styles.categoryGrid}>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat.value}
                style={styles.catCard}
                onPress={() => router.push({ pathname: '/(tabs)/shop', params: { category: cat.value } } as any)}
              >
                <Text style={styles.catEmoji}>{cat.emoji}</Text>
                <Text style={styles.catLabel}>{cat.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* New arrivals */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>New Arrivals</Text>
          {newArrivals && newArrivals.length > 0 ? (
            <FlatList
              data={newArrivals}
              keyExtractor={(p) => p._id}
              numColumns={2}
              renderItem={({ item }) => <ProductCard product={item} />}
              scrollEnabled={false}
            />
          ) : (
            <Text style={styles.empty}>Loading...</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.light },
  header: { backgroundColor: colors.black, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, alignItems: 'center' },
  brand: { fontFamily: fonts.heading, fontSize: 24, color: colors.gold, letterSpacing: 4 },
  tagline: { fontFamily: fonts.body, fontSize: 10, color: colors.lightGray, letterSpacing: 3, textTransform: 'uppercase', marginTop: 2 },
  hero: { height: 420, position: 'relative' },
  heroImage: { width: '100%', height: '100%' },
  heroGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 220 },
  heroContent: { position: 'absolute', bottom: spacing.xl, left: spacing.lg, right: spacing.lg },
  heroTitle: { fontFamily: fonts.heading, fontSize: 34, color: colors.white, lineHeight: 42, marginBottom: spacing.lg },
  heroBtn: { alignSelf: 'flex-start', backgroundColor: colors.gold, paddingHorizontal: spacing.xl, paddingVertical: 14, borderRadius: 2 },
  heroBtnText: { fontFamily: fonts.bodySemiBold, fontSize: 12, color: colors.black, letterSpacing: 2 },
  section: { padding: spacing.lg },
  sectionTitle: { fontFamily: fonts.heading, fontSize: 22, color: colors.black, marginBottom: spacing.md },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  catCard: { flex: 1, minWidth: (width - spacing.lg * 2 - spacing.sm * 3) / 4, backgroundColor: colors.white, borderRadius: 8, alignItems: 'center', paddingVertical: spacing.md, borderWidth: 1, borderColor: colors.border },
  catEmoji: { fontSize: 24, marginBottom: 4 },
  catLabel: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.black },
  empty: { fontFamily: fonts.body, color: colors.lightGray, textAlign: 'center', paddingVertical: spacing.xl },
});
