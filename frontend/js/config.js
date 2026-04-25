// Production URLs (update these with your actual services)
const PRODUCTION_API = 'https://sagona-backend.onrender.com/api'; // Replace with your Render backend URL
const PRODUCTION_RAZORPAY_KEY = 'rzp_live_xxxxx'; // Replace with your actual Razorpay key

export const API_BASE = window.localStorage.getItem('SAGONA_API_BASE') || PRODUCTION_API;
export const RAZORPAY_KEY_ID = window.localStorage.getItem('SAGONA_RAZORPAY_KEY_ID') || PRODUCTION_RAZORPAY_KEY;
