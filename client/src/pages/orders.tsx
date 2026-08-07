import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, CreditCard, PackageCheck, ReceiptText, ShoppingBag, Store } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";
import { resumeStripeCheckout } from "@/lib/checkout";
import { useToast } from "@/hooks/use-toast";

type OrderItem = { id: string; titleSnapshot: string; unitAmount: number; quantity: number };
type Buyer = { id: number; username: string; displayName: string };
type Order = { id: string; status: string; currency: string; totalAmount: number; paymentProvider: string | null; createdAt: string; items: OrderItem[]; buyer?: Buyer };
type OrderView = "purchases" | "sales";

const statusLabel = (status: string) => status === "payment_required" ? "Awaiting payment" : status.replaceAll("_", " ");
const money = (value: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(value);

export default function OrdersPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [view, setView] = useState<OrderView>(() => new URLSearchParams(window.location.search).get("view") === "sales" ? "sales" : "purchases");
  const purchases = useQuery<Order[]>({
    queryKey: ["/api/orders"],
    queryFn: async () => (await apiRequest("GET", "/api/orders")).json(),
  });
  const sales = useQuery<Order[]>({
    queryKey: ["/api/sales"],
    queryFn: async () => (await apiRequest("GET", "/api/sales")).json(),
  });
  const checkout = useMutation({
    mutationFn: resumeStripeCheckout,
    onError: (error: Error) => toast({ title: "Checkout unavailable", description: error.message, variant: "destructive" }),
  });
  const query = view === "purchases" ? purchases : sales;

  return (
    <main className="min-h-[calc(100dvh-3.5rem)] bg-black pb-24 text-white">
      <header className="flex h-16 items-center gap-2 border-b border-zinc-800 px-4">
        <Button variant="ghost" size="icon" className="-ml-2 text-zinc-400 hover:bg-zinc-900 hover:text-white" onClick={() => setLocation("/business")} aria-label="Back to business"><ArrowLeft className="h-5 w-5" /></Button>
        <div><h1 className="text-lg font-bold">Orders and sales</h1><p className="text-[11px] text-zinc-500">Buyer checkout and creator fulfillment in one place.</p></div>
      </header>

      <nav aria-label="Order views" className="grid grid-cols-2 gap-2 border-b border-zinc-900 p-4">
        <Button variant={view === "purchases" ? "default" : "outline"} aria-pressed={view === "purchases"} className={view === "purchases" ? "bg-white text-black hover:bg-zinc-200" : "border-zinc-800 bg-zinc-950 text-white hover:bg-zinc-900"} onClick={() => { setView("purchases"); window.history.replaceState(null, "", "/orders?view=purchases"); }}><ShoppingBag className="mr-2 h-4 w-4" /> Purchases</Button>
        <Button variant={view === "sales" ? "default" : "outline"} aria-pressed={view === "sales"} className={view === "sales" ? "bg-white text-black hover:bg-zinc-200" : "border-zinc-800 bg-zinc-950 text-white hover:bg-zinc-900"} onClick={() => { setView("sales"); window.history.replaceState(null, "", "/orders?view=sales"); }}><Store className="mr-2 h-4 w-4" /> Sales</Button>
      </nav>

      {query.isLoading ? (
        <section className="space-y-3 p-4"><Skeleton className="h-36 bg-zinc-900" /><Skeleton className="h-36 bg-zinc-900" /></section>
      ) : query.isError ? (
        <section className="p-4"><p className="rounded-xl border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-300">{view === "purchases" ? "Purchases" : "Sales"} could not be loaded.</p></section>
      ) : (query.data?.length ?? 0) === 0 ? (
        <section className="mx-auto flex max-w-sm flex-col items-center px-6 py-24 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-900"><ReceiptText className="h-7 w-7 text-zinc-400" /></span>
          <h2 className="mt-5 text-xl font-bold">{view === "purchases" ? "No purchases yet" : "No creator sales yet"}</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-500">{view === "purchases" ? "Offers you prepare for checkout will appear here until payment is complete." : "Paid and payment-ready orders containing your offers will appear here."}</p>
          <Button className="mt-6 rounded-xl bg-white text-black hover:bg-zinc-200" onClick={() => setLocation(view === "purchases" ? "/marketplace" : "/create-product")}>{view === "purchases" ? "Browse marketplace" : "Create an offer"}</Button>
        </section>
      ) : (
        <section className="space-y-3 p-4">
          {query.data?.map((order) => (
            <article key={order.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-sm font-bold capitalize">{statusLabel(order.status)}</p><p className="mt-1 text-xs text-zinc-500">{new Date(order.createdAt).toLocaleString()}</p>{view === "sales" && order.buyer && <p className="mt-1 text-xs text-zinc-400">Customer: {order.buyer.displayName} · @{order.buyer.username}</p>}</div>
                <span className="rounded-full border border-zinc-700 px-2.5 py-1 text-[11px] font-semibold capitalize text-zinc-300">{order.status.replaceAll("_", " ")}</span>
              </div>
              <div className="mt-4 space-y-2 border-y border-zinc-800 py-3">
                {order.items.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 text-sm"><span className="truncate text-zinc-300">{item.quantity > 1 ? `${item.quantity} × ` : ""}{item.titleSnapshot}</span><span className="shrink-0 font-semibold">{money(item.unitAmount * item.quantity, order.currency)}</span></div>)}
              </div>
              <div className="mt-3 flex items-center justify-between"><span className="text-sm text-zinc-500">Order total</span><strong className="text-lg">{money(order.totalAmount, order.currency)}</strong></div>
              {view === "purchases" && order.status === "payment_required" && <div className="mt-4 rounded-xl bg-zinc-900 p-3"><div className="flex gap-3"><CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" /><p className="text-xs leading-5 text-zinc-400">This order is preserved and ready for secure payment with Stripe.</p></div><Button className="mt-3 h-10 w-full rounded-xl bg-white text-sm font-bold text-black hover:bg-zinc-200" disabled={checkout.isPending} onClick={() => checkout.mutate(order.id)}>{checkout.isPending ? "Opening checkout…" : "Pay securely"}</Button></div>}
              {order.status === "paid" && <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-emerald-400"><PackageCheck className="h-4 w-4" /> {view === "purchases" ? "Access has been granted." : "Buyer access and earnings allocation are active."}</div>}
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
