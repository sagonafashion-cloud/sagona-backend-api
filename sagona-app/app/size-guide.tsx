import React from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import api from '../src/lib/api';
import { colors, fonts, spacing, radius, typography } from '../src/lib/theme';
import Button from '../src/components/ui/Button';
import ScreenHeader from '../src/components/ui/ScreenHeader';
import ErrorState from '../src/components/ui/ErrorState';
import EmptyState from '../src/components/ui/EmptyState';
import { Product, GarmentMeasurement } from '../src/types';

// Phase 6. There is no general age/height -> size chart in the backend (the
// only structured measurement data is Product.garmentMeasurements, which is
// per-product and admin-populated per garment — the same field the AI Size
// Finder's /sizing/recommend reads internally). So this screen is now
// product-specific: linked from the PDP for a given product, reading that
// product's real measurements from GET /products/:id (which returns the full
// document, garmentMeasurements included — confirmed in productController.js,
// no field restriction on getProductById). If a product has no measurements
// populated yet, that's shown honestly as a per-product gap rather than
// hardcoded placeholder numbers.
const COLUMNS: { key: keyof GarmentMeasurement; label: string }[] = [
  { key: 'chestWidth', label: 'Chest' },
  { key: 'waistWidth', label: 'Waist' },
  { key: 'shoulderWidth', label: 'Shoulder' },
  { key: 'sleeveLength', label: 'Sleeve' },
  { key: 'garmentLength', label: 'Length' },
  { key: 'hipWidth', label: 'Hip' },
  { key: 'inseam', label: 'Inseam' },
  { key: 'neckWidth', label: 'Neck' },
];

export default function SizeGuideScreen() {
  const { productId } = useLocalSearchParams<{ productId?: string }>();
  const router = useRouter();

  if (!productId) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScreenHeader title="Size Guide" />
        <EmptyState
          icon="resize-outline"
          title="Open from a product page"
          subtitle="Measurements are specific to each garment — open Size Guide from a product's page to see its real size chart."
        >
          <Button label="Browse Shop" onPress={() => router.push('/(tabs)/shop' as any)} style={{ width: 200 }} />
        </EmptyState>
      </SafeAreaView>
    );
  }

  const { data: product, isLoading, isError, refetch } = useQuery<Product>({
    queryKey: ['product', productId],
    queryFn: async () => {
      const { data } = await api.get(`/products/${productId}`);
      return data.data ?? data;
    },
  });

  if (isLoading) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScreenHeader title="Size Guide" />
        <ActivityIndicator color={colors.gold} style={{ marginTop: 60 }} />
      </SafeAreaView>
    );
  }

  if (isError || !product) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ScreenHeader title="Size Guide" />
        <ErrorState title="Couldn't load this product's size chart" onRetry={refetch} />
      </SafeAreaView>
    );
  }

  const rows = product.garmentMeasurements ?? [];
  // Only show columns that have at least one real value across all rows —
  // avoids a chart full of "—" for measurement fields this product never had populated.
  const activeColumns = COLUMNS.filter((c) => rows.some((r) => typeof r[c.key] === 'number'));

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScreenHeader title="Size Guide" />
      <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: spacing.xl }}>
        <Text style={styles.productName}>{product.name}</Text>

        {rows.length === 0 ? (
          <EmptyState
            icon="resize-outline"
            title="No size chart yet"
            subtitle="Measurements haven't been added for this product yet. Try the AI Size Finder on the product page for a fit recommendation instead."
          >
            <Button label="Back to Product" onPress={() => router.back()} variant="outline" style={{ width: 200 }} />
          </EmptyState>
        ) : (
          <>
            {(product.fitNote || product.fitType) && (
              <View style={styles.noteBox}>
                {product.fitType && <Text style={styles.noteTitle}>Fit: {product.fitType.charAt(0).toUpperCase() + product.fitType.slice(1)}</Text>}
                {product.fitNote && <Text style={styles.noteText}>{product.fitNote}</Text>}
                {product.sizeUpNote && <Text style={styles.noteText}>{product.sizeUpNote}</Text>}
              </View>
            )}

            <Text style={styles.tableHint}>All measurements in inches, laid flat.</Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.table}>
                <View style={[styles.row, styles.rowHead]}>
                  <Text style={[styles.cell, styles.cellHead, styles.sizeCell]}>Size</Text>
                  {activeColumns.map((c) => (
                    <Text key={c.key} style={[styles.cell, styles.cellHead]}>{c.label}</Text>
                  ))}
                </View>
                {rows.map((r, i) => (
                  <View key={i} style={styles.row}>
                    <Text style={[styles.cell, styles.sizeCell, styles.sizeCellText]}>{r.size}</Text>
                    {activeColumns.map((c) => (
                      <Text key={c.key} style={styles.cell}>{typeof r[c.key] === 'number' ? r[c.key] : '—'}</Text>
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>

            <Text style={styles.footnote}>Not sure which size to pick? Use the AI Size Finder on the product page for a personal recommendation.</Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.light },
  body: { flex: 1, padding: spacing.md },
  productName: { ...typography.h2, marginBottom: spacing.md },
  noteBox: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md },
  noteTitle: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.black, marginBottom: 4 },
  noteText: { fontFamily: fonts.body, fontSize: 13, color: colors.gray, lineHeight: 19, marginTop: 2 },
  tableHint: { ...typography.caption, marginBottom: spacing.sm },
  table: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', paddingVertical: spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowHead: { backgroundColor: colors.light },
  cell: { width: 76, fontFamily: fonts.body, fontSize: 13, color: colors.black, textAlign: 'center' },
  cellHead: { fontFamily: fonts.bodySemiBold, color: colors.gray, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  sizeCell: { width: 64, paddingLeft: spacing.md, textAlign: 'left' },
  sizeCellText: { fontFamily: fonts.bodySemiBold, color: colors.black },
  footnote: { ...typography.caption, textAlign: 'center', marginTop: spacing.md },
});
