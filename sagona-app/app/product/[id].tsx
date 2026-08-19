import React, { useRef, useState } from 'react';
import TryOnModal from '../../src/components/TryOnModal';
import SizeFinderModal from '../../src/components/SizeFinderModal';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions, Alert, ActivityIndicator, Animated } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../src/lib/api';
import { colors, fonts, spacing, radius } from '../../src/lib/theme';
import Button from '../../src/components/ui/Button';
import ErrorState from '../../src/components/ui/ErrorState';
import { useCartStore } from '../../src/stores/cartStore';
import { useWishlistStore } from '../../src/stores/wishlistStore';
import { Product } from '../../src/types';

const { width } = Dimensions.get('window');

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const addItem = useCartStore((s) => s.addItem);
  // Wishlist heart — links this screen into the Phase 4 wishlist feature
  // without changing any existing PDP behavior.
  const isWishlisted = useWishlistStore((s) => s.isSaved(id ?? ''));
  const toggleWishlist = useWishlistStore((s) => s.toggle);

  const [activeImage, setActiveImage]   = useState(0);
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedColour, setSelectedColour] = useState('');
  const [tryOnVisible, setTryOnVisible] = useState(false);
  const [sizeFinderVisible, setSizeFinderVisible] = useState(false);
  const heartScale = useRef(new Animated.Value(1)).current;

  const { data: product, isLoading, isError, refetch } = useQuery<Product>({
    queryKey: ['product', id],
    queryFn: async () => {
      const { data } = await api.get(`/products/${id}`);
      return data.data ?? data;
    },
    enabled: !!id,
  });

  if (isError) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.black} />
        </TouchableOpacity>
        <ErrorState
          title="Couldn't load this product"
          subtitle="Check your connection and try again."
          onRetry={() => refetch()}
        />
      </SafeAreaView>
    );
  }

  if (isLoading || !product) {
    return (
      <SafeAreaView style={styles.screen} edges={['top']}>
        <ActivityIndicator color={colors.gold} style={{ marginTop: 80 }} />
      </SafeAreaView>
    );
  }

  const animateHeart = () => {
    heartScale.setValue(1);
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1.3, useNativeDriver: true, speed: 40, bounciness: 12 }),
      Animated.spring(heartScale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 12 }),
    ]).start();
  };

  const images = product.images?.length ? product.images : [product.image ?? ''];
  const price = product.price ?? product.salePrice ?? product.basePrice ?? product.variants?.[0]?.price ?? 0;
  const sizes = [...new Set(product.variants?.map((v) => v.size) ?? [])];
  const colours = [...new Set(product.variants?.map((v) => v.colour) ?? [])];

  const selectedVariant = product.variants?.find(
    (v) => v.size === selectedSize && v.colour === selectedColour
  );
  const inStock = !selectedVariant || selectedVariant.stock > 0;

  const handleAddToBag = () => {
    if (sizes.length > 0 && !selectedSize) return Alert.alert('Select size', 'Please select a size first');
    if (colours.length > 0 && !selectedColour) return Alert.alert('Select colour', 'Please select a colour first');
    addItem({
      productId: product._id,
      name: product.name,
      image: images[0],
      price,
      qty: 1,
      size: selectedSize || 'One Size',
      colour: selectedColour || 'Default',
    });
    Alert.alert('Added to bag', product.name, [
      { text: 'Continue shopping' },
      { text: 'View bag', onPress: () => router.push('/(tabs)/bag' as any) },
    ]);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Back button */}
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={colors.black} />
        </TouchableOpacity>

        {/* Wishlist toggle */}
        <TouchableOpacity
          style={styles.wishlistBtn}
          activeOpacity={0.75}
          onPress={() => {
            animateHeart();
            toggleWishlist({
              productId: product._id,
              name: product.name,
              image: images[0],
              price,
              mrp: product.mrp,
              category: product.category,
            });
          }}
        >
          <Animated.View style={{ transform: [{ scale: heartScale }] }}>
            <Ionicons name={isWishlisted ? 'heart' : 'heart-outline'} size={22} color={isWishlisted ? colors.error : colors.black} />
          </Animated.View>
        </TouchableOpacity>

        {/* Image gallery */}
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={(e) => setActiveImage(Math.round(e.nativeEvent.contentOffset.x / width))}>
          {images.map((uri, i) => (
            <Image key={i} source={{ uri }} style={{ width, height: width * 1.2 }} contentFit="cover" transition={250} />
          ))}
        </ScrollView>

        {/* Dots */}
        {images.length > 1 && (
          <View style={styles.dots}>
            {images.map((_, i) => (
              <View key={i} style={[styles.dot, i === activeImage && styles.dotActive]} />
            ))}
          </View>
        )}

        <View style={styles.details}>
          <View style={styles.row}>
            <Text style={styles.name} numberOfLines={3}>{product.name}</Text>
            <Text style={styles.price}>₹{price.toLocaleString('en-IN')}</Text>
          </View>
          {product.mrp && product.mrp > price && (
            <Text style={styles.original}>MRP ₹{product.mrp.toLocaleString('en-IN')}</Text>
          )}

          {/* Sizes */}
          {sizes.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sizeHeaderRow}>
                <Text style={styles.sectionLabel}>SIZE</Text>
                <View style={{ flexDirection: 'row', gap: spacing.md }}>
                  <TouchableOpacity onPress={() => router.push(`/size-guide?productId=${product._id}` as any)}>
                    <Text style={styles.findSizeLink}>Size Guide</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setSizeFinderVisible(true)}>
                    <Text style={styles.findSizeLink}>Find My Size</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.optionRow}>
                {sizes.map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.sizeBtn, selectedSize === s && styles.sizeBtnActive]}
                    onPress={() => setSelectedSize(s)}
                  >
                    <Text style={[styles.sizeBtnText, selectedSize === s && styles.sizeBtnTextActive]}>{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Colours */}
          {colours.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>COLOUR</Text>
              <View style={styles.optionRow}>
                {colours.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.sizeBtn, selectedColour === c && styles.sizeBtnActive]}
                    onPress={() => setSelectedColour(c)}
                  >
                    <Text style={[styles.sizeBtnText, selectedColour === c && styles.sizeBtnTextActive]}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Description */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>DESCRIPTION</Text>
            <Text style={styles.description}>{product.description}</Text>
          </View>

          {!inStock && <Text style={styles.outOfStock}>Out of stock</Text>}
        </View>
      </ScrollView>

      {/* Add to bag + Try-On */}
      <View style={styles.footer}>
        <Button label={inStock ? 'Add to Bag' : 'Out of Stock'} onPress={handleAddToBag} disabled={!inStock} />
        <TouchableOpacity onPress={() => setTryOnVisible(true)} style={styles.tryOnBtn}>
          <Text style={styles.tryOnBtnText}>👗 TRY ON YOURSELF</Text>
        </TouchableOpacity>
        <Text style={styles.tryOnHint}>AI virtual try-on</Text>
      </View>

      <TryOnModal
        visible={tryOnVisible}
        onClose={() => setTryOnVisible(false)}
        productId={product?._id ?? ''}
        garmentImageUrl={product?.images?.[0] ?? product?.image ?? ''}
        productName={product?.name ?? ''}
      />

      <SizeFinderModal
        visible={sizeFinderVisible}
        onClose={() => setSizeFinderVisible(false)}
        productId={product?._id ?? ''}
        onSelectSize={setSelectedSize}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  loading: { fontFamily: fonts.body, color: colors.gray, textAlign: 'center', marginTop: 80 },
  back: { position: 'absolute', top: 12, left: spacing.md, zIndex: 10, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: radius.full, padding: 8 },
  wishlistBtn: { position: 'absolute', top: 12, right: spacing.md, zIndex: 10, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: radius.full, padding: 8 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: spacing.sm },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.gold, width: 18 },
  details: { padding: spacing.lg },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md },
  name: { flex: 1, fontFamily: fonts.heading, fontSize: 20, color: colors.black, lineHeight: 26 },
  price: { fontFamily: fonts.bodySemiBold, fontSize: 20, color: colors.black },
  original: { fontFamily: fonts.body, fontSize: 13, color: colors.lightGray, textDecorationLine: 'line-through', marginTop: 2 },
  section: { marginTop: spacing.lg },
  sectionLabel: { fontFamily: fonts.bodySemiBold, fontSize: 11, color: colors.gray, letterSpacing: 1.5, marginBottom: spacing.sm },
  sizeHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  findSizeLink: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.gold, textDecorationLine: 'underline', marginBottom: spacing.sm },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  sizeBtn: { paddingHorizontal: spacing.md, paddingVertical: 8, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm },
  sizeBtnActive: { borderColor: colors.gold, backgroundColor: colors.gold },
  sizeBtnText: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.black },
  sizeBtnTextActive: { color: colors.black },
  description: { fontFamily: fonts.body, fontSize: 14, color: colors.gray, lineHeight: 22 },
  outOfStock: { fontFamily: fonts.bodySemiBold, fontSize: 13, color: colors.error, marginTop: spacing.md },
  footer:       { padding: spacing.md, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.border },
  tryOnBtn:     { marginTop: 10, padding: 13, borderWidth: 1, borderColor: '#0A0A0A',
                  borderRadius: 4, alignItems: 'center' },
  tryOnBtnText: { fontSize: 11, letterSpacing: 1.4, color: '#0A0A0A', fontWeight: '600' },
  tryOnHint:    { fontSize: 11, color: '#888', textAlign: 'center', marginTop: 5 },
});
