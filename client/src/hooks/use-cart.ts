import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Product } from "@/types";
import { useAuth } from "@/hooks/use-auth";
import {
  CART_UPDATED_EVENT,
  type CartItem,
  addToCart,
  clearCart as clearGuestCart,
  getCartItems,
  removeFromCart,
} from "@/lib/cart";
import { apiRequest, queryClient } from "@/lib/queryClient";

const ACCOUNT_CART_QUERY_KEY = ["/api/cart"] as const;

type AddCartResponse = { added: boolean; items: CartItem[] };

export function useCart() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const isDemoMode = import.meta.env.VITE_CREATOROS_DEMO_MODE === "true";
  const usesAccountCart = Boolean(user) && !isDemoMode;
  const [guestItems, setGuestItems] = useState<CartItem[]>(getCartItems);

  useEffect(() => {
    const refresh = () => setGuestItems(getCartItems());
    window.addEventListener(CART_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(CART_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const accountCart = useQuery<CartItem[]>({
    queryKey: ACCOUNT_CART_QUERY_KEY,
    enabled: usesAccountCart,
    queryFn: async () => {
      const guestProductIds = getCartItems().map((item) => item.id);
      const response = guestProductIds.length
        ? await apiRequest("POST", "/api/cart/merge", {
            productIds: guestProductIds,
          })
        : await apiRequest("GET", "/api/cart");
      const items = (await response.json()) as CartItem[];
      if (guestProductIds.length) clearGuestCart();
      return items;
    },
  });

  const add = useCallback(
    async (product: Product) => {
      if (!usesAccountCart) return addToCart(product);
      const response = await apiRequest("POST", "/api/cart/items", {
        productId: product.id,
      });
      const result = (await response.json()) as AddCartResponse;
      queryClient.setQueryData(ACCOUNT_CART_QUERY_KEY, result.items);
      return result.added;
    },
    [usesAccountCart],
  );

  const remove = useCallback(
    async (productId: number) => {
      if (!usesAccountCart) {
        removeFromCart(productId);
        return;
      }
      await apiRequest("DELETE", `/api/cart/items/${productId}`);
      queryClient.setQueryData<CartItem[]>(ACCOUNT_CART_QUERY_KEY, (items = []) =>
        items.filter((item) => item.id !== productId),
      );
    },
    [usesAccountCart],
  );

  const clear = useCallback(async () => {
    if (!usesAccountCart) {
      clearGuestCart();
      return;
    }
    await apiRequest("DELETE", "/api/cart");
    queryClient.setQueryData(ACCOUNT_CART_QUERY_KEY, []);
  }, [usesAccountCart]);

  return {
    items: usesAccountCart ? accountCart.data ?? [] : guestItems,
    isLoading:
      isAuthLoading || (usesAccountCart && accountCart.isLoading),
    error: accountCart.error,
    add,
    remove,
    clear,
  };
}
