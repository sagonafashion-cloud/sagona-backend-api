// Frontend API configuration.
// Set `SAGONA_API_BASE` in localStorage for production if the frontend is hosted separately from the API.
// Example:
// localStorage.setItem('SAGONA_API_BASE', 'https://your-render-backend.onrender.com/api');

const storedApiBase = window.localStorage.getItem('SAGONA_API_BASE');

const API_BASE = storedApiBase || (window.location.hostname === 'sagona.in'
    ? 'https://sagona-backend-api.onrender.com/api'
    : (window.location.hostname.endsWith('sagona.in') ? `${window.location.protocol}//${window.location.host}/api` : 'http://localhost:5000/api'));

export { API_BASE };
