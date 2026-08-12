import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  Link2,
  Settings2,
} from "lucide-react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import type { DistributionConnectionsResponse } from "@/lib/distribution";
import { apiRequest } from "@/lib/queryClient";

function connectionNoticeCopy(status: string): string {
  if (status === "connected")
    return "YouTube is connected and ready for future distribution jobs.";
  if (status === "channel_required")
    return "That Google account does not have a YouTube channel available to connect. Select the account that owns the channel, or create a YouTube channel first.";
  if (status === "account_in_use")
    return "That YouTube channel is already connected to another CreativesOS account.";
  if (status === "exchange_failed")
    return "Google did not complete the secure token exchange. Confirm the OAuth Client secret is current, then try again.";
  if (status === "channel_lookup_failed")
    return "Google authorized the account, but CreativesOS could not read the YouTube channel. Try again with the channel owner account.";
  if (status === "invalid_state")
    return "That connection attempt expired or was already used. Start a new connection attempt.";
  if (status === "denied")
    return "Google access was not granted. Approve the listed permissions to connect YouTube.";
  return "The YouTube connection was not completed. You can try again when you are ready.";
}

export default function DistributionConnections() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery<DistributionConnectionsResponse>({
    queryKey: ["/api/distribution/connections"],
    enabled: Boolean(user),
  });
  const disconnect = useMutation({
    mutationFn: async ({
      provider,
      connectionId,
    }: {
      provider: string;
      connectionId: string;
    }) =>
      apiRequest(
        "DELETE",
        `/api/distribution/connections/${provider}/${connectionId}`,
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["/api/distribution/connections"],
      }),
  });
  const connectionNotice = new URLSearchParams(window.location.search).get(
    "youtube",
  );

  return (
    <main className="min-h-[calc(100dvh-3.5rem)] bg-black pb-24 text-white">
      <header className="flex h-14 items-center gap-2 border-b border-zinc-800 px-4">
        <Button
          variant="ghost"
          size="icon"
          className="-ml-2 text-white hover:bg-zinc-900 hover:text-white"
          onClick={() => setLocation("/studio")}
          aria-label="Back to distribution studio"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-lg font-bold">Channel connections</h1>
          <p className="text-[11px] text-zinc-500">
            Your accounts stay separate from your publishing queue.
          </p>
        </div>
      </header>
      <section className="p-4">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="flex gap-3">
            <div className="mt-0.5 rounded-full bg-zinc-900 p-2">
              <Settings2 className="h-4 w-4 text-zinc-300" />
            </div>
            <div>
              <h2 className="text-sm font-bold">
                Provider activation is deliberate
              </h2>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                A channel can only be connected after its OAuth application,
                scopes, and provider publishing approval are configured.
                CreativesOS will never mark an external post as published until
                the provider confirms it.
              </p>
            </div>
          </div>
        </div>
        {connectionNotice && (
          <p
            className={`mt-4 rounded-xl px-3 py-2.5 text-xs leading-5 ${connectionNotice === "connected" ? "bg-emerald-950/60 text-emerald-300" : "bg-amber-950/60 text-amber-200"}`}
          >
            {connectionNoticeCopy(connectionNotice)}
          </p>
        )}
        {isLoading && (
          <p className="py-16 text-center text-sm text-zinc-500">
            Loading your channels…
          </p>
        )}
        {!isLoading && (
          <div className="mt-5 space-y-3">
            {data?.providers.map((provider) => {
              const active = provider.connections.find(
                (connection) => connection.status === "active",
              );
              const connection = active ?? provider.connections[0];
              return (
                <article
                  key={provider.id}
                  className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-sm font-bold">{provider.label}</h2>
                      {connection ? (
                        <p className="mt-1 text-xs text-zinc-500">
                          {connection.providerAccountName} · {connection.status}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-zinc-500">
                          No account connected
                        </p>
                      )}
                    </div>
                    {active ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    ) : (
                      <Link2 className="h-5 w-5 text-zinc-500" />
                    )}
                  </div>
                  {!provider.connectionConfigured ? (
                    <div className="mt-4 flex items-start gap-2 rounded-xl bg-zinc-900 px-3 py-2.5 text-xs leading-5 text-zinc-400">
                      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      This channel is not activated for CreativesOS yet. Add the
                      approved provider credentials before connecting an
                      account.
                    </div>
                  ) : !provider.connectionAvailable ? (
                    <Button
                      disabled
                      className="mt-4 h-9 w-full rounded-xl bg-zinc-800 text-xs font-bold text-zinc-400"
                    >
                      Connection adapter coming next
                    </Button>
                  ) : active ? (
                    <Button
                      variant="outline"
                      disabled={disconnect.isPending}
                      onClick={() =>
                        disconnect.mutate({
                          provider: provider.id,
                          connectionId: active.id,
                        })
                      }
                      className="mt-4 h-9 w-full rounded-xl border-zinc-700 bg-black text-xs font-bold text-white hover:bg-zinc-900"
                    >
                      Disconnect {provider.label}
                    </Button>
                  ) : (
                    <Button
                      onClick={() =>
                        window.location.assign(
                          `/api/distribution/connections/${provider.id}/authorize`,
                        )
                      }
                      className="mt-4 h-9 w-full rounded-xl bg-[#1d9bf0] text-xs font-bold text-white hover:bg-[#1a8cd8]"
                    >
                      Connect {provider.label}
                    </Button>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
