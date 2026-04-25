export const getJSON = (key, fallback = null) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};

export const setJSON = (key, value) => localStorage.setItem(key, JSON.stringify(value));

export const getCart = () => getJSON('cart', []);
export const saveCart = (cart) => setJSON('cart', cart);

export const getWishlist = () => getJSON('wishlist', []);
export const saveWishlist = (wishlist) => setJSON('wishlist', wishlist);

export const getAuth = () => getJSON('auth', null);
export const saveAuth = (auth) => setJSON('auth', auth);
export const clearAuth = () => localStorage.removeItem('auth');
