import { lazy, Suspense, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, Radio, ShieldCheck, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RoomIntelligencePanel } from "@/components/community/RoomIntelligencePanel";
import { RoomMediaPanel } from "@/components/community/RoomMediaPanel";
import { RoomWorkspacePanel } from "@/components/community/RoomWorkspacePanel";
import { apiRequest } from "@/lib/queryClient";

const CommunityLiveSession = lazy(() => import("@/components/community/CommunityLiveSession"));

type NativeRoom = {
  id: string;
  communityId: number;
  title: string;
  description: string;
  startsAt: string;
  status: "scheduled" | "live" | "ended" | "canceled";
  provider: string;
  canManage: boolean;
  recordingEnabled: boolean;
  transcriptionEnabled: boolean;
};

type NativeRoomSession = {
  token: string;
  serverUrl: string;
  roomName: string;
  participant: { identity: string; name: string };
};

export default function CommunityRoomPage() {
  const [, params] = useRoute("/communities/:communityId/rooms/:roomId");
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [session, setSession] = useState<NativeRoomSession | null>(null);
  const [mediaError, setMediaError] = useState("");
  const roomId = params?.roomId;

  const { data: room, isLoading, error } = useQuery<NativeRoom>({
    queryKey: ["/api/community-rooms", roomId],
    enabled: Boolean(roomId),
    queryFn: async () =>
      (await apiRequest("GET", `/api/community-rooms/${roomId}`)).json(),
    refetchInterval: 10_000,
  });
  const { data: providers } = useQuery<{
    livekit: { configured: boolean };
  }>({
    queryKey: ["/api/community-room-providers"],
    queryFn: async () =>
      (await apiRequest("GET", "/api/community-room-providers")).json(),
  });

  const startMutation = useMutation({
    mutationFn: async () =>
      apiRequest("PATCH", `/api/community-rooms/${roomId}`, { status: "live" }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["/api/community-rooms", roomId] }),
  });
  const joinMutation = useMutation({
    mutationFn: async () =>
      (await apiRequest("POST", `/api/community-rooms/${roomId}/livekit-token`, {})).json() as Promise<NativeRoomSession>,
    onSuccess: (createdSession) => {
      setMediaError("");
      setSession(createdSession);
    },
  });

  if (session) {
    return (
      <Suspense fallback={<main className="flex min-h-dvh items-center justify-center bg-black text-sm text-zinc-500">Preparing the conference room…</main>}>
        <CommunityLiveSession roomId={roomId!} roomTitle={room?.title ?? "Community room"} token={session.token} serverUrl={session.serverUrl} mediaError={mediaError} onError={setMediaError} onLeave={() => setSession(null)} />
      </Suspense>
    );
  }

  const backToCommunity = () =>
    setLocation(`/communities/${room?.communityId ?? params?.communityId ?? ""}`);
  const providerReady = providers?.livekit.configured === true;
  const closed = room?.status === "ended" || room?.status === "canceled";

  return (
    <main className="min-h-dvh bg-black px-5 pb-28 pt-5 text-white">
      <header className="mx-auto flex w-full max-w-xl items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Back to community"
          className="-ml-2 rounded-full text-white hover:bg-zinc-900 hover:text-white"
          onClick={backToCommunity}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <p className="text-xs font-semibold text-zinc-500">CreativesOS conference room</p>
          <h1 className="text-lg font-bold">{isLoading ? "Loading room…" : room?.title ?? "Room unavailable"}</h1>
        </div>
      </header>

      <section className="mx-auto mt-8 w-full max-w-xl rounded-3xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl shadow-black">
        {error || !room ? (
          <p role="alert" className="text-sm text-red-300">This room could not be loaded.</p>
        ) : room.provider !== "livekit" ? (
          <p role="alert" className="text-sm text-zinc-300">This room uses an external conference provider. Return to the community to open its provider link.</p>
        ) : (
          <>
            <div className="flex items-start justify-between gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-zinc-900">
                <Video className="h-5 w-5" />
              </span>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${room.status === "live" ? "border-red-900 bg-red-950/50 text-red-300" : "border-zinc-700 text-zinc-400"}`}>
                <Radio className="h-3 w-3" /> {room.status}
              </span>
            </div>
            <h2 className="mt-5 text-2xl font-bold">{room.title}</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">{room.description || "A private live session for this community."}</p>
            <p className="mt-4 text-xs text-zinc-500">Scheduled for {new Date(room.startsAt).toLocaleString()}</p>

            <div className="mt-6 rounded-2xl border border-zinc-800 bg-black p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
                <div>
                  <p className="text-sm font-semibold">Private community access</p>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">Your access token is short-lived and works only for this room. Camera and microphone start off. Recording and transcription are {room.recordingEnabled || room.transcriptionEnabled ? "controlled by the room consent settings" : "off"}.</p>
                </div>
              </div>
            </div>

            {!providerReady && (
              <p role="alert" className="mt-5 rounded-xl border border-amber-900 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">Native conferencing is built but still needs the LiveKit project credentials.</p>
            )}
            {mediaError && <p role="alert" className="mt-4 text-sm text-red-300">{mediaError}</p>}
            {joinMutation.error && <p role="alert" className="mt-4 text-sm text-red-300">{joinMutation.error.message}</p>}
            {startMutation.error && <p role="alert" className="mt-4 text-sm text-red-300">{startMutation.error.message}</p>}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              {room.status === "scheduled" && room.canManage && (
                <Button
                  className="h-11 flex-1 rounded-full bg-white font-bold text-black hover:bg-zinc-200"
                  disabled={!providerReady || startMutation.isPending}
                  onClick={() => startMutation.mutate()}
                >
                  {startMutation.isPending ? "Starting…" : "Start room"}
                </Button>
              )}
              {room.status === "live" && (
                <Button
                  className="h-11 flex-1 rounded-full bg-white font-bold text-black hover:bg-zinc-200"
                  disabled={!providerReady || joinMutation.isPending}
                  onClick={() => joinMutation.mutate()}
                >
                  {joinMutation.isPending ? "Joining…" : "Join with camera and mic off"}
                </Button>
              )}
              {(closed || (room.status === "scheduled" && !room.canManage)) && (
                <Button variant="outline" className="h-11 flex-1 rounded-full border-zinc-700 bg-black text-white hover:bg-zinc-900" onClick={backToCommunity}>
                  {closed ? "Return to community" : "Waiting for the host"}
                </Button>
              )}
            </div>
            <RoomWorkspacePanel
              roomId={room.id}
              communityId={room.communityId}
              roomTitle={room.title}
              roomDescription={room.description}
              roomStartsAt={room.startsAt}
            />
            <RoomMediaPanel roomId={room.id} />
            <RoomIntelligencePanel roomId={room.id} roomStatus={room.status} />
          </>
        )}
      </section>
    </main>
  );
}
