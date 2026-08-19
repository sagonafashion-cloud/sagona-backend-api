import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { emitSessionExpired } from './authEvents';

export const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'https://sagona-backend-api.onrender.com/api';

// Mirrors frontend/nc_assets/js/api.js's handleSessionExpired gating: these
// endpoints are hit while logged out (or to log in), so a 401 from them is a
// normal "wrong credentials" response, never a session-expiry.
const AUTH_ENDPOINTS_EXCLUDED_FROM_SESSION_EXPIRY = ['/auth/login', '/auth/register'];

const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    // A 401 only means "session expired" when the request actually carried
    // an Authorization header (i.e. we had a token and the backend rejected
    // it as expired/invalid) — same rule the website's request() helper uses
    // (frontend/nc_assets/js/api.js: `res.status === 401 && token`). A failed
    // login (wrong password on /auth/login) has no Authorization header
    // attached, since there is no token yet, so it's excluded by that check
    // alone; the explicit path exclusion below is an extra safety net.
    const hadAuthHeader = !!err.config?.headers?.Authorization;
    const url: string = err.config?.url ?? '';
    const isExcludedAuthEndpoint = AUTH_ENDPOINTS_EXCLUDED_FROM_SESSION_EXPIRY.some((p) => url.includes(p));
    if (err.response?.status === 401 && hadAuthHeader && !isExcludedAuthEndpoint) {
      emitSessionExpired();
    }
    const message = err.response?.data?.message ?? err.message ?? 'Network error';
    return Promise.reject(new Error(message));
  }
);

export default api;
