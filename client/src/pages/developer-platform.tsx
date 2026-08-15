import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  Copy,
  KeyRound,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  Webhook,
  AppWindow,
} from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";

type ApiKey = {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};
type Endpoint = {
  id: string;
  name: string;
  url: string;
  events: string[];
  status: string;
  consecutiveFailures: number;
  lastDeliveryAt: string | null;
  createdAt: string;
};
type DeliveryRow = {
  developer_webhook_deliveries: {
    id: string;
    status: string;
    attempt: number;
    responseCode: number | null;
    errorCode: string | null;
    createdAt: string;
  };
  developer_webhook_endpoints: Endpoint;
};
type Dashboard = {
  configured: boolean;
  scopes: string[];
  eventTypes: string[];
  keys: ApiKey[];
  endpoints: Endpoint[];
  deliveries: DeliveryRow[];
  requestStats: { count: number; failures: number };
  oauthApps: Array<{ id: string; name: string; clientId: string; redirectUris: string[]; scopes: string[]; description: string; homepageUrl: string | null; privacyUrl: string | null; termsUrl: string | null; visibility: string; reviewStatus: string; reviewNote: string | null; status: string; createdAt: string }>;
  installations: Array<{ installation: { id: string; status: string; scopes: string[] }; app: { id: string; name: string; clientId: string } }>;
  sandboxes: Array<{ sandbox: { id: string; status: string; expiresAt: string }; app: { id: string; name: string }; business: { id: string; name: string; handle: string } }>;
};

export default function DeveloperPlatformPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [keyName, setKeyName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>([
    "profile:read",
  ]);
  const [endpointName, setEndpointName] = useState("");
  const [endpointUrl, setEndpointUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([
    "content.published",
  ]);
  const [appName, setAppName] = useState("");
  const [redirectUri, setRedirectUri] = useState("");
  const [appScopes, setAppScopes] = useState<string[]>(["profile:read"]);
  const [listingApp, setListingApp] = useState<string | null>(null);
  const [listingDescription, setListingDescription] = useState("");
  const [homepageUrl, setHomepageUrl] = useState("");
  const [privacyUrl, setPrivacyUrl] = useState("");
  const [termsUrl, setTermsUrl] = useState("");
  const [revealed, setRevealed] = useState<{
    title: string;
    value: string;
    warning: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const { data, isLoading } = useQuery<Dashboard>({
    queryKey: ["/api/developer"],
    queryFn: async () => (await apiRequest("GET", "/api/developer")).json(),
  });
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/developer"] });
  const createKey = useMutation({
    mutationFn: async () =>
      (
        await apiRequest("POST", "/api/developer/keys", {
          name: keyName,
          scopes: selectedScopes,
        })
      ).json(),
    onSuccess: (result) => {
      setRevealed({
        title: "API key created",
        value: result.secret,
        warning: result.warning,
      });
      setKeyName("");
      refresh();
    },
  });
  const revokeKey = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/developer/keys/${id}`),
    onSuccess: refresh,
  });
  const createEndpoint = useMutation({
    mutationFn: async () =>
      (
        await apiRequest("POST", "/api/developer/webhooks", {
          name: endpointName,
          url: endpointUrl,
          events: selectedEvents,
        })
      ).json(),
    onSuccess: (result) => {
      setRevealed({
        title: "Webhook connected",
        value: result.signingSecret,
        warning: result.warning,
      });
      setEndpointName("");
      setEndpointUrl("");
      refresh();
    },
  });
  const revokeEndpoint = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/developer/webhooks/${id}`),
    onSuccess: refresh,
  });
  const testEndpoint = useMutation({
    mutationFn: (id: string) =>
      apiRequest("POST", `/api/developer/webhooks/${id}/test`, {}),
    onSuccess: refresh,
  });
  const createOAuthApp = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/developer/oauth-apps", { name: appName, redirectUris: [redirectUri], scopes: appScopes })).json(),
    onSuccess: (result) => {
      setRevealed({ title: "OAuth application created", value: result.clientSecret, warning: result.warning });
      setAppName(""); setRedirectUri(""); refresh();
    },
  });
  const revokeOAuthApp = useMutation({ mutationFn: (id: string) => apiRequest("DELETE", `/api/developer/oauth-apps/${id}`), onSuccess: refresh });
  const revokeInstallation = useMutation({ mutationFn: (id: string) => apiRequest("DELETE", `/api/developer/installations/${id}`), onSuccess: refresh });
  const submitListing = useMutation({ mutationFn: async () => { if (!listingApp) throw new Error("Choose an app"); await apiRequest("PUT", `/api/developer/oauth-apps/${listingApp}/listing`, { description: listingDescription, homepageUrl, privacyUrl, termsUrl }); return apiRequest("POST", `/api/developer/oauth-apps/${listingApp}/submit`, {}); }, onSuccess: () => { setListingApp(null); refresh(); } });
  const createSandbox = useMutation({ mutationFn: async (appId: string) => (await apiRequest("POST", `/api/developer/oauth-apps/${appId}/sandboxes`, {})).json(), onSuccess: (result) => { setRevealed({ title: "Sandbox created", value: result.apiKey, warning: result.warning }); refresh(); } });
  const revokeSandbox = useMutation({ mutationFn: (id: string) => apiRequest("DELETE", `/api/developer/sandboxes/${id}`), onSuccess: refresh });
  const toggle = (
    value: string,
    current: string[],
    set: (next: string[]) => void,
  ) =>
    set(
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );

  return (
    <main className="min-h-dvh bg-black px-4 pb-24 pt-5 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Back to business"
            className="-ml-2 text-zinc-400 hover:bg-zinc-900 hover:text-white"
            onClick={() => setLocation("/business")}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">
              Business infrastructure
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight">
              Developer platform
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              Connect approved systems through scoped keys and signed,
              retry-safe webhooks without exposing internal CreativesOS routes.
            </p>
          </div>
        </header>
        {!isLoading && !data?.configured && (
          <section
            role="alert"
            className="mt-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100"
          >
            Secret custody is not configured. Key and webhook creation remain
            disabled until the deployment receives its encryption key and
            developer API pepper.
          </section>
        )}
        <section className="mt-6 grid gap-3 sm:grid-cols-3">
          <Metric
            label="API keys"
            value={data?.keys.filter((key) => !key.revokedAt).length ?? 0}
          />
          <Metric
            label="API requests"
            value={Number(data?.requestStats.count ?? 0)}
          />
          <Metric
            label="Active webhooks"
            value={
              data?.endpoints.filter((endpoint) => endpoint.status === "active")
                .length ?? 0
            }
          />
        </section>
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <Heading
              icon={KeyRound}
              title="Scoped API keys"
              detail="Secrets are shown once and stored only as a hash."
            />
            <div className="mt-5 space-y-3">
              <Input
                aria-label="API key name"
                value={keyName}
                onChange={(event) => setKeyName(event.target.value)}
                placeholder="Production analytics"
                className="border-zinc-700 bg-black text-white"
              />
              <Pills
                values={data?.scopes ?? []}
                selected={selectedScopes}
                onToggle={(value) =>
                  toggle(value, selectedScopes, setSelectedScopes)
                }
              />
              {createKey.isError && (
                <p role="alert" className="text-sm text-red-300">
                  {createKey.error.message}
                </p>
              )}
              <Button
                disabled={
                  !data?.configured ||
                  keyName.trim().length < 2 ||
                  selectedScopes.length === 0 ||
                  createKey.isPending
                }
                className="bg-white text-black hover:bg-zinc-200"
                onClick={() => createKey.mutate()}
              >
                <Plus className="mr-2 h-4 w-4" />
                Create key
              </Button>
            </div>
            <div className="mt-6 space-y-2" data-testid="developer-api-keys">
              {data?.keys.map((key) => (
                <div
                  key={key.id}
                  className="rounded-xl border border-zinc-800 bg-black p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {key.name}
                      </p>
                      <p className="mt-1 font-mono text-xs text-zinc-500">
                        {key.keyPrefix}••••••••
                      </p>
                      <p className="mt-2 text-[11px] text-zinc-600">
                        {key.scopes.join(" · ")}
                        {key.lastUsedAt
                          ? ` · used ${new Date(key.lastUsedAt).toLocaleString()}`
                          : " · never used"}
                      </p>
                    </div>
                    {key.revokedAt ? (
                      <span className="text-xs text-zinc-600">Revoked</span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Revoke ${key.name}`}
                        className="text-zinc-500 hover:bg-red-950 hover:text-red-300"
                        onClick={() => revokeKey.mutate(key.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <Heading
              icon={Webhook}
              title="Signed webhooks"
              detail="HTTPS only, no redirects, bounded retries and dead letters."
            />
            <div className="mt-5 space-y-3">
              <Input
                aria-label="Webhook name"
                value={endpointName}
                onChange={(event) => setEndpointName(event.target.value)}
                placeholder="CRM production"
                className="border-zinc-700 bg-black text-white"
              />
              <Input
                aria-label="Webhook URL"
                type="url"
                value={endpointUrl}
                onChange={(event) => setEndpointUrl(event.target.value)}
                placeholder="https://example.com/creativesos"
                className="border-zinc-700 bg-black text-white"
              />
              <Pills
                values={data?.eventTypes ?? []}
                selected={selectedEvents}
                onToggle={(value) =>
                  toggle(value, selectedEvents, setSelectedEvents)
                }
              />
              {createEndpoint.isError && (
                <p role="alert" className="text-sm text-red-300">
                  {createEndpoint.error.message}
                </p>
              )}
              <Button
                disabled={
                  !data?.configured ||
                  endpointName.trim().length < 2 ||
                  !endpointUrl ||
                  selectedEvents.length === 0 ||
                  createEndpoint.isPending
                }
                className="bg-white text-black hover:bg-zinc-200"
                onClick={() => createEndpoint.mutate()}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add endpoint
              </Button>
            </div>
            <div className="mt-6 space-y-2" data-testid="developer-webhooks">
              {data?.endpoints.map((endpoint) => (
                <div
                  key={endpoint.id}
                  className="rounded-xl border border-zinc-800 bg-black p-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold">
                          {endpoint.name}
                        </p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${endpoint.status === "active" ? "bg-emerald-500/15 text-emerald-300" : "bg-zinc-800 text-zinc-500"}`}
                        >
                          {endpoint.status}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-xs text-zinc-500">
                        {endpoint.url}
                      </p>
                      <p className="mt-2 text-[11px] text-zinc-600">
                        {endpoint.events.join(" · ")}
                      </p>
                    </div>
                    {endpoint.status === "active" && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Test ${endpoint.name}`}
                          className="text-zinc-500 hover:bg-zinc-900 hover:text-white"
                          disabled={testEndpoint.isPending}
                          onClick={() => testEndpoint.mutate(endpoint.id)}
                        >
                          {testEndpoint.isPending ? (
                            <RotateCcw className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${endpoint.name}`}
                          className="text-zinc-500 hover:bg-red-950 hover:text-red-300"
                          onClick={() => revokeEndpoint.mutate(endpoint.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
        <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950 p-5" data-testid="developer-oauth-apps">
          <Heading icon={AppWindow} title="OAuth applications" detail="Let users install an app with explicit scopes and revoke access without rotating account credentials." />
          <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_1.4fr]">
            <Input aria-label="OAuth app name" value={appName} onChange={(event) => setAppName(event.target.value)} placeholder="Agency reporting app" className="border-zinc-700 bg-black text-white" />
            <Input aria-label="OAuth redirect URI" value={redirectUri} onChange={(event) => setRedirectUri(event.target.value)} placeholder="https://app.example.com/oauth/callback" className="border-zinc-700 bg-black text-white" />
          </div>
          <div className="mt-3"><Pills values={data?.scopes ?? []} selected={appScopes} onToggle={(value) => toggle(value, appScopes, setAppScopes)} /></div>
          {createOAuthApp.isError && <p role="alert" className="mt-3 text-sm text-red-300">{createOAuthApp.error.message}</p>}
          <Button className="mt-3 bg-white text-black hover:bg-zinc-200" disabled={!data?.configured || appName.trim().length < 2 || !redirectUri || appScopes.length === 0 || createOAuthApp.isPending} onClick={() => createOAuthApp.mutate()}><Plus className="mr-2 h-4 w-4" />Create OAuth app</Button>
          <div className="mt-5 grid gap-3 md:grid-cols-2">{data?.oauthApps.map((oauthApp) => <div key={oauthApp.id} className="rounded-xl border border-zinc-800 bg-black p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold">{oauthApp.name}</p><p className="mt-1 truncate font-mono text-xs text-zinc-500">{oauthApp.clientId}</p><p className="mt-2 text-[11px] text-zinc-600">{oauthApp.scopes.join(" · ")} · {oauthApp.reviewStatus}</p></div>{oauthApp.status === "active" ? <Button variant="ghost" size="icon" aria-label={`Revoke ${oauthApp.name}`} onClick={() => revokeOAuthApp.mutate(oauthApp.id)}><Trash2 className="h-4 w-4" /></Button> : <span className="text-xs text-zinc-600">Revoked</span>}</div>{oauthApp.status === "active" && <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => createSandbox.mutate(oauthApp.id)}>Create sandbox</Button><Button size="sm" variant="ghost" onClick={() => { setListingApp(oauthApp.id); setListingDescription(oauthApp.description ?? ""); setHomepageUrl(oauthApp.homepageUrl ?? ""); setPrivacyUrl(oauthApp.privacyUrl ?? ""); setTermsUrl(oauthApp.termsUrl ?? ""); }}>Submit listing</Button></div>}</div>)}</div>
          {(data?.installations.length ?? 0) > 0 && <div className="mt-6"><h3 className="text-sm font-bold">Installed apps</h3><div className="mt-2 space-y-2">{data?.installations.map(({ installation, app }) => <div key={installation.id} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-black p-3"><div><p className="text-sm font-semibold">{app.name}</p><p className="mt-1 text-xs text-zinc-600">{installation.scopes.join(" · ")} · {installation.status}</p></div>{installation.status === "active" && <Button variant="ghost" size="sm" onClick={() => revokeInstallation.mutate(installation.id)}>Revoke access</Button>}</div>)}</div></div>}
          {(data?.sandboxes.length ?? 0) > 0 && <div className="mt-6"><h3 className="text-sm font-bold">Developer sandboxes</h3><div className="mt-2 space-y-2">{data?.sandboxes.map(({ sandbox, app, business }) => <div key={sandbox.id} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-black p-3"><div><p className="text-sm font-semibold">{app.name} · {business.name}</p><p className="mt-1 text-xs text-zinc-600">{sandbox.status} · expires {new Date(sandbox.expiresAt).toLocaleString()}</p></div>{sandbox.status === "active" && <Button variant="ghost" size="sm" onClick={() => revokeSandbox.mutate(sandbox.id)}>Revoke</Button>}</div>)}</div></div>}
        </section>
        <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <h2 className="font-bold">Recent delivery evidence</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-xs">
              <thead className="text-zinc-500">
                <tr>
                  <th className="pb-3">Endpoint</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Attempt</th>
                  <th className="pb-3">Response</th>
                  <th className="pb-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {data?.deliveries.map((row) => (
                  <tr
                    key={row.developer_webhook_deliveries.id}
                    className="border-t border-zinc-800"
                  >
                    <td className="py-3 text-zinc-300">
                      {row.developer_webhook_endpoints.name}
                    </td>
                    <td className="py-3">
                      {row.developer_webhook_deliveries.status}
                    </td>
                    <td className="py-3">
                      {row.developer_webhook_deliveries.attempt}
                    </td>
                    <td className="py-3">
                      {row.developer_webhook_deliveries.responseCode ??
                        row.developer_webhook_deliveries.errorCode ??
                        "—"}
                    </td>
                    <td className="py-3 text-zinc-500">
                      {new Date(
                        row.developer_webhook_deliveries.createdAt,
                      ).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <Dialog
        open={Boolean(revealed)}
        onOpenChange={(open) => {
          if (!open) {
            setRevealed(null);
            setCopied(false);
          }
        }}
      >
        <DialogContent className="border-zinc-800 bg-zinc-950 text-white">
          <DialogHeader>
            <DialogTitle>{revealed?.title}</DialogTitle>
            <DialogDescription className="text-zinc-400">
              {revealed?.warning}
            </DialogDescription>
          </DialogHeader>
          <div
            className="break-all rounded-xl border border-zinc-700 bg-black p-3 font-mono text-xs"
            data-testid="one-time-secret"
          >
            {revealed?.value}
          </div>
          <Button
            className="bg-white text-black hover:bg-zinc-200"
            onClick={async () => {
              if (revealed) {
                await navigator.clipboard.writeText(revealed.value);
                setCopied(true);
              }
            }}
          >
            {copied ? (
              <Check className="mr-2 h-4 w-4" />
            ) : (
              <Copy className="mr-2 h-4 w-4" />
            )}
            {copied ? "Copied" : "Copy secret"}
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(listingApp)} onOpenChange={(open) => { if (!open) setListingApp(null); }}>
        <DialogContent className="border-zinc-800 bg-zinc-950 text-white"><DialogHeader><DialogTitle>Submit app for review</DialogTitle><DialogDescription className="text-zinc-400">Approved apps become visible in the public directory. Any listing edit requires a new review.</DialogDescription></DialogHeader><div className="space-y-3"><Input aria-label="App description" value={listingDescription} onChange={(event) => setListingDescription(event.target.value)} placeholder="Describe the app and its user value" /><Input aria-label="Homepage URL" value={homepageUrl} onChange={(event) => setHomepageUrl(event.target.value)} placeholder="https://app.example.com" /><Input aria-label="Privacy URL" value={privacyUrl} onChange={(event) => setPrivacyUrl(event.target.value)} placeholder="https://app.example.com/privacy" /><Input aria-label="Terms URL" value={termsUrl} onChange={(event) => setTermsUrl(event.target.value)} placeholder="https://app.example.com/terms" />{submitListing.isError && <p className="text-sm text-red-300">{submitListing.error.message}</p>}<Button className="w-full" onClick={() => submitListing.mutate()} disabled={submitListing.isPending}>Submit for platform review</Button></div></DialogContent>
      </Dialog>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value.toLocaleString()}</p>
    </div>
  );
}
function Heading({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof KeyRound;
  title: string;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <h2 className="font-bold">{title}</h2>
        <p className="text-xs text-zinc-500">{detail}</p>
      </div>
    </div>
  );
}
function Pills({
  values,
  selected,
  onToggle,
}: {
  values: string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {values.map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={selected.includes(value)}
          onClick={() => onToggle(value)}
          className={`rounded-full border px-3 py-1.5 text-xs ${selected.includes(value) ? "border-white bg-white text-black" : "border-zinc-700 text-zinc-400"}`}
        >
          {value}
        </button>
      ))}
    </div>
  );
}
