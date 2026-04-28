/* =========================
   SAGONA CORE APP
========================= */

(function () {
  "use strict";

  window.SAGONA = {
    version: "2.0.0",
    API_URL: "https://sagona-backend-api.onrender.com/api"
  };

  /* STORAGE */
  window.safeStorage = {
    get(key, fallback = null) {
      try {
        const val = localStorage.getItem(key);
        return val ? JSON.parse(val) : fallback;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      localStorage.setItem(key, JSON.stringify(value));
    },
    remove(key) {
      localStorage.removeItem(key);
    }
  };

  /* UTILITIES */
  window.utils = {
    currency(n) {
      return `₹${Number(n || 0).toLocaleString("en-IN")}`;
    }
  };

  console.log("SAGONA READY");
})();