const storedApiBase = window.localStorage.getItem('SAGONA_API_BASE');

const hostname = window.location.hostname.toLowerCase();
const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

const useSameOriginApi =
    window.localStorage.getItem('SAGONA_USE_SAME_ORIGIN_API') === 'true';

export const API_BASE =
    storedApiBase ||
    (isLocalhost
        ? 'http://localhost:5000/api'
        : useSameOriginApi
            ? `${window.location.protocol}//${window.location.host}/api`
            : 'https://sagona-backend-api.onrender.com/api');