import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CartItem } from '../types';

interface CartState {
  items: CartItem[];
  hydrated: boolean;
  addItem: (item: CartItem) => void;
  removeItem: (key: string) => void;
  updateQty: (key: string, qty: number) => void;
  clear: () => void;
  hydrate: () => Promise<void>;
}

const cartKey = (item: CartItem) => `${item.productId}_${item.size}_${item.colour}`;

const persist = async (items: CartItem[]) => {
  try {
    await AsyncStorage.setItem('cart', JSON.stringify(items));
  } catch {}
};

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem('cart');
      const items = raw ? JSON.parse(raw) : [];
      set({ items, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  addItem: (incoming) => {
    const k = cartKey(incoming);
    const existing = get().items.find((i) => cartKey(i) === k);
    let next: CartItem[];
    if (existing) {
      next = get().items.map((i) => cartKey(i) === k ? { ...i, qty: i.qty + incoming.qty } : i);
    } else {
      next = [...get().items, incoming];
    }
    set({ items: next });
    persist(next);
  },

  removeItem: (key) => {
    const next = get().items.filter((i) => cartKey(i) !== key);
    set({ items: next });
    persist(next);
  },

  updateQty: (key, qty) => {
    const next = qty <= 0
      ? get().items.filter((i) => cartKey(i) !== key)
      : get().items.map((i) => cartKey(i) === key ? { ...i, qty } : i);
    set({ items: next });
    persist(next);
  },

  clear: () => {
    set({ items: [] });
    AsyncStorage.removeItem('cart');
  },
}));

export const cartItemKey = cartKey;
