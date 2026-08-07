import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock3, ShoppingBag } from "lucide-react";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { useCart } from "@/hooks/use-cart";

type CheckoutStatus = { orderId: string; status: string; totalAmount: number; currency: string };

export default function CheckoutSuccessPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const queryClient = useQueryClient();
  const { clear: clearCart } = useCart();
  const sessionId = new URLSearchParams(search).get("session_id");
  const checkout = useQuery<CheckoutStatus>({
    queryKey: ["/api/checkout/sessions", sessionId],
    enabled: Boolean(sessionId),
    queryFn: async () => {
      const response = await fetch(`/api/checkout/sessions/${encodeURIComponent(sessionId!)}`, { credentials: "include" });
      if (!response.ok) throw new Error("Unable to confirm your payment");
      return response.json();
    },
    refetchInterval: (query) => query.state.data?.status === "paid" ? false : 2_000,
    retry: 2,
  });

  useEffect(() => {
    if (checkout.data?.status !== "paid") return;
    void clearCart();
    void queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    void queryClient.invalidateQueries({ queryKey: ["/api/purchases"] });
  }, [checkout.data?.status, clearCart, queryClient]);

  if (!sessionId) return <main className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center bg-black p-6 text-center text-white"><section><h1 className="text-xl font-bold">Checkout session not found</h1><Button className="mt-5 bg-white text-black hover:bg-zinc-200" onClick={() => setLocation("/cart")}>Return to cart</Button></section></main>;

  const paid = checkout.data?.status === "paid";
  return <main className="flex min-h-[calc(100dvh-3.5rem)] items-center justify-center bg-black p-6 text-center text-white"><section className="max-w-sm"><span className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${paid ? "bg-emerald-500 text-black" : "bg-zinc-900 text-zinc-300"}`}>{paid ? <CheckCircle2 className="h-8 w-8" /> : <Clock3 className="h-8 w-8" />}</span><h1 className="mt-6 text-2xl font-bold">{paid ? "Payment complete" : "Confirming your payment"}</h1><p className="mt-3 text-sm leading-6 text-zinc-400">{paid ? "Your purchase is ready in your library." : checkout.isError ? "We could not confirm this payment yet. Your order is preserved while we retry." : "Stripe is securely confirming your payment. This normally takes a moment."}</p><div className="mt-7 flex flex-col gap-3"><Button className="h-11 rounded-xl bg-white font-bold text-black hover:bg-zinc-200" onClick={() => setLocation(paid ? "/learn" : "/orders")}><ShoppingBag className="mr-2 h-4 w-4" /> {paid ? "Open my library" : "View my orders"}</Button>{!paid && <Button variant="secondary" className="rounded-xl border border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800" onClick={() => setLocation("/marketplace")}>Continue browsing</Button>}</div></section></main>;
}
