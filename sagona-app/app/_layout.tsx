import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enableAutoSessionTracking: true,
  tracesSampleRate: 0.2,
});

import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import {
  useFonts,
  PlayfairDisplay_400Regular,
  PlayfairDisplay_700Bold,
  PlayfairDisplay_400Regular_Italic,
} from '@expo-google-fonts/playfair-display';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import { useAuthStore } from '../src/stores/authStore';
import { useCartStore } from '../src/stores/cartStore';
import { useWishlistStore } from '../src/stores/wishlistStore';
import { usePushNotifications } from '../src/hooks/usePushNotifications';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

// Tabs guests can browse without an account. Everything else ((tabs)/account,
// (tabs)/chat, (tabs)/wishlist, orders/*, and all Phase 2 shell screens) stays
// gated behind login, unchanged from before.
const GUEST_ALLOWED_TABS = new Set(['index', 'shop', 'bag']);

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuthStore();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    const inAuth = segments[0] === 'auth';
    const inTabs = segments[0] === '(tabs)';
    const tabName = segments[1];
    // Guests may browse Home/Shop/Cart, view a PDP, reach checkout (guest
    // checkout — see checkout/index.tsx), and view a product's Size Guide
    // without logging in. Size Guide only reads GET /products/:id (the same
    // public endpoint the guest-accessible PDP already uses) and is linked
    // directly from the PDP's size picker — leaving it gated bounced guests
    // tapping that link straight to the login screen mid-browse.
    const guestAllowed =
      inAuth ||
      (inTabs && (tabName === undefined || GUEST_ALLOWED_TABS.has(tabName))) ||
      segments[0] === 'product' ||
      segments[0] === 'checkout' ||
      segments[0] === 'size-guide';

    if (!user && !guestAllowed) {
      router.replace('/auth/login');
    } else if (user && inAuth) {
      router.replace('/(tabs)/');
    }
  }, [user, isLoading, segments]);

  return <>{children}</>;
}

function PushSetup() {
  usePushNotifications();
  return null;
}

export default function RootLayout() {
  const hydrate = useAuthStore((s) => s.hydrate);
  const hydrateCart = useCartStore((s) => s.hydrate);
  const hydrateWishlist = useWishlistStore((s) => s.hydrate);

  const [fontsLoaded] = useFonts({
    PlayfairDisplay_400Regular,
    PlayfairDisplay_700Bold,
    PlayfairDisplay_400Regular_Italic,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  useEffect(() => {
    hydrate();
    hydrateCart();
    hydrateWishlist();
  }, []);

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AuthGuard>
          <PushSetup />
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="auth" options={{ headerShown: false }} />
            <Stack.Screen name="product/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="checkout/index" options={{ headerShown: false }} />
            <Stack.Screen name="orders/[id]" options={{ headerShown: false }} />
          </Stack>
        </AuthGuard>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
