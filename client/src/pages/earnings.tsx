import { ArrowLeft, ExternalLink, Landmark, RefreshCw } from "lucide-react";
import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type PayoutAccount = {
  connected: boolean;
  connectConfigured: boolean;
  status?: string;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  platformFeeBps: number;
};
type Allocation = {
  id: string;
  grossAmount: number;
  platformFeeAmount: number;
  creatorNetAmount: number;
  status: string;
  refundedAmount?: number;
  reversedAmount?: number;
};
type PayoutEvent = { id: string; providerPayoutId: string; amount: number; currency: string; status: string; arrivalAt?: string | null; failureMessage?: string | null; updatedAt: string };
type Earnings = {
  allocations: Allocation[];
  payoutEvents: PayoutEvent[];
  totals: {
    grossAmount: number;
    platformFeeAmount: number;
    creatorNetAmount: number;
  };
  platformFeeBps: number;
};
const money = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    value,
  );

export default function EarningsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const hasRefreshedStripeReturn = useRef(false);
  const stripeConnectionResult = new URLSearchParams(
    window.location.search,
  ).get("stripe");
  const connectionMessage =
    stripeConnectionResult === "invalid_grant"
      ? "Stripe could not connect that account. Choose an independently owned Standard Stripe account, not another platform's Connect account."
      : stripeConnectionResult === "expired"
        ? "The Stripe setup link expired before completion. Start again to receive a fresh one-hour setup window."
        : stripeConnectionResult === "error"
          ? "Stripe could not complete the connection. Please choose an independently owned Standard Stripe account and try again."
          : null;
  const account = useQuery<PayoutAccount>({
    queryKey: ["/api/creator-payments/account"],
    queryFn: async () =>
      (await apiRequest("GET", "/api/creator-payments/account")).json(),
  });
  const earnings = useQuery<Earnings>({
    queryKey: ["/api/creator-payments/earnings"],
    queryFn: async () =>
      (await apiRequest("GET", "/api/creator-payments/earnings")).json(),
  });
  const refresh = useMutation({
    mutationFn: async () =>
      (
        await apiRequest("POST", "/api/creator-payments/account/refresh", {})
      ).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/creator-payments/account"],
      });
      toast({ title: "Payout account refreshed" });
    },
    onError: (error: Error) =>
      toast({
        title: "Could not refresh payout account",
        description: error.message,
        variant: "destructive",
      }),
  });
  const onboard = useMutation({
    mutationFn: async () =>
      (
        await apiRequest("POST", "/api/creator-payments/onboarding", {})
      ).json() as Promise<{ onboardingUrl: string }>,
    onSuccess: ({ onboardingUrl }) => {
      window.location.assign(onboardingUrl);
    },
    onError: (error: Error) =>
      toast({
        title: "Could not open payout setup",
        description: error.message,
        variant: "destructive",
      }),
  });
  useEffect(() => {
    if (stripeConnectionResult !== "return" || hasRefreshedStripeReturn.current) {
      return;
    }
    hasRefreshedStripeReturn.current = true;
    window.history.replaceState({}, "", "/earnings");
    refresh.mutate();
  }, [refresh, stripeConnectionResult]);
  const ready = Boolean(
    account.data?.chargesEnabled && account.data?.payoutsEnabled,
  );
  const totals = earnings.data?.totals ?? {
    grossAmount: 0,
    platformFeeAmount: 0,
    creatorNetAmount: 0,
  };

  const connectAvailable = Boolean(account.data?.connectConfigured);
  return (
    <main className="min-h-[calc(100dvh-3.5rem)] bg-black pb-24 text-white">
      <header className="flex h-16 items-center gap-2 border-b border-zinc-800 px-4">
        <Button
          variant="ghost"
          size="icon"
          className="-ml-2 text-zinc-400 hover:bg-zinc-900 hover:text-white"
          onClick={() => setLocation("/business")}
          aria-label="Back to business"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-lg font-bold">Creator earnings</h1>
          <p className="text-xs text-zinc-500">
            Your money is separate from CreativesOS platform revenue.
          </p>
        </div>
      </header>
      <section className="space-y-4 p-4">
        {connectionMessage && (
          <div
            role="alert"
            className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100"
          >
            {connectionMessage}
          </div>
        )}
        {account.isLoading ? (
          <Skeleton className="h-44 bg-zinc-900" />
        ) : (
          <article className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <div className="flex gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-800">
                <Landmark className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-bold">Your Stripe account</h2>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  {ready
                    ? "Your independent Stripe account is ready to receive creator earnings on its own payout schedule."
                    : account.data?.connected
                      ? "Finish Stripe onboarding to enable charges and payouts."
                      : connectAvailable
                        ? "Set up the independent Stripe account that will receive your creator earnings."
                        : "Stripe account connections are being configured for CreativesOS."}
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ready ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-300"}`}
              >
                {ready
                  ? "Ready"
                  : account.data?.connected
                    ? "Action needed"
                    : "Not connected"}
              </span>
              {ready ? (
                <Button
                  variant="outline"
                  className="h-9 border-zinc-700 bg-black text-white hover:bg-zinc-900 hover:text-white"
                  onClick={() => refresh.mutate()}
                  disabled={refresh.isPending}
                >
                  <RefreshCw
                    className={`mr-2 h-4 w-4 ${refresh.isPending ? "animate-spin" : ""}`}
                  />
                  Refresh
                </Button>
              ) : (
                <Button
                  className="h-9 bg-white text-black hover:bg-zinc-200"
                  onClick={() => onboard.mutate()}
                  disabled={!connectAvailable || onboard.isPending}
                >
                  {onboard.isPending ? (
                    "Opening Stripe…"
                  ) : (
                    <>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Connect my Stripe
                    </>
                  )}
                </Button>
              )}
            </div>
          </article>
        )}
        <div className="grid grid-cols-2 gap-3">
          <article className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Creator earnings
            </p>
            <p className="mt-2 text-2xl font-bold">
              {money(totals.creatorNetAmount)}
            </p>
            <p className="mt-1 text-xs text-zinc-500">Your net sales</p>
          </article>
          <article className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Platform fee
            </p>
            <p className="mt-2 text-2xl font-bold">
              {money(totals.platformFeeAmount)}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {(earnings.data?.platformFeeBps ??
                account.data?.platformFeeBps ??
                0) / 100}
              % of creator sales
            </p>
          </article>
        </div>
        <article className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <h2 className="text-sm font-bold">Earnings activity</h2>
          {earnings.isLoading ? (
            <Skeleton className="mt-4 h-16 bg-zinc-900" />
          ) : !earnings.data?.allocations.length ? (
            <p className="mt-3 text-sm leading-6 text-zinc-500">
              Creator payout activity will appear here after a buyer completes
              checkout for an offer routed to the Stripe account you own.
            </p>
          ) : (
            <div className="mt-3 space-y-3">
              {earnings.data.allocations.map((allocation) => (
                <div
                  key={allocation.id}
                  className="flex items-center justify-between gap-3 border-t border-zinc-800 pt-3"
                >
                  <div>
                    <p className="text-sm font-semibold">
                      {money(allocation.creatorNetAmount)} creator earnings
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Gross {money(allocation.grossAmount)} · Platform fee{" "}
                      {money(allocation.platformFeeAmount)}
                    </p>
                  </div>
                  <span className="text-xs font-semibold capitalize text-zinc-400">
                    {allocation.status.replaceAll("_", " ")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </article>
        <article className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <h2 className="text-sm font-bold">Stripe payouts</h2>
          {!earnings.data?.payoutEvents?.length ? <p className="mt-3 text-sm leading-6 text-zinc-500">Connected-account payout updates will appear here after Stripe schedules the first bank payout.</p> : <div className="mt-3 space-y-3">{earnings.data.payoutEvents.map((payout) => <div key={payout.id} className="flex items-start justify-between gap-3 border-t border-zinc-800 pt-3"><div><p className="text-sm font-semibold">{money(payout.amount)} payout</p><p className="mt-1 text-xs text-zinc-500">{payout.arrivalAt ? `Expected ${new Date(payout.arrivalAt).toLocaleDateString()}` : "Arrival date pending"}{payout.failureMessage ? ` · ${payout.failureMessage}` : ""}</p></div><span className="text-xs font-semibold capitalize text-zinc-400">{payout.status.replaceAll("_", " ")}</span></div>)}</div>}
        </article>
      </section>
    </main>
  );
}
