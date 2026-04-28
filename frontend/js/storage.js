const CART_KEY = "cart";
const WISHLIST_KEY = "wishlist";
const TOKEN_KEY = "token";
const USER_KEY = "user";

/* CART */
export const getCart = () => JSON.parse(localStorage.getItem(CART_KEY)) || [];
export const saveCart = (cart) => localStorage.setItem(CART_KEY, JSON.stringify(cart));

/* WISHLIST */
export const getWishlist = () => JSON.parse(localStorage.getItem(WISHLIST_KEY)) || [];
export const saveWishlist = (list) => localStorage.setItem(WISHLIST_KEY, JSON.stringify(list));

/* AUTH */
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const saveToken = (token) => localStorage.setItem(TOKEN_KEY, token);

export const getUser = () => JSON.parse(localStorage.getItem(USER_KEY));
export const saveUser = (user) => localStorage.setItem(USER_KEY, JSON.stringify(user));

export const clearAuth = () => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};