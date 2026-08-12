import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, CreditCard, PackageCheck, ReceiptText, RotateCcw, ShoppingBag, Store } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiRequest } from "@/lib/queryClient";
import { resumeStripeCheckout } from "@/lib/checkout";
import { useToast } from "@/hooks/use-toast";
import { subscriptionCanCancel, subscriptionGrantsAccess } from "@shared/subscription-policy";

type OrderItem = { id: string; titleSnapshot: string; unitAmount: number; quantity: number; billingModelSnapshot?: string; billingIntervalSnapshot?: string | null };
type Buyer = { id: number; username: string; displayName: string };
type Order = { id: string; status: string; financialStatus?: string; refundedAmount?: number; disputedAmount?: number; currency: string; totalAmount: number; paymentProvider: string | null; providerSubscriptionReference?: string | null; subscriptionStatus?: string | null; subscriptionCancelAt?: string | null; subscriptionCancelAtPeriodEnd?: boolean; createdAt: string; items: OrderItem[]; buyer?: Buyer };
type OrderView = "purchases" | "sales";

const statusLabel = (status: string) => status === "payment_required" ? "Awaiting payment" : status.replaceAll("_", " ");
const money = (value: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(value);
const subscriptionHasAccess = (order: Order) => !order.providerSubscriptionReference || subscriptionGrantsAccess(order.subscriptionStatus ?? "active");

export default function OrdersPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [view, setView] = useState<OrderView>(() => new URLSearchParams(window.location.search).get("view") === "sales" ? "sales" : "purchases");
  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);
  const [refundOrderId, setRefundOrderId] = useState<string | null>(null);
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
  const cancelRenewal = useMutation({
    mutationFn: async (orderId: string) => (await apiRequest("POST", `/api/orders/${orderId}/subscription/cancel`)).json(),
    onSuccess: () => {
      setCancelOrderId(null);
      purchases.refetch();
      toast({ title: "Renewal canceled", description: "Your access remains active through the current paid period." });
    },
    onError: (error: Error) => toast({ title: "Could not cancel renewal", description: error.message, variant: "destructive" }),
  });
  const refundSale = useMutation({
    mutationFn: async (orderId: string) => (await apiRequest("POST", `/api/orders/${orderId}/refund`, { reason: "requested_by_customer" }, { "Idempotency-Key": crypto.randomUUID() })).json(),
    onSuccess: () => {
      setRefundOrderId(null);
      sales.refetch();
      toast({ title: "Refund submitted", description: "Stripe is processing the refund and any creator transfer reversal. Access updates from the signed webhook." });
    },
    onError: (error: Error) => toast({ title: "Could not issue refund", description: error.message, variant: "destructive" }),
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
                {order.items.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 text-sm"><span className="truncate text-zinc-300">{item.quantity > 1 ? `${item.quantity} × ` : ""}{item.titleSnapshot}</span><span className="shrink-0 font-semibold">{money(item.unitAmount * item.quantity, order.currency)}{item.billingModelSnapshot === "recurring" ? `/${item.billingIntervalSnapshot === "year" ? "year" : "month"}` : ""}</span></div>)}
              </div>
              <div className="mt-3 flex items-center justify-between"><span className="text-sm text-zinc-500">Order total</span><strong className="text-lg">{money(order.totalAmount, order.currency)}</strong></div>
              {view === "purchases" && order.status === "payment_required" && <div className="mt-4 rounded-xl bg-zinc-900 p-3"><div className="flex gap-3"><CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" /><p className="text-xs leading-5 text-zinc-400">This order is preserved and ready for secure payment with Stripe.</p></div><Button className="mt-3 h-10 w-full rounded-xl bg-white text-sm font-bold text-black hover:bg-zinc-200" disabled={checkout.isPending} onClick={() => checkout.mutate(order.id)}>{checkout.isPending ? "Opening checkout…" : "Pay securely"}</Button></div>}
              {order.status === "paid" && subscriptionHasAccess(order) && <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-emerald-400"><PackageCheck className="h-4 w-4" /> {view === "purchases" ? "Access is active." : "Buyer access and earnings allocation are active."}</div>}
              {order.status === "paid" && !subscriptionHasAccess(order) && <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-zinc-400"><PackageCheck className="h-4 w-4" /> {view === "purchases" ? "Access has ended." : "This subscription and buyer access have ended."}</div>}
              {order.financialStatus && order.financialStatus !== "paid" && order.financialStatus !== "open" && <div className="mt-3 rounded-xl border border-amber-900/50 bg-amber-950/20 p-3 text-xs text-amber-200"><p className="font-semibold capitalize">{order.financialStatus.replaceAll("_", " ")}</p>{Boolean(order.refundedAmount) && <p className="mt-1">Refunded {money(order.refundedAmount ?? 0, order.currency)}</p>}{Boolean(order.disputedAmount) && <p className="mt-1">Disputed {money(order.disputedAmount ?? 0, order.currency)}</p>}</div>}
              {view === "sales" && order.status === "paid" && !["refunded", "dispute_lost"].includes(order.financialStatus ?? "paid") && <Button variant="outline" className="mt-4 h-9 border-zinc-700 bg-black text-white hover:bg-zinc-900" onClick={() => setRefundOrderId(order.id)}><RotateCcw className="mr-2 h-4 w-4" />Issue refund</Button>}
              {view === "purchases" && order.providerSubscriptionReference && <div className="mt-4 rounded-xl border border-zinc-800 bg-black p-3"><p className="text-xs font-semibold capitalize text-zinc-300">Subscription {order.subscriptionStatus ?? "active"}</p>{!subscriptionHasAccess(order) ? <p className="mt-1 text-xs text-zinc-500">This subscription has ended and its access has been revoked.</p> : order.subscriptionCancelAtPeriodEnd ? <p className="mt-1 text-xs text-zinc-500">Renewal is canceled.{order.subscriptionCancelAt ? ` Access remains available until ${new Date(order.subscriptionCancelAt).toLocaleDateString()}.` : " Access remains available through the current paid period."}</p> : <><p className="mt-1 text-xs text-zinc-500">This offer renews automatically until you cancel.</p>{subscriptionCanCancel(order.subscriptionStatus) && <Button variant="outline" className="mt-3 h-9 border-zinc-700 bg-black text-white hover:bg-zinc-900" disabled={cancelRenewal.isPending} onClick={() => setCancelOrderId(order.id)}>{cancelRenewal.isPending && cancelOrderId === order.id ? "Canceling…" : "Cancel renewal"}</Button>}</>}</div>}
            </article>
          ))}
        </section>
      )}
      <AlertDialog open={cancelOrderId !== null} onOpenChange={(open) => !open && setCancelOrderId(null)}>
        <AlertDialogContent className="border-zinc-800 bg-zinc-950 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel the next renewal?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              Your subscription will not renew, but your paid access will continue through the current billing period.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800 hover:text-white">Keep subscription</AlertDialogCancel>
            <AlertDialogAction
              className="bg-white text-black hover:bg-zinc-200"
              disabled={!cancelOrderId || cancelRenewal.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (cancelOrderId) cancelRenewal.mutate(cancelOrderId);
              }}
            >
              {cancelRenewal.isPending ? "Canceling…" : "Cancel renewal"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={refundOrderId !== null} onOpenChange={(open) => !open && setRefundOrderId(null)}>
        <AlertDialogContent className="border-zinc-800 bg-zinc-950 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Refund this sale?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">
              This submits a full refund to Stripe. For creator-routed sales, Stripe also reverses the creator transfer and refunds the platform fee. A full refund revokes product and paid-community access after the signed webhook is verified.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800 hover:text-white">Keep sale</AlertDialogCancel>
            <AlertDialogAction className="bg-red-500 text-white hover:bg-red-400" disabled={!refundOrderId || refundSale.isPending} onClick={(event) => { event.preventDefault(); if (refundOrderId) refundSale.mutate(refundOrderId); }}>{refundSale.isPending ? "Refunding…" : "Issue full refund"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
