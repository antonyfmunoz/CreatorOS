import type { Product } from "@/types";

const CART_KEY = "creativesos.cart.v1";
export const CART_UPDATED_EVENT = "creativesos:cart-updated";

export type CartItem = Pick<Product, "id" | "title" | "price" | "category" | "imageUrl" | "payoutMode"> & { creatorId: number; creatorName: string };

function readCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(window.localStorage.getItem(CART_KEY) || "[]"); } catch { return []; }
}
function writeCart(items: CartItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(CART_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(CART_UPDATED_EVENT));
}
export const getCartItems = () => readCart();
export function addToCart(product: Product) {
  const items = readCart();
  if (items.some((item) => item.id === product.id)) return false;
  writeCart([...items, { id: product.id, title: product.title, price: product.price, category: product.category, imageUrl: product.imageUrl, payoutMode: product.payoutMode, creatorId: product.userId, creatorName: product.user.displayName }]);
  return true;
}
export const removeFromCart = (productId: number) => writeCart(readCart().filter((item) => item.id !== productId));
export const clearCart = () => writeCart([]);
export const cartTotal = (items = readCart()) => items.reduce((total, item) => total + item.price, 0);
