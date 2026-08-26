import { useMutation } from "@tanstack/react-query";
import { ArrowRight, ShieldCheck, Users } from "lucide-react";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";

type AcceptedInvite = { roomId: string; communityId: number; label: string; status: string };

export default function RoomInvitePage() {
  const [, params] = useRoute("/room-invites/:token");
  const [, setLocation] = useLocation();
  const accept = useMutation({ mutationFn: async () => (await apiRequest("POST", `/api/community-room-guest-invites/${params?.token}/accept`, {})).json() as Promise<AcceptedInvite> });
  return <main className="grid min-h-dvh place-items-center bg-black px-5 text-white"><section className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-950 p-6"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-300"><Users className="h-5 w-5"/></span><h1 className="mt-5 text-2xl font-black">Join a CreativesOS room</h1><p className="mt-2 text-sm leading-6 text-zinc-400">Claim this private invitation with your signed-in account. The host must still admit you before community or room access is granted.</p><div className="mt-5 flex gap-3 rounded-2xl border border-zinc-800 bg-black p-4"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400"/><p className="text-xs leading-5 text-zinc-500">The invitation expires automatically and can be revoked. Camera, microphone, recording, transcription, and AI remain governed separately.</p></div>{accept.error && <p role="alert" className="mt-4 text-sm text-red-300">{accept.error.message}</p>}{accept.data ? <div className="mt-5"><p className="rounded-xl border border-emerald-900 bg-emerald-950/20 p-3 text-sm text-emerald-200">{accept.data.status === "admitted" ? "You are admitted to this room." : "Invitation accepted. You are waiting for the host to admit you."}</p>{accept.data.status === "admitted" && <Button className="mt-3 w-full bg-white text-black" onClick={() => setLocation(`/communities/${accept.data.communityId}/rooms/${accept.data.roomId}`)}>Open room<ArrowRight className="ml-2 h-4 w-4"/></Button>}</div> : <Button className="mt-6 w-full bg-white text-black hover:bg-zinc-200" disabled={!params?.token || accept.isPending} onClick={() => accept.mutate()}>{accept.isPending ? "Accepting…" : "Accept invitation"}<ArrowRight className="ml-2 h-4 w-4"/></Button>}</section></main>;
}
