import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Package, ShoppingBag, Trash2 } from "lucide-react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useCart } from "@/hooks/use-cart";
import { type CartItem, cartTotal } from "@/lib/cart";
import { startStripeCheckout } from "@/lib/checkout";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { groupCartItemsForCheckout } from "@shared/cart";

function CartLine({ item, onRemove }: { item: CartItem; onRemove: () => void }) {
  return (
    <article className="flex gap-3 border-b border-zinc-800 py-4 last:border-0">
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-zinc-900">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <Package className="m-6 h-8 w-8 text-zinc-600" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">{item.category}</p>
        <h2 className="mt-1 truncate text-sm font-bold text-white">{item.title}</h2>
        <p className="mt-1 text-xs text-zinc-500">by {item.creatorName}</p>
        <div className="mt-3 flex items-center justify-between">
          <strong className="text-sm text-white">${item.price.toFixed(2)}</strong>
          <button onClick={onRemove} className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-500 hover:text-red-400" aria-label={`Remove ${item.title} from cart`}>
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </button>
        </div>
      </div>
    </article>
  );
}

export default function CartPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isDemoMode = import.meta.env.VITE_CREATOROS_DEMO_MODE === "true";
  const { items, isLoading, remove, clear } = useCart();
  const [checkingOutGroup, setCheckingOutGroup] = useState<string | null>(null);
  const [removingProductId, setRemovingProductId] = useState<number | null>(null);
  const [checkoutKey] = useState(() => crypto.randomUUID());
  const total = useMemo(() => cartTotal(items), [items]);
  const checkoutGroups = useMemo(() => groupCartItemsForCheckout(items), [items]);

  const removeItem = async (productId: number) => {
    setRemovingProductId(productId);
    try {
      await remove(productId);
    } catch (error) {
      toast({ title: "Could not remove offer", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setRemovingProductId(null);
    }
  };

  const checkout = async (group: (typeof checkoutGroups)[number]) => {
    setCheckingOutGroup(group.key);
    try {
      if (isDemoMode) {
        await Promise.all(group.items.map((item) => apiRequest("POST", `/api/products/${item.id}/demo-access`, {})));
        await Promise.all(group.items.map((item) => remove(item.id)));
        queryClient.invalidateQueries({ queryKey: ["/api/purchases"] });
        toast({ title: "Purchase complete", description: "Your new access is now in Purchases." });
        if (group.items.length === items.length) {
          await clear();
          setLocation("/marketplace");
        }
      } else {
        await startStripeCheckout(group.items.map((item) => item.id), `${checkoutKey}:${group.key}`);
      }
    } catch (error) {
      toast({ title: "Checkout could not complete", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setCheckingOutGroup(null);
    }
  };

  return (
    <main className="min-h-[calc(100dvh-3.5rem)] bg-black pb-24 text-white">
      <header className="flex h-16 items-center gap-2 border-b border-zinc-800 px-4">
        <Button variant="ghost" size="icon" className="-ml-2 rounded-full text-white hover:bg-zinc-900 hover:text-white" onClick={() => setLocation("/marketplace")} aria-label="Back to marketplace">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-bold">Your cart</h1>
      </header>

      {isLoading ? (
        <section className="px-4 py-20 text-center text-sm text-zinc-500">Loading your cart...</section>
      ) : items.length === 0 ? (
        <section className="mx-auto flex max-w-sm flex-col items-center px-6 py-24 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-900"><ShoppingBag className="h-7 w-7 text-zinc-400" /></span>
          <h2 className="mt-5 text-xl font-bold">Your cart is empty</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-500">Discover courses, communities, and digital assets made for your creative work.</p>
          <Button className="mt-6 rounded-xl bg-white text-black hover:bg-zinc-200" onClick={() => setLocation("/marketplace")}>Browse marketplace</Button>
        </section>
      ) : (
        <div className="space-y-5 px-4 py-5">
          {checkoutGroups.length > 1 && (
            <section className="rounded-2xl border border-[#1d9bf0]/30 bg-[#1d9bf0]/10 p-4">
              <h2 className="text-sm font-bold">Your cart has {checkoutGroups.length} secure checkouts</h2>
              <p className="mt-1 text-xs leading-5 text-zinc-400">Creator payouts and platform purchases are processed separately. Your remaining items stay in the cart.</p>
            </section>
          )}

          {checkoutGroups.map((group) => (
            <section key={group.key} className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
              <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">Secure checkout</p>
                  <h2 className="mt-0.5 text-sm font-bold">{group.label}</h2>
                </div>
                <span className="text-xs text-zinc-500">{group.items.length} item{group.items.length === 1 ? "" : "s"}</span>
              </div>
              <div className={removingProductId ? "pointer-events-none px-4 opacity-70" : "px-4"}>
                {group.items.map((item) => <CartLine key={item.id} item={item} onRemove={() => void removeItem(item.id)} />)}
              </div>
              <div className="border-t border-zinc-800 p-4">
                <div className="mb-3 flex items-center justify-between text-sm font-bold"><span>Group total</span><span>${group.total.toFixed(2)}</span></div>
                <Button className="h-11 w-full rounded-xl bg-white font-bold text-black hover:bg-zinc-200" disabled={checkingOutGroup !== null || removingProductId !== null} onClick={() => void checkout(group)}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {checkingOutGroup === group.key ? "Opening secure checkout..." : `Checkout ${group.label}`}
                </Button>
              </div>
            </section>
          ))}

          <section className="rounded-2xl border border-zinc-800 bg-black p-4">
            <div className="flex items-center justify-between text-sm text-zinc-400"><span>Cart total</span><strong className="text-lg text-white">${total.toFixed(2)}</strong></div>
            <p className="mt-2 text-xs leading-5 text-zinc-500">{isDemoMode ? "Demo checkout grants access immediately." : "Payments are securely processed by Stripe. Prices are revalidated by the server."}</p>
          </section>
        </div>
      )}
    </main>
  );
}
