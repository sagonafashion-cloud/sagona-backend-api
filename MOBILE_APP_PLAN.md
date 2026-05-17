# SAGONA Mobile App Plan
**Phase 8 · Strategy & Architecture Document**

---

## Executive Summary

SAGONA's backend API (built in Phases 1–7) is already mobile-ready: JWT auth, paginated REST endpoints, Razorpay payments, Cloudinary images, and SSE chat all work from any HTTP client. The mobile app consumes these APIs directly — no new backend work is required to launch v1.

**Recommendation: React Native + Expo (managed workflow)**

This gives iOS + Android from a single codebase, over-the-air (OTA) updates without app-store review cycles, and the fastest path to production for a small team.

---

## Technology Stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | **React Native 0.74 + Expo SDK 51** | Single codebase, large ecosystem, OTA updates |
| Navigation | **Expo Router (file-based)** | Same mental model as Next.js; deep linking built-in |
| State | **Zustand** | Lightweight, no boilerplate, works without Redux |
| Data fetching | **TanStack Query (React Query)** | Caching, pagination, background refresh |
| Styling | **StyleSheet API + Tamagui** | Native performance; Tamagui shares tokens with the web design system |
| Payments | **Razorpay React Native SDK** | Drop-in checkout sheet, same keys as the web |
| Push notifications | **Expo Notifications + FCM/APNs** | Unified API, no separate push server needed |
| Image handling | **Expo Image** | Disk caching, blur-hash placeholders |
| Auth | **Expo SecureStore** | Encrypted JWT storage (replaces localStorage) |
| Chat (SSE) | **EventSource polyfill** | React Native lacks native EventSource; polyfill covers it |
| Analytics | **PostHog (self-hostable)** | Event tracking, funnel analysis, feature flags |
| CI/CD | **EAS Build + EAS Submit** | Cloud builds, automated App Store / Play Store submission |

---

## Architecture

```
┌─────────────────────────────────────────────┐
│               Expo App (RN)                 │
│                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │  Screens │  │  Stores  │  │  Hooks   │  │
│  │ (Router) │  │ (Zustand)│  │ (Query)  │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  │
│       └─────────────┴─────────────┘         │
│                     │                       │
│            ┌────────▼────────┐              │
│            │   API Client    │              │
│            │ (Axios / fetch) │              │
│            └────────┬────────┘              │
└─────────────────────┼───────────────────────┘
                      │ HTTPS
          ┌───────────▼───────────┐
          │  SAGONA Backend API   │
          │  sagona-backend-api   │
          │       .onrender.com   │
          └───────────────────────┘
```

### Shared API Client (`src/lib/api.ts`)
```ts
const api = axios.create({ baseURL: process.env.EXPO_PUBLIC_API_URL });

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```

No backend changes needed — same endpoints, same JWT, same response format.

---

## Screen Inventory

### Auth Stack
| Screen | Route | API |
|---|---|---|
| Splash / Onboarding | `/` | — |
| Login | `/auth/login` | `POST /api/auth/login` |
| Register | `/auth/register` | `POST /api/auth/register` |
| Forgot Password | `/auth/forgot` | `POST /api/auth/forgot-password` |
| OTP Verify | `/auth/otp` | `POST /api/auth/reset-password` |

### Customer App (Tab Navigator)
| Tab | Route | Key Screens |
|---|---|---|
| **Home** | `/(tabs)/` | Full-bleed hero, category grid, new arrivals |
| **Shop** | `/(tabs)/shop` | Product grid + filter sheet |
| **Bag** | `/(tabs)/bag` | Cart with qty controls, GST breakup |
| **Account** | `/(tabs)/account` | Profile, orders, wishlist, loyalty points |

### Detail Screens
| Screen | Route | API |
|---|---|---|
| Product Detail | `/product/[id]` | `GET /api/products/:id` |
| Checkout | `/checkout` | `POST /api/orders`, Razorpay SDK |
| Order Success | `/order-success` | — |
| Order Detail | `/orders/[id]` | `GET /api/orders/:id` |
| Order Tracking | `/orders/[id]/track` | `GET /api/orders/:id` (shipments[]) |
| Wishlist | `/wishlist` | `GET /api/products` (filter by wishlist IDs) |
| Pincode Check | `/delivery-check` | `POST /api/delivery/check` |
| SAGi Chat | `/chat` | `POST /api/chat` (SSE stream) |
| Store Locator | `/stores` | `GET /api/stores` + MapView |

---

## Feature Parity with Web

| Feature | Web | Mobile | Notes |
|---|---|---|---|
| Browse & search products | ✓ | ✓ | Infinite scroll via TanStack Query |
| Product gallery | ✓ | ✓ | Swipeable image carousel |
| Size selector | ✓ | ✓ | Bottom sheet picker |
| Add to cart | ✓ | ✓ | Persisted in Zustand + AsyncStorage |
| Wishlist | ✓ | ✓ | Synced to backend when logged in |
| Guest checkout | ✓ | Partial | Cart works; checkout requires login |
| COD + Razorpay | ✓ | ✓ | `razorpay-react-native` SDK |
| GST breakup | ✓ | ✓ | Same calculation logic |
| Order tracking | ✓ | ✓ | Pull-to-refresh |
| SAGi chatbot | ✓ | ✓ | SSE via EventSource polyfill |
| Password reset (OTP) | ✓ | ✓ | |
| Loyalty points | ✓ | ✓ | Displayed on account screen |
| Store locator | — | ✓ | MapView with store pins (mobile-first) |
| Push notifications | — | ✓ | Order status updates |
| Biometric login | — | ✓ | FaceID/Fingerprint via `expo-local-authentication` |

---

## Push Notifications

Push notifications are the biggest mobile-exclusive feature. Implement in two parts:

### Backend (new, post-Phase 8)
1. Add `expoPushToken` field to `User` model.
2. Add `PATCH /api/auth/push-token` endpoint (saves token on login/app open).
3. In `orderController.updateOrder`, after saving status, call Expo Push API:

```js
import Expo from 'expo-server-sdk';
const expo = new Expo();

// fire-and-forget, non-blocking
expo.sendPushNotificationsAsync([{
  to:    user.expoPushToken,
  title: `Order ${order.orderNumber}`,
  body:  `Status updated: ${normalised}`,
  data:  { orderId: order._id }
}]).catch(console.error);
```

### Mobile
```ts
const { status } = await Notifications.requestPermissionsAsync();
const token = (await Notifications.getExpoPushTokenAsync()).data;
await api.patch('/auth/push-token', { expoPushToken: token });
```

---

## Razorpay Integration

Razorpay's React Native SDK wraps the native checkout sheet — same look as web.

```ts
import RazorpayCheckout from 'react-native-razorpay';

const options = {
  key:         RZP_KEY,
  amount:      grandTotal * 100,
  currency:    'INR',
  order_id:    rzpOrderId,       // from POST /api/payment/create-order
  name:        'SAGONA',
  description: 'Premium Kidswear',
  prefill:     { name: user.name, email: user.email, contact: user.phone },
  theme:       { color: '#C9A84C' }
};

const payment = await RazorpayCheckout.open(options);
// On success → POST /api/payment/verify with signature
```

---

## SAGi Chatbot (SSE on Mobile)

React Native's `fetch` supports streaming since RN 0.72. Use the same approach as the web chatbot:

```ts
import EventSource from 'react-native-sse';

const es = new EventSource(`${API_BASE}/chat`, {
  method:  'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body:    JSON.stringify({ message, sessionId })
});

es.addEventListener('message', (e) => {
  const data = JSON.parse(e.data);
  if (data.type === 'text') appendToMessage(data.content);
  if (data.type === 'done') es.close();
});
```

The `sessionId` is stored in SecureStore so conversation history persists across app sessions.

---

## Store Locator (Mobile-first Feature)

```tsx
import MapView, { Marker } from 'react-native-maps';

// GET /api/stores → render pins on map
// On pin tap → show store card (name, hours, GSTIN, phone)
// "Get Directions" → opens native Maps app via Linking.openURL
```

---

## Design System Tokens

The SAGONA color palette is already defined. Extract shared tokens to a `tokens.ts` file used by both the Expo app and (optionally) the web:

```ts
export const tokens = {
  gold:      '#C9A84C',
  goldDark:  '#b8943e',
  black:     '#0A0A0A',
  gray:      '#555550',
  lightGray: '#999990',
  light:     '#F8F6F3',
  border:    '#E8E5E0',
  white:     '#ffffff',
} as const;
```

Typography: `Playfair Display` (headings) + `Inter` (body) — load via `expo-google-fonts`.

---

## App Store Preparation

| Item | Details |
|---|---|
| Bundle ID (iOS) | `in.sagona.app` |
| Package name (Android) | `in.sagona.app` |
| Privacy policy URL | `https://sagona.in/privacy.html` |
| Support URL | `https://sagona.in` / `care@sagona.in` |
| Age rating | 4+ (no age-restricted content) |
| App category | Shopping |
| Screenshots needed | 6.7" iPhone, 12.9" iPad, Pixel 8 Pro |
| App icon | 1024×1024 (use existing SAGONA brand mark on black) |

---

## Implementation Roadmap

### Sprint 1 — Foundation (2 weeks)
- Expo project setup (TypeScript, Expo Router, EAS config)
- Design system tokens + base components (Button, Text, Input, Card)
- Auth flow (Login, Register, OTP reset)
- API client with SecureStore token management

### Sprint 2 — Core Shopping (2 weeks)
- Home screen (hero banner, category grid, featured products)
- Shop screen (product grid, filter bottom sheet, search)
- Product detail (image gallery, size selector, add to bag)
- Cart with GST breakup

### Sprint 3 — Checkout & Orders (2 weeks)
- Checkout form (address, pincode check, payment selection)
- Razorpay integration (COD + online)
- Order success screen
- Order history + order detail + status tracking

### Sprint 4 — Account & Wishlist (1 week)
- Account screen (profile, loyalty points, birthday)
- Wishlist (sync with backend)
- Delivery checker
- Stores locator (MapView)

### Sprint 5 — Engagement Features (2 weeks)
- SAGi chat (SSE streaming, session persistence)
- Push notification permissions + token registration
- Biometric login
- Deep links (product URLs, order links from email)

### Sprint 6 — Polish & Launch (1 week)
- App icon, splash screen, onboarding slides
- Accessibility audit (VoiceOver / TalkBack)
- Performance audit (Flashlist for large grids, image lazy loading)
- EAS Build + TestFlight / Internal testing
- App Store + Play Store submission

**Total estimated duration: 10 weeks with 1–2 mobile engineers**

---

## Estimated Effort

| Area | Frontend (days) | Backend (days) |
|---|---|---|
| Auth + navigation | 5 | 1 (push token endpoint) |
| Browse + search | 6 | 0 |
| Product detail | 4 | 0 |
| Cart + checkout | 8 | 0 |
| Orders + tracking | 5 | 0 |
| Account + wishlist | 4 | 0 |
| SAGi chat | 4 | 0 |
| Push notifications | 4 | 2 |
| Store locator | 3 | 0 |
| Polish + release | 5 | 0 |
| **Total** | **48 days** | **3 days** |

The backend-to-mobile ratio is extremely favourable because Phases 1–7 already built production-ready APIs.

---

## What the Backend Needs (Post-Phase 8)

Only 3 small additions are required before launching the mobile app:

1. **`PATCH /api/auth/push-token`** — store Expo push token on User document
2. **Push notification dispatch** — in `orderController.updateOrder` after each status change
3. **CORS update** — ensure `process.env.CORS_ORIGINS` includes any custom scheme used for deep links (e.g., `sagona://`)

Everything else — products, orders, payments, GST, chat, delivery check, analytics — works as-is.

---

*Document prepared as part of SAGONA platform build · Phase 8 · May 2026*
