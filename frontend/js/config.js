// Frontend API configuration.
// Set `SAGONA_API_BASE` in localStorage for production if the frontend is hosted separately from the API.
// Example:
// localStorage.setItem('SAGONA_API_BASE', 'https://your-render-backend.onrender.com/api');

const storedApiBase = window.localStorage.getItem('SAGONA_API_BASE');
const hostname = window.location.hostname.toLowerCase();
const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
const useSameOriginApi = window.localStorage.getItem('SAGONA_USE_SAME_ORIGIN_API') === 'true';

const API_BASE = storedApiBase
    || (isLocalhost
        ? 'http://localhost:5000/api'
        : (useSameOriginApi
            ? `${window.location.protocol}//${window.location.host}/api`
            : 'https://sagona-backend-api.onrender.com/api'));

export { API_BASE };
