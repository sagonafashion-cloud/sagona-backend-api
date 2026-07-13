// SAFE — only public values. No secrets. No private keys.
// The Razorpay Key SECRET must never appear here — it lives only on the backend.

const hostname   = window.location.hostname.toLowerCase();
const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

export const API_BASE = isLocalhost
  ? 'http://localhost:5000/api'
  : 'https://sagona-backend-api.onrender.com/api';

// Razorpay KEY ID is public by design — safe in frontend.
// Update this value after regenerating your key pair in Step 1 of the security checklist.
export const RAZORPAY_KEY_ID = 'rzp_live_SnTOdSqnhxjlWr';

export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

export async function fetchPincodeData(pincode, cityFieldId, stateFieldId, statusElementId) {
  const statusEl = statusElementId ? document.getElementById(statusElementId) : null;

  if (!/^\d{6}$/.test(pincode)) {
    if (statusEl) { statusEl.textContent = 'Enter a valid 6-digit pincode'; statusEl.style.color = '#EF9F27'; }
    return null;
  }

  if (statusEl) { statusEl.textContent = 'Looking up…'; statusEl.style.color = '#888'; }

  try {
    const res  = await fetch(`${API_BASE}/delivery/pincode/${pincode}`);
    const json = await res.json();

    if (json.success && json.data?.city) {
      const cityEl  = cityFieldId  ? document.getElementById(cityFieldId)  : null;
      const stateEl = stateFieldId ? document.getElementById(stateFieldId) : null;
      if (cityEl)  cityEl.value  = json.data.city;
      if (stateEl) stateEl.value = json.data.state;

      if (statusEl) {
        statusEl.textContent = `${json.data.city}, ${json.data.state} — you can edit if needed`;
        statusEl.style.color = '#1D9E75';
      }
      return json.data;
    } else {
      if (statusEl) {
        statusEl.textContent = 'Pincode not found — please fill city and state manually';
        statusEl.style.color = '#EF9F27';
      }
      return null;
    }
  } catch (err) {
    console.error('Pincode lookup error:', err);
    if (statusEl) {
      statusEl.textContent = 'Could not look up — please fill manually';
      statusEl.style.color = '#EF9F27';
    }
    return null;
  }
}