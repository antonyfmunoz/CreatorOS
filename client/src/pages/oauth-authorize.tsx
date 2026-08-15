import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";

type Context = { app: { name: string; clientId: string }; business: { id: string; name: string }; scopes: string[]; state: string; redirectUri: string };
export default function OAuthAuthorizePage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const query = params.toString();
  const { data, error, isLoading } = useQuery<Context>({ queryKey: ["oauth-authorize", query], queryFn: async () => {
    const response = await apiRequest("GET", `/api/oauth/authorize/context?${query}`);
    return response.json();
  }});
  const authorize = useMutation({ mutationFn: async () => {
    if (!data) throw new Error("Authorization context is unavailable");
    const response = await apiRequest("POST", "/api/oauth/authorize", { clientId: data.app.clientId, redirectUri: data.redirectUri, scopes: data.scopes, state: data.state });
    return response.json();
  }, onSuccess: (result) => { window.location.assign(result.redirectUrl); }});
  return <main className="flex min-h-screen items-center justify-center bg-black px-4 text-white"><section className="w-full max-w-md rounded-3xl border border-white/10 bg-zinc-950 p-6 shadow-2xl"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/15"><ShieldCheck className="h-6 w-6 text-sky-400" /></div><h1 className="mt-5 text-2xl font-black">Authorize CreativesOS access</h1>{isLoading ? <p className="mt-3 text-sm text-zinc-500">Validating the application…</p> : error || !data ? <p className="mt-3 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-300">This authorization request is invalid or no longer permitted.</p> : <><p className="mt-3 text-sm leading-6 text-zinc-400"><strong className="text-white">{data.app.name}</strong> wants access to <strong className="text-white">{data.business.name}</strong>.</p><div className="mt-5 space-y-2">{data.scopes.map((scope) => <div key={scope} className="rounded-xl border border-white/10 bg-black p-3 text-sm"><p className="font-bold">{scope}</p><p className="mt-1 text-xs text-zinc-500">Only this explicitly listed capability will be granted.</p></div>)}</div><p className="mt-4 text-xs leading-5 text-zinc-600">You can revoke this installation from Developer Platform. CreativesOS never shares your password or unrelated tenant data.</p><div className="mt-6 flex gap-3"><Button variant="outline" className="flex-1" onClick={() => history.back()}>Cancel</Button><Button className="flex-1" onClick={() => authorize.mutate()} disabled={authorize.isPending}>{authorize.isPending ? "Authorizing…" : "Authorize"}</Button></div></>}</section></main>;
}
