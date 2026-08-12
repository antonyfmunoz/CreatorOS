import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Captions, CheckCircle2, ClipboardCopy, Download, Radio, Square } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type Recording = {
  id: string;
  status: string;
  createdAt: string;
  durationMs: number | null;
  errorMessage: string | null;
};

type AgentSession = {
  id: string;
  agentProfileId: string | null;
  kind: "transcription" | "realtime_ai";
  status: string;
};

type AgentProfile = {
  id: string;
  name: string;
  role: string;
  mode: string;
  status: string;
};

type MediaState = {
  canManage: boolean;
  roomStatus: string;
  policy: {
    recordingAllowed: boolean;
    transcriptionAllowed: boolean;
    aiAnalysisAllowed: boolean;
  };
  provider: {
    recordingConfigured: boolean;
    transcriptionAgentConfigured: boolean;
    roomAgentConfigured: boolean;
    transcriptIngestConfigured: boolean;
  };
  recordings: Recording[];
  transcriptSegments: Array<{
    id: string;
    speakerIdentity: string;
    text: string;
    createdAt: string;
  }>;
  agentSessions: AgentSession[];
  aiProfiles: AgentProfile[];
};

const activeStatuses = new Set(["starting", "active", "stopping"]);

export function RoomMediaPanel({ roomId, compact = false }: { roomId: string; compact?: boolean }) {
  const client = useQueryClient();
  const { toast } = useToast();
  const key = ["/api/community-rooms", roomId, "media"];
  const { data, error, isLoading } = useQuery<MediaState>({
    queryKey: key,
    queryFn: async () =>
      (await apiRequest("GET", `/api/community-rooms/${roomId}/media`)).json(),
    refetchInterval: 5_000,
  });

  const refresh = () => client.invalidateQueries({ queryKey: key });
  const mutationError = (title: string) => (mutationError: Error) =>
    toast({ title, description: mutationError.message, variant: "destructive" });
  const startRecording = useMutation({
    mutationFn: () => apiRequest("POST", `/api/community-rooms/${roomId}/media/recordings/start`, {}),
    onSuccess: refresh,
    onError: mutationError("Recording did not start"),
  });
  const stopRecording = useMutation({
    mutationFn: () => apiRequest("POST", `/api/community-rooms/${roomId}/media/recordings/stop`, {}),
    onSuccess: refresh,
    onError: mutationError("Recording did not stop"),
  });
  const startAgent = useMutation({
    mutationFn: (input: { kind: "transcription" | "realtime_ai"; profileId?: string }) =>
      apiRequest("POST", `/api/community-rooms/${roomId}/media/agents/start`, input),
    onSuccess: refresh,
    onError: mutationError("Room service did not start"),
  });
  const stopAgent = useMutation({
    mutationFn: (sessionId: string) =>
      apiRequest("POST", `/api/community-rooms/${roomId}/media/agents/${sessionId}/stop`, {}),
    onSuccess: refresh,
    onError: mutationError("Room service did not stop"),
  });
  const download = useMutation({
    mutationFn: async (recordingId: string) =>
      (await apiRequest("GET", `/api/community-rooms/${roomId}/media/recordings/${recordingId}/download`)).json() as Promise<{ url: string }>,
    onSuccess: ({ url }) => window.open(url, "_blank", "noopener,noreferrer"),
    onError: mutationError("Recording could not be opened"),
  });

  if (isLoading) return <p className="mt-4 text-xs text-zinc-500">Loading room media…</p>;
  if (error || !data)
    return <p role="alert" className="mt-4 text-xs text-red-300">Room media controls could not be loaded.</p>;

  const activeRecording = data.recordings.find((recording) => activeStatuses.has(recording.status));
  const recordingStatus = activeRecording?.status === "starting"
    ? "Waiting for published audio, video, or a shared screen"
    : activeRecording?.status === "stopping"
      ? "Finalizing the private recording"
      : activeRecording
        ? "Recording is active"
        : "Private MP4 in CreativesOS storage";
  const activeTranscription = data.agentSessions.find(
    (session) => session.kind === "transcription" && activeStatuses.has(session.status),
  );
  const activeAiByProfile = new Map(
    data.agentSessions
      .filter((session) => session.kind === "realtime_ai" && activeStatuses.has(session.status))
      .map((session) => [session.agentProfileId, session]),
  );
  const disabled = data.roomStatus !== "live";
  const copyTranscript = async () => {
    const transcript = data.transcriptSegments
      .map((segment) => {
        const speaker = segment.speakerIdentity.replace(/^creativesos-user-/, "Member ");
        return `[${new Date(segment.createdAt).toLocaleString()}] ${speaker}: ${segment.text}`;
      })
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(transcript);
      toast({ title: "Transcript copied", description: "The visible meeting transcript is ready to paste." });
    } catch {
      toast({ title: "Transcript could not be copied", description: "Your browser blocked clipboard access.", variant: "destructive" });
    }
  };
  const providerRows = [
    { label: "Private recording", ready: data.provider.recordingConfigured },
    { label: "Transcription worker", ready: data.provider.transcriptionAgentConfigured },
    { label: "Signed transcript delivery", ready: data.provider.transcriptIngestConfigured },
    { label: "Realtime AI worker", ready: data.provider.roomAgentConfigured },
  ];

  return (
    <section className={`${compact ? "space-y-3" : "mt-6 space-y-4"}`} aria-labelledby="room-media-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p id="room-media-title" className="flex items-center gap-2 text-sm font-bold">
            <Radio className="h-4 w-4 text-red-400" /> Recording, transcript, and realtime
          </p>
          {!compact && <p className="mt-1 text-xs leading-5 text-zinc-500">Nothing listens or records until the host starts it and every current participant has consented.</p>}
        </div>
        <Badge variant="outline" className="border-zinc-700 text-[10px] text-zinc-400">Consent gated</Badge>
      </div>

      {data.canManage && (
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-900 bg-black p-3">
            <div>
              <p className="text-xs font-semibold text-zinc-200">Private room recording</p>
              <p className="mt-1 text-[11px] text-zinc-500">
                {!data.policy.recordingAllowed ? "Not allowed by room policy" : !data.provider.recordingConfigured ? "Private recording storage pending" : recordingStatus}
              </p>
            </div>
            <Button
              size="sm"
              variant={activeRecording ? "destructive" : "outline"}
              className="h-8 rounded-full"
              disabled={disabled || !data.policy.recordingAllowed || !data.provider.recordingConfigured || startRecording.isPending || stopRecording.isPending}
              onClick={() => activeRecording ? stopRecording.mutate() : startRecording.mutate()}
            >
              {activeRecording ? <><Square className="mr-1.5 h-3 w-3" /> {activeRecording.status === "starting" ? "Cancel" : "Stop"}</> : "Record"}
            </Button>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-900 bg-black p-3">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200"><Captions className="h-3.5 w-3.5 text-cyan-400" /> Live transcription</p>
              <p className="mt-1 text-[11px] text-zinc-500">
                {!data.policy.transcriptionAllowed ? "Not allowed by room policy" : !data.provider.transcriptionAgentConfigured || !data.provider.transcriptIngestConfigured ? "Transcription runtime pending" : activeTranscription ? "Captions and durable final segments are active" : "Realtime captions with final-segment evidence"}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8 rounded-full"
              disabled={disabled || !data.policy.transcriptionAllowed || !data.provider.transcriptionAgentConfigured || !data.provider.transcriptIngestConfigured || startAgent.isPending || stopAgent.isPending}
              onClick={() => activeTranscription ? stopAgent.mutate(activeTranscription.id) : startAgent.mutate({ kind: "transcription" })}
            >
              {activeTranscription ? "Stop" : "Start"}
            </Button>
          </div>

          {data.aiProfiles.filter((profile) => profile.status === "configured").map((profile) => {
            const active = activeAiByProfile.get(profile.id);
            return (
              <div key={profile.id} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-900 bg-black p-3">
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200"><Bot className="h-3.5 w-3.5 text-violet-400" /> {profile.name} <span className="text-violet-400">AI</span></p>
                  <p className="mt-1 text-[11px] text-zinc-500">{profile.role.replaceAll("_", " ")} · {profile.mode.replaceAll("_", " ")}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-full"
                  disabled={disabled || !data.policy.aiAnalysisAllowed || !data.provider.roomAgentConfigured || startAgent.isPending || stopAgent.isPending}
                  onClick={() => active ? stopAgent.mutate(active.id) : startAgent.mutate({ kind: "realtime_ai", profileId: profile.id })}
                >
                  {active ? "Remove" : "Invite"}
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {!compact && data.canManage && providerRows.some((row) => !row.ready) && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <p className="text-xs font-semibold text-zinc-200">Room service readiness</p>
          <p className="mt-1 text-[11px] leading-4 text-zinc-500">CreativesOS is ready to enforce room policy, consent, sessions, and evidence. Services marked provider pending activate after their external worker is connected.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {providerRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between rounded-xl border border-zinc-900 bg-black px-3 py-2">
                <span className="text-[11px] text-zinc-300">{row.label}</span>
                {row.ready ? (
                  <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-300"><CheckCircle2 className="h-3 w-3" /> Ready</span>
                ) : (
                  <span className="text-[10px] font-semibold text-amber-300">Provider pending</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!compact && data.transcriptSegments.length > 0 && (
        <div className="rounded-2xl border border-zinc-800 bg-black p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-zinc-200">Meeting transcript</p>
            <Button size="sm" variant="ghost" className="h-7 rounded-full px-2 text-[10px]" onClick={copyTranscript}>
              <ClipboardCopy className="mr-1.5 h-3 w-3" /> Copy transcript
            </Button>
          </div>
          <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
            {data.transcriptSegments.slice(-100).map((segment) => (
              <div key={segment.id} className="rounded-xl border border-zinc-900 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-cyan-400">{segment.speakerIdentity.replace(/^creativesos-user-/, "Member ")}</p>
                <p className="mt-1 text-xs leading-5 text-zinc-300">{segment.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!compact && data.recordings.filter((recording) => !activeStatuses.has(recording.status)).map((recording) => (
        <div key={recording.id} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-900 bg-black p-3">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold text-zinc-200">
              Room recording
              <Badge variant="outline" className={recording.status === "complete" ? "border-emerald-900 text-[9px] text-emerald-300" : "border-red-900 text-[9px] text-red-300"}>
                {recording.status}
              </Badge>
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">{new Date(recording.createdAt).toLocaleString()}{recording.durationMs ? ` · ${Math.round(recording.durationMs / 1000)} sec` : ""}</p>
            {recording.errorMessage && <p className="mt-1 max-w-md text-[11px] leading-4 text-red-300">{recording.errorMessage}</p>}
          </div>
          {recording.status === "complete" && (
            <Button size="sm" variant="outline" className="h-8 rounded-full" disabled={download.isPending} onClick={() => download.mutate(recording.id)}>
              <Download className="mr-1.5 h-3.5 w-3.5" /> Open
            </Button>
          )}
        </div>
      ))}
    </section>
  );
}
