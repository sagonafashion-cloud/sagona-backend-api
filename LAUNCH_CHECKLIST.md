# SAGONA — Launch Checklist
Run through every item before announcing the app launch.

---

## Backend

- [ ] All env vars set in Render dashboard (no placeholder values remaining)
- [ ] `CORS_ORIGINS` restricted to production domains only — remove `exp://` before final lock-down
- [ ] Rate limiting active on all routes (auth: 10/15min, admin: 50/15min, chat: 30/hr, api: 100/15min)
- [ ] Helmet CSP configured and tested (no console errors on any page)
- [ ] MongoDB Atlas IP whitelist: `0.0.0.0/0` for Render, or add Render's static outbound IP
- [ ] `GET /api/health` returning `{"status":"ok","db":"connected"}`
- [ ] UptimeRobot monitor active on `https://sagona-backend-api.onrender.com/api/health`
- [ ] UptimeRobot monitor active on `https://sagona.in`
- [ ] Sentry project created, `SENTRY_DSN` set in Render dashboard, test error captured
- [ ] Razorpay: test key payment flow verified end-to-end → switch to **live keys**
- [ ] Razorpay webhook secret set in both Razorpay dashboard and `RAZORPAY_WEBHOOK_SECRET` env var
- [ ] Invoice PDF generated and emailed on order success (test with real order)
- [ ] JWT secrets are strong random strings (not the placeholder values from `.env.example`)

---

## Frontend (Web — sagona.in)

- [ ] Meta description on every page (check with Chrome DevTools → Elements → head)
- [ ] Product structured data injecting correctly — test with [Google Rich Results Test](https://search.google.com/test/rich-results)
- [ ] `YOUR_CLOUD_NAME` replaced with real Cloudinary cloud name in all OG image URLs
- [ ] `G-XXXXXXXXXX` replaced with real GA4 Measurement ID in all HTML pages
- [ ] GA4 events firing — check Realtime report in GA4 while browsing shop + checkout
- [ ] Sitemap submitted to Google Search Console: `https://sagona-backend-api.onrender.com/sitemap.xml`
- [ ] `<meta name="google-site-verification">` tag added to `index.html` after GSC verification
- [ ] WhatsApp number `919999999999` replaced with real SAGONA WhatsApp Business number in all pages
- [ ] WhatsApp FAB visible and working on all pages
- [ ] `privacy.html` live and accessible
- [ ] `support.html` live and accessible — contact form sends email and auto-reply
- [ ] Cart → checkout → payment (COD + Razorpay) flow tested end-to-end on mobile Chrome
- [ ] GST calculation correct: intra-state (CGST+SGST) and inter-state (IGST) orders
- [ ] All pages tested on mobile (375px width minimum)
- [ ] App Store / Play Store privacy policy URL resolves: `https://sagona.in/privacy.html`
- [ ] App Store / Play Store support URL resolves: `https://sagona.in/support.html`

---

## Mobile App

- [ ] `YOUR_EAS_PROJECT_ID` in `app.json` replaced with real EAS project ID (run `eas init`)
- [ ] `sagona-app/.env` file created with real `EXPO_PUBLIC_API_URL`
- [ ] `sagona-app/.env` file created with real `EXPO_PUBLIC_SENTRY_DSN`
- [ ] Sentry mobile project created, DSN set, test crash captured
- [ ] Preview APK built and installed on real Android device
- [ ] Razorpay payment working in preview build (not just Expo Go — requires native build)
- [ ] Push notification received on test Android device after order status update
- [ ] Biometric login (fingerprint / Face ID) working on test device
- [ ] All 5 tabs tested: Home, Shop, Product detail, Bag, Account, SAGi Chat
- [ ] SAGi chat SSE streaming working (messages appear word by word)
- [ ] Offline: app does not crash when network is unavailable
- [ ] App icon and splash screen correct on device (not placeholder)
- [ ] `google-play-key.json` service account created in Google Play Console
- [ ] Production AAB built: `eas build --platform android --profile production`
- [ ] Play Store internal testing track submitted and approved
- [ ] Apple Developer account enrolled (if doing iOS)
- [ ] Production IPA built: `eas build --platform ios --profile production`
- [ ] TestFlight internal testing submitted and approved

---

## Admin Panel

- [ ] Super Admin login working with TOTP 2FA
- [ ] `store_manager` role cannot access admin users section (RBAC check)
- [ ] Product upload with images working end-to-end (Cloudinary upload confirmed)
- [ ] GST report downloading correct figures for a test date range
- [ ] Order status update → notification email received by customer
- [ ] Admin chatbot responding to "what were sales this week?"
- [ ] Activity log recording admin actions (check MongoDB `activitylogs` collection)

---

## Final

- [ ] All team members have been briefed on the WhatsApp support number to expect messages
- [ ] DNS TTL lowered 48 hours before launch for faster propagation
- [ ] Render service scaled up from free tier if expecting launch traffic spike
- [ ] Announcement prepared: Instagram, WhatsApp broadcast, email to waitlist

---

*Last updated: May 2026*
