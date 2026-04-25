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
- Configure API URL at runtime from browser console/localStorage:
  - `localStorage.setItem('SAGONA_API_BASE', 'https://<your-backend-domain>/api')`
  - `localStorage.setItem('SAGONA_RAZORPAY_KEY_ID', '<your_razorpay_key_id>')`

## 3) Git / VS Code workflow
- Open repository in VS Code.
- Pull latest branch commits.
- Push the branch to GitHub:
  - `git push origin <branch-name>`

