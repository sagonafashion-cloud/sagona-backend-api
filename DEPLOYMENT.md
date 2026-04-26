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
<<<<<<< ours
<<<<<<< ours
- If your host serves the repository root instead of `frontend/`, root-level compatibility files are provided (`styles.css`, `favicon.ico`, and `js/*.js`) that proxy to `frontend/*` assets.
=======
=======
>>>>>>> theirs
- Standard frontend asset paths are now:
  - CSS: `styles.css`
  - JS entry files: `js/*.js`
- Do not mix `style.css` and `styles.css`; production pages should reference only `styles.css`.
<<<<<<< ours
>>>>>>> theirs
=======
>>>>>>> theirs
- By default, production frontend uses `https://sagona-backend-api.onrender.com/api`.
- If the frontend is hosted on the same domain as the backend and you proxy `/api`, enable same-origin mode:
  - `localStorage.setItem('SAGONA_USE_SAME_ORIGIN_API', 'true')`
- Or configure any backend URL at runtime:
  - `localStorage.setItem('SAGONA_API_BASE', 'https://<your-backend-domain>/api')`
- The frontend fetches the Razorpay public key from the backend at `/api/payment/key`.

## 3) Git / VS Code workflow
- Open repository in VS Code.
- Pull latest branch commits.
- Push the branch to GitHub:
  - `git push origin <branch-name>`
