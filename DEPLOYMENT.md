# SAGONA Deployment Guide

## 1) Backend (Render)
- Root directory: `Backend`
- Build command: `npm install`
- Start command: `npm start`

Environment variables:
- `MONGO_URI`
- `JWT_SECRET`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `PORT` (optional; Render sets it automatically)

## 2) Frontend (Static Hosting / CDN)
- Upload `frontend/` as static site.
- If the frontend is hosted on the same domain as the backend, it will use same-origin `/api` automatically.
- If the frontend is hosted separately, configure the backend URL at runtime:
  - `localStorage.setItem('SAGONA_API_BASE', 'https://<your-backend-domain>/api')`
- The frontend fetches the Razorpay public key from the backend at `/api/payment/key`.

## 3) Git / VS Code workflow
- Open repository in VS Code.
- Pull latest branch commits.
- Push the branch to GitHub:
  - `git push origin <branch-name>`

