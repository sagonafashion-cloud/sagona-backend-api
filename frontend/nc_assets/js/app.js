/* =========================================
   SAGONA – GLOBAL APP BOOTSTRAP
========================================= */

(function () {
  "use strict";

  /* =========================
     GLOBAL CONFIG
  ========================= */
  window.SAGONA = {
    version: "2.0.0",
    env: "production",

    storageKeys: {
      cart: "cart",
      wishlist: "wishlist",
      orders: "orders",
      loyalty: "loyaltyPoints",
      returns: "returnRequests"
    }
  };

  /* =========================
     SAFE LOCAL STORAGE
  ========================= */
  window.safeStorage = {
    get(key, fallback = []) {
      try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : fallback;
      } catch {
        console.warn("Storage read error:", key);
        return fallback;
      }
    },

    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        console.warn("Storage write error:", key);
      }
    },

    remove(key) {
      try {
        localStorage.removeItem(key);
      } catch {
        console.warn("Storage remove error:", key);
      }
    }
  };

  /* =========================
     UTILITIES
  ========================= */
  window.utils = {
    currency(amount) {
      return `₹${Number(amount || 0).toLocaleString("en-IN")}`;
    },

    uid(prefix = "ID") {
      return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    },

    nowISO() {
      return new Date().toISOString();
    }
  };

  /* =========================
     PAGE DETECTION
  ========================= */
  window.currentPage = document.body.dataset.page || "";

  /* =========================
     GLOBAL INIT
  ========================= */
  document.addEventListener("DOMContentLoaded", () => {
    console.log(`SAGONA v${window.SAGONA.version} loaded`);

    // Optional hooks (only run if defined)
    window.initCart?.();
    window.initWishlist?.();
    window.initCheckout?.();
    window.initReturns?.();
  });

})();