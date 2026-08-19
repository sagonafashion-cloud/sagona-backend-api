import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Sentry from '@sentry/react-native';
import { WishlistItem } from '../types';

// Local-first wishlist, mirroring cartStore.ts's AsyncStorage pattern.
//
// There is no backend wishlist route (User.wishlist is a schema field with no
// controller/route ever wired up — see backend/models/User.js), and this
// phase's scope excludes backend changes. This matches Phase 1's own
// recommendation for wishlist UX: save locally, no login wall, no server
// round-trip. Cross-device sync would need a backend endpoint — flagged as a
// follow-up, not built here.

interface WishlistState {
  items: WishlistItem[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  toggle: (item: Omit<WishlistItem, 'addedAt'>) => void;
  remove: (productId: string) => void;
  isSaved: (productId: string) => boolean;
  clear: () => void;
}

const persist = async (items: WishlistItem[]) => {
  try {
    await AsyncStorage.setItem('wishlist', JSON.stringify(items));
  } catch (err) {
    Sentry.captureException(err);
  }
};

export const useWishlistStore = create<WishlistState>((set, get) => ({
  items: [],
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem('wishlist');
      const items = raw ? JSON.parse(raw) : [];
      set({ items, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  toggle: (item) => {
    const exists = get().items.some((i) => i.productId === item.productId);
    const next = exists
      ? get().items.filter((i) => i.productId !== item.productId)
      : [...get().items, { ...item, addedAt: new Date().toISOString() }];
    set({ items: next });
    persist(next);
  },

  remove: (productId) => {
    const next = get().items.filter((i) => i.productId !== productId);
    set({ items: next });
    persist(next);
  },

  isSaved: (productId) => get().items.some((i) => i.productId === productId),

  clear: () => {
    set({ items: [] });
    AsyncStorage.removeItem('wishlist');
  },
}));
