/* =====================================================
   SAGONA – APP BOOTSTRAP (Frontend)
   Safe for Static Hosting + Backend Ready
===================================================== */

(function () {
    "use strict";

    /* =========================
       GLOBAL CONFIG
    ========================= */

    window.SAGONA = {
        version: "1.0.0",
        env: "production", // dev | staging | production

        storageKeys: {
            cart: "cart",
            wishlist: "wishlist",
            orders: "previousOrders",
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
                return JSON.parse(localStorage.getItem(key)) || fallback;
            } catch (e) {
                console.warn("Storage read failed:", key);
                return fallback;
            }
        },

        set(key, value) {
            try {
                localStorage.setItem(key, JSON.stringify(value));
            } catch (e) {
                console.warn("Storage write failed:", key);
            }
        },

        remove(key) {
            localStorage.removeItem(key);
        }
    };

    /* =========================
       BASIC UTILITIES
    ========================= */

    window.utils = {
        formatCurrency(amount) {
            return `₹${Number(amount).toLocaleString("en-IN")}`;
        },

        generateId(prefix = "ID") {
            return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        },

        todayISO() {
            return new Date().toISOString();
        }
    };

    /* =========================
       PAGE DETECTION
    ========================= */

    window.currentPage = document.body.dataset.page || "";

    /* =========================
       INIT HANDLER
    ========================= */

    document.addEventListener("DOMContentLoaded", () => {
        console.log(`SAGONA App Loaded – v${SAGONA.version}`);

        // Auto hooks for future modules
        if (window.initCart) window.initCart();
        if (window.initWishlist) window.initWishlist();
        if (window.initCheckout) window.initCheckout();
        if (window.initReturns) window.initReturns();
    });

})();
