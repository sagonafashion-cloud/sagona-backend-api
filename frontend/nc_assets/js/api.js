// api.js
import { API_BASE } from './config.js';
import { clearAuth } from './storage.js';

const BASE_URL = API_BASE;

// Only bare same-site page names are ever written into the redirect target —
// never the raw current URL — so this can't become an open-redirect vector.
const SAFE_NEXT_RE = /^[a-zA-Z0-9_-]+\.html$/;

// Centralised handling for an expired/invalid JWT (a 401 on a request that
// carried a token). This happens whenever the backend's JWT secret is
// rotated and a client is still holding a token signed with the old one.
// Instead of surfacing a raw "Invalid token" error, clear the stale session
// and send the user back to sign in, then return them to what they were
// doing.
export function handleSessionExpired() {
  clearAuth();
  const current = location.pathname.split('/').pop() || 'index.html';
  const next = SAFE_NEXT_RE.test(current) ? current : 'index.html';
  try {
    sessionStorage.setItem('loginMessage', 'Your session has expired. Please sign in again.');
  } catch { /* sessionStorage unavailable (e.g. private mode) — non-fatal */ }
  location.href = `login.html?next=${encodeURIComponent(next)}`;
}

export async function request(path, options = {}) {
  try {
    const token = localStorage.getItem("token");

    const res = await fetch(`${BASE_URL}${path}`, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
        ...(options.headers || {})
      },
      body: options.body || undefined
    });

    // Handle non-JSON safely
    const contentType = res.headers.get("content-type");
    const data = contentType?.includes("application/json")
      ? await res.json()
      : await res.text();

    if (!res.ok) {
      // A 401 only means "session expired" when we actually sent a token —
      // public endpoints like /auth/login return 401 for wrong credentials
      // with no token attached, and that should surface normally below.
      if (res.status === 401 && token) {
        handleSessionExpired();
        const expiredErr = new Error(data?.message || 'Session expired');
        expiredErr.sessionExpired = true;
        throw expiredErr;
      }
      console.error("API ERROR:", data);
      throw new Error(data?.message || "Something went wrong");
    }

    return data;

  } catch (err) {
    console.error("REQUEST FAILED:", err.message);
    throw err;
  }
}