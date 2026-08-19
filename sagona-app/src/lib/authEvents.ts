// Tiny module-level event emitter used to signal a session-expiry (a 401
// received on a request that carried an Authorization header, i.e. an
// expired/invalid token) from api.ts up to authStore.ts.
//
// This exists purely to avoid a circular import: authStore.ts imports api.ts
// (to make authenticated requests), so api.ts cannot import authStore.ts back
// to call `logout()` directly. Instead, api.ts emits an event here (which has
// zero dependency on the store) and authStore.ts subscribes to it.
type Listener = () => void;

const listeners = new Set<Listener>();

export function onSessionExpired(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitSessionExpired(): void {
  listeners.forEach((listener) => listener());
}
