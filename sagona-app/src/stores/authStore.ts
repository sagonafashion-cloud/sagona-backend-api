import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import api from '../lib/api';
import { onSessionExpired } from '../lib/authEvents';
import { User } from '../types';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, birthday?: string) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
  updateUser: (partial: Partial<User>) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isLoading: true,

  hydrate: async () => {
    try {
      const token = await SecureStore.getItemAsync('token');
      const userJson = await SecureStore.getItemAsync('user');
      if (token && userJson) {
        set({ token, user: JSON.parse(userJson), isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  login: async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    await SecureStore.setItemAsync('token', data.token);
    await SecureStore.setItemAsync('user', JSON.stringify(data.user));
    set({ token: data.token, user: data.user });
  },

  register: async (name, email, password, birthday) => {
    const { data } = await api.post('/auth/register', { name, email, password, birthday });
    await SecureStore.setItemAsync('token', data.token);
    await SecureStore.setItemAsync('user', JSON.stringify(data.user));
    set({ token: data.token, user: data.user });
  },

  // Merges edited fields into the persisted user object. Used for profile
  // edits: the backend's PUT /auth/me response (formatUser) never echoes back
  // `phone`, so callers pass the submitted values here directly rather than
  // relying on the server response to reflect them.
  updateUser: async (partial) => {
    const current = get().user;
    if (!current) return;
    const updated = { ...current, ...partial };
    await SecureStore.setItemAsync('user', JSON.stringify(updated));
    set({ user: updated });
  },

  logout: async () => {
    // Unregister this device's push token before dropping the session —
    // otherwise the next person to use this device (or this user on a new
    // device) keeps receiving the previous account's order-update pushes.
    // Best-effort: must not block logout if it fails (e.g. token already expired).
    try {
      await api.patch('/auth/push-token', { expoPushToken: '' });
    } catch {}
    await SecureStore.deleteItemAsync('token');
    await SecureStore.deleteItemAsync('user');
    // Drop the SAGi chat session too — otherwise the next person to use this
    // device (or this user on a shared device) reuses a sessionId tied to the
    // previous account. The backend already guards against cross-user replay
    // (chatController.js starts a fresh session on a userId mismatch), but
    // clearing it here avoids the wasted round trip and is the correct
    // behaviour on logout regardless of that server-side defense.
    await SecureStore.deleteItemAsync('sagi_session');
    set({ token: null, user: null });
  },
}));

// Global 401 / session-expiry handler. api.ts's response interceptor emits
// this event whenever a request that carried an Authorization header comes
// back 401 (expired/invalid token) — see src/lib/authEvents.ts and
// src/lib/api.ts. Subscribed once here, at store creation, so it applies
// app-wide without every screen wiring it up individually.
//
// `logout()` is reused so this performs the exact same cleanup as a manual
// sign-out (clears `token`, `user`, and the `sagi_session` SecureStore keys,
// and best-effort unregisters the push token) — mirroring the website's
// handleSessionExpired() in frontend/nc_assets/js/api.js, which clears auth
// and sends the user back to the login screen.
//
// `handlingSessionExpiry` guards against re-entrancy: logout() itself makes
// an authenticated API call (unregistering the push token) using the very
// token that just expired, which would 401 again and re-emit this event —
// without the guard that could recurse indefinitely.
let handlingSessionExpiry = false;
onSessionExpired(() => {
  if (handlingSessionExpiry) return;
  handlingSessionExpiry = true;
  useAuthStore
    .getState()
    .logout()
    .finally(() => {
      handlingSessionExpiry = false;
      router.replace('/auth/login');
    });
});
