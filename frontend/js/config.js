// Frontend API configuration.
// Set `SAGONA_API_BASE` and `SAGONA_RAZORPAY_KEY_ID` in browser localStorage for production.
// Example:
// localStorage.setItem('SAGONA_API_BASE', 'https://your-render-backend.onrender.com/api');
// localStorage.setItem('SAGONA_RAZORPAY_KEY_ID', 'rzp_live_xxxxx');

const storedApiBase = window.localStorage.getItem('SAGONA_API_BASE');
const storedRazorpayKey = window.localStorage.getItem('SAGONA_RAZORPAY_KEY_ID');

const defaultApiBase = storedApiBase || (window.location.hostname.endsWith('sagona.in') ? `${window.location.protocol}//${window.location.host}/api` : 'http://localhost:5000/api');
const defaultRazorpayKey = storedRazorpayKey || '';

export const API_BASE = defaultApiBase;
export const RAZORPAY_KEY_ID = defaultRazorpayKey;
