import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ShieldX, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type GuestInvite = { id: string; label: string; email: string | null; guestUserId: number | null; status: string; expiresAt: string; acceptedAt: string | null; admittedAt: string | null };
type CreatedInvite = GuestInvite & { inviteUrl: string };

export function RoomGuestPanel({ roomId, canManage }: { roomId: string; canManage: boolean }) {
  const client = useQueryClient();
  const { toast } = useToast();
  const [label, setLabel] = useState("");
  const [email, setEmail] = useState("");
  const [lastInviteUrl, setLastInviteUrl] = useState("");
  const key = ["/api/community-rooms", roomId, "guest-invites"];
  const invites = useQuery<GuestInvite[]>({ queryKey: key, enabled: canManage, queryFn: async () => (await apiRequest("GET", `/api/community-rooms/${roomId}/guest-invites`)).json() });
  const createInvite = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/community-rooms/${roomId}/guest-invites`, { label: label.trim(), email: email.trim() || null })).json() as Promise<CreatedInvite>,
    onSuccess: (invite) => { setLabel(""); setEmail(""); setLastInviteUrl(invite.inviteUrl); client.invalidateQueries({ queryKey: key }); toast({ title: "Guest link created", description: "The link is shown once. Copy it before leaving this page." }); },
    onError: (error: Error) => toast({ title: "Guest link was not created", description: error.message, variant: "destructive" }),
  });
  const updateInvite = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "admit" | "revoke" }) => (await apiRequest("POST", `/api/community-rooms/${roomId}/guest-invites/${id}/${action}`, {})).json(),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
    onError: (error: Error) => toast({ title: "Guest access was not updated", description: error.message, variant: "destructive" }),
  });
  if (!canManage) return null;
  return <section aria-label="Guest admission" className="mt-6 rounded-2xl border border-zinc-800 bg-black p-4">
    <p className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4 text-violet-400"/>Guest admission</p>
    <p className="mt-1 text-xs leading-5 text-zinc-500">Create an expiring invitation, let the guest claim it with their account, then explicitly admit or revoke them. Links are never stored in readable form.</p>
    <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><Input aria-label="Guest name" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Guest name" className="border-zinc-800 bg-zinc-950"/><Input aria-label="Guest email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email (optional)" className="border-zinc-800 bg-zinc-950"/><Button disabled={!label.trim() || createInvite.isPending} onClick={() => createInvite.mutate()} className="bg-white text-black hover:bg-zinc-200"><UserPlus className="mr-1.5 h-4 w-4"/>{createInvite.isPending ? "Creating…" : "Invite"}</Button></div>
    {lastInviteUrl && <div className="mt-3 flex items-center gap-2 rounded-xl border border-violet-900 bg-violet-950/20 p-3"><p className="min-w-0 flex-1 truncate text-xs text-violet-200">{lastInviteUrl}</p><Button size="sm" variant="ghost" onClick={() => void navigator.clipboard.writeText(lastInviteUrl).then(() => toast({ title: "Invite copied" }))}><Copy className="mr-1 h-3.5 w-3.5"/>Copy</Button></div>}
    <div className="mt-4 space-y-2">{invites.data?.map((invite) => <article key={invite.id} className="flex flex-col gap-3 rounded-xl border border-zinc-900 bg-zinc-950/60 p-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="text-xs font-bold">{invite.label}</p><p className="mt-1 text-[10px] uppercase tracking-wide text-zinc-600">{invite.status} · expires {new Date(invite.expiresAt).toLocaleString()}</p></div><div className="flex gap-1">{invite.status === "accepted" && <Button size="sm" className="h-8 bg-emerald-500 text-black hover:bg-emerald-400" disabled={updateInvite.isPending} onClick={() => updateInvite.mutate({ id: invite.id, action: "admit" })}><Check className="mr-1 h-3.5 w-3.5"/>Admit</Button>}{!["revoked", "expired"].includes(invite.status) && <Button size="sm" variant="ghost" className="h-8 text-zinc-400" disabled={updateInvite.isPending} onClick={() => updateInvite.mutate({ id: invite.id, action: "revoke" })}><ShieldX className="mr-1 h-3.5 w-3.5"/>Revoke</Button>}</div></article>)}{!invites.isLoading && !invites.data?.length && <p className="rounded-xl border border-dashed border-zinc-900 p-3 text-xs text-zinc-600">No guest invitations yet.</p>}</div>
  </section>;
}
