import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  BrainCircuit,
  Eye,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type Capability = "recording" | "transcription" | "ai_analysis";
type ConsentDecision = "granted" | "declined" | "withdrawn";
type AiMode = "private_copilot" | "visible_participant";
type AiRole =
  | "sales_coach"
  | "facilitator"
  | "guest_researcher"
  | "engagement_analyst"
  | "chief_of_staff"
  | "community_moderator";

type IntelligencePolicy = {
  privateCopilotEnabled: boolean;
  visibleAiEnabled: boolean;
  guestBriefsEnabled: boolean;
  engagementInsightsEnabled: boolean;
  salesCoachingEnabled: boolean;
  recordingAllowed: boolean;
  transcriptionAllowed: boolean;
  aiAnalysisAllowed: boolean;
  disclosureText: string;
  retentionDays: number;
};

function editablePolicy(policy: IntelligencePolicy): IntelligencePolicy {
  return {
    privateCopilotEnabled: policy.privateCopilotEnabled,
    visibleAiEnabled: policy.visibleAiEnabled,
    guestBriefsEnabled: policy.guestBriefsEnabled,
    engagementInsightsEnabled: policy.engagementInsightsEnabled,
    salesCoachingEnabled: policy.salesCoachingEnabled,
    recordingAllowed: policy.recordingAllowed,
    transcriptionAllowed: policy.transcriptionAllowed,
    aiAnalysisAllowed: policy.aiAnalysisAllowed,
    disclosureText: policy.disclosureText,
    retentionDays: policy.retentionDays,
  };
}

type AiProfile = {
  id: string;
  name: string;
  role: AiRole;
  mode: AiMode;
  audienceRole: "owner" | "admin" | "moderator" | "member";
  instructions: string;
  status: "configured" | "paused";
};

type RoomInsight = {
  id: string;
  insightType: string;
  title: string;
  body: string;
  evidence: Array<Record<string, unknown>>;
  confidence: number | null;
  createdAt: string;
};

type RoomIntelligence = {
  policy: IntelligencePolicy;
  canManage: boolean;
  canViewGuestBriefs: boolean;
  membershipRole: string;
  allowedConsentCapabilities: Capability[];
  activeConsentCapabilities: Capability[];
  consents: Array<{
    capability: Capability;
    decision: ConsentDecision;
  }>;
  aiProfiles: AiProfile[];
  insights: RoomInsight[];
  agentRuntime: {
    configured: boolean;
    status: "configured" | "provider_pending";
  };
};

type GuestBrief = {
  userId: number;
  status: string;
  checkedInAt: string | null;
  displayName: string;
  username: string;
  bio: string;
  profileImageUrl: string | null;
  membershipRole: string | null;
  verifiedRoomHistory: {
    roomResponses: number;
    roomCheckIns: number;
  };
  analysis: null;
};

const capabilityLabels: Record<Capability, string> = {
  recording: "Recording",
  transcription: "Live transcription",
  ai_analysis: "AI conversation assistance",
};

const roleLabels: Record<AiRole, string> = {
  sales_coach: "Sales coach",
  facilitator: "Facilitator",
  guest_researcher: "Guest researcher",
  engagement_analyst: "Engagement analyst",
  chief_of_staff: "Chief of staff",
  community_moderator: "Community moderator",
};

const policyOptions: Array<{
  key: keyof Pick<
    IntelligencePolicy,
    | "privateCopilotEnabled"
    | "visibleAiEnabled"
    | "guestBriefsEnabled"
    | "engagementInsightsEnabled"
    | "salesCoachingEnabled"
    | "recordingAllowed"
    | "transcriptionAllowed"
    | "aiAnalysisAllowed"
  >;
  label: string;
  description: string;
}> = [
  {
    key: "privateCopilotEnabled",
    label: "Private copilot",
    description: "Role-scoped prompts visible only to authorized hosts and staff.",
  },
  {
    key: "visibleAiEnabled",
    label: "Visible AI participants",
    description: "Host-invited AI attendees that are clearly named and badged.",
  },
  {
    key: "guestBriefsEnabled",
    label: "Guest briefs",
    description: "Verified profile, RSVP, and community-room history for authorized roles.",
  },
  {
    key: "engagementInsightsEnabled",
    label: "Engagement insights",
    description: "Evidence-linked audience signals and facilitation prompts.",
  },
  {
    key: "salesCoachingEnabled",
    label: "Sales coaching",
    description: "Objection-aware suggestions; the human host keeps final control.",
  },
  {
    key: "recordingAllowed",
    label: "Permit recording",
    description: "Allows a configured provider to request recording consent.",
  },
  {
    key: "transcriptionAllowed",
    label: "Permit transcription",
    description: "Allows a configured provider to request transcription consent.",
  },
  {
    key: "aiAnalysisAllowed",
    label: "Permit AI analysis",
    description: "Allows disclosed AI processing after participant consent.",
  },
];

function humanize(value: string) {
  return value.replaceAll("_", " ");
}

export function RoomIntelligencePanel({
  roomId,
  roomStatus,
}: {
  roomId: string;
  roomStatus: "scheduled" | "live" | "ended" | "canceled";
}) {
  const client = useQueryClient();
  const { toast } = useToast();
  const intelligenceKey = ["/api/community-rooms", roomId, "intelligence"];
  const { data, isLoading, error } = useQuery<RoomIntelligence>({
    queryKey: intelligenceKey,
    queryFn: async () =>
      (await apiRequest("GET", `/api/community-rooms/${roomId}/intelligence`)).json(),
  });
  const [policy, setPolicy] = useState<IntelligencePolicy | null>(null);
  const [agentName, setAgentName] = useState("Meeting copilot");
  const [agentRole, setAgentRole] = useState<AiRole>("facilitator");
  const [agentMode, setAgentMode] = useState<AiMode>("private_copilot");
  const [audienceRole, setAudienceRole] = useState<
    "owner" | "admin" | "moderator" | "member"
  >("owner");
  const [instructions, setInstructions] = useState("");

  useEffect(() => {
    if (data?.policy) setPolicy(editablePolicy(data.policy));
  }, [data?.policy]);

  useEffect(() => {
    if (!policy) return;
    if (
      agentMode === "private_copilot" &&
      !policy.privateCopilotEnabled &&
      policy.visibleAiEnabled
    ) {
      setAgentMode("visible_participant");
    } else if (
      agentMode === "visible_participant" &&
      !policy.visibleAiEnabled &&
      policy.privateCopilotEnabled
    ) {
      setAgentMode("private_copilot");
    }
  }, [agentMode, policy?.privateCopilotEnabled, policy?.visibleAiEnabled]);

  const consentByCapability = useMemo(
    () =>
      new Map(
        (data?.consents ?? []).map((consent) => [
          consent.capability,
          consent.decision,
        ]),
      ),
    [data?.consents],
  );

  const guestBriefs = useQuery<GuestBrief[]>({
    queryKey: ["/api/community-rooms", roomId, "intelligence", "guest-briefs"],
    enabled: data?.canViewGuestBriefs === true && data.policy.guestBriefsEnabled,
    queryFn: async () =>
      (
        await apiRequest(
          "GET",
          `/api/community-rooms/${roomId}/intelligence/guest-briefs`,
        )
      ).json(),
  });

  const savePolicy = useMutation({
    mutationFn: async () => {
      if (!policy) throw new Error("Room policy is still loading");
      return (
        await apiRequest(
          "PUT",
          `/api/community-rooms/${roomId}/intelligence/policy`,
          policy,
        )
      ).json();
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: intelligenceKey });
      toast({
        title: "Room intelligence policy saved",
        description: "Capabilities remain off until consent and the required runtime are present.",
      });
    },
    onError: (mutationError: Error) =>
      toast({
        title: "Policy was not saved",
        description: mutationError.message,
        variant: "destructive",
      }),
  });

  const saveConsent = useMutation({
    mutationFn: async ({
      capability,
      decision,
    }: {
      capability: Capability;
      decision: ConsentDecision;
    }) =>
      (
        await apiRequest(
          "PUT",
          `/api/community-rooms/${roomId}/intelligence/consent`,
          { capability, decision },
        )
      ).json(),
    onSuccess: () => client.invalidateQueries({ queryKey: intelligenceKey }),
    onError: (mutationError: Error) =>
      toast({
        title: "Consent choice was not saved",
        description: mutationError.message,
        variant: "destructive",
      }),
  });

  const addProfile = useMutation({
    mutationFn: async () =>
      (
        await apiRequest(
          "POST",
          `/api/community-rooms/${roomId}/intelligence/ai-profiles`,
          {
            name: agentName,
            role: agentRole,
            mode: agentMode,
            audienceRole,
            instructions,
          },
        )
      ).json(),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: intelligenceKey });
      setInstructions("");
      toast({
        title: "AI role configured",
        description: data?.agentRuntime.configured
          ? "It is ready for the room runtime."
          : "Its permissions are saved; the external agent runtime will be connected later.",
      });
    },
    onError: (mutationError: Error) =>
      toast({
        title: "AI role was not added",
        description: mutationError.message,
        variant: "destructive",
      }),
  });

  const changeProfileStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "configured" | "paused" | "removed" }) =>
      (
        await apiRequest(
          "PATCH",
          `/api/community-rooms/${roomId}/intelligence/ai-profiles/${id}`,
          { status },
        )
      ).json(),
    onSuccess: () => client.invalidateQueries({ queryKey: intelligenceKey }),
  });

  const reviewInsight = useMutation({
    mutationFn: async ({
      id,
      decision,
    }: {
      id: string;
      decision: "accept_note" | "accept_action" | "dismiss";
    }) =>
      (
        await apiRequest(
          "PATCH",
          `/api/community-rooms/${roomId}/intelligence/insights/${id}`,
          { decision },
        )
      ).json(),
    onSuccess: (_result, variables) => {
      client.invalidateQueries({ queryKey: intelligenceKey });
      if (variables.decision === "accept_note")
        client.invalidateQueries({
          queryKey: ["/api/community-rooms", roomId, "notes"],
        });
      if (variables.decision === "accept_action")
        client.invalidateQueries({
          queryKey: ["/api/community-rooms", roomId, "action-items"],
        });
      toast({
        title:
          variables.decision === "dismiss"
            ? "Suggestion dismissed"
            : variables.decision === "accept_note"
              ? "Suggestion saved as a room note"
              : "Suggestion saved as an action item",
        description:
          variables.decision === "dismiss"
            ? "It was removed from the review queue without changing the meeting record."
            : "The human-reviewed result is now part of the durable meeting workspace.",
      });
    },
    onError: (mutationError: Error) =>
      toast({
        title: "Suggestion was not reviewed",
        description: mutationError.message,
        variant: "destructive",
      }),
  });

  if (isLoading)
    return <p className="mt-6 text-sm text-zinc-500">Loading room controls…</p>;
  if (error || !data || !policy)
    return (
      <p role="alert" className="mt-6 rounded-xl border border-red-900 bg-red-950/30 px-4 py-3 text-sm text-red-200">
        Room intelligence controls could not be loaded.
      </p>
    );

  return (
    <section className="mt-6 space-y-5" aria-labelledby="room-intelligence-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p id="room-intelligence-title" className="flex items-center gap-2 text-sm font-bold">
            <BrainCircuit className="h-4 w-4 text-cyan-400" /> Room intelligence
          </p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            Role-scoped meeting support with disclosure, consent, and evidence boundaries.
          </p>
        </div>
        <Badge className={data.agentRuntime.configured ? "bg-emerald-950 text-emerald-300" : "bg-zinc-900 text-zinc-400"}>
          {data.agentRuntime.configured ? "Runtime ready" : "Provider pending"}
        </Badge>
      </div>

      {data.canManage && roomStatus === "scheduled" && (
        <div className="rounded-2xl border border-zinc-800 bg-black p-4">
          <div className="mb-4 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <p className="text-sm font-semibold">Host policy</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {policyOptions.map((option) => (
              <div key={option.key} className="flex items-start justify-between gap-3 rounded-xl border border-zinc-900 p-3">
                <div>
                  <Label htmlFor={`policy-${option.key}`} className="text-xs font-semibold text-zinc-200">
                    {option.label}
                  </Label>
                  <p className="mt-1 text-[11px] leading-4 text-zinc-500">{option.description}</p>
                </div>
                <Switch
                  id={`policy-${option.key}`}
                  checked={policy[option.key]}
                  onCheckedChange={(checked) =>
                    setPolicy((current) =>
                      current ? { ...current, [option.key]: checked } : current,
                    )
                  }
                />
              </div>
            ))}
          </div>
          <Label htmlFor="room-disclosure" className="mt-4 block text-xs text-zinc-300">Participant disclosure</Label>
          <Textarea
            id="room-disclosure"
            value={policy.disclosureText}
            maxLength={2_000}
            onChange={(event) =>
              setPolicy((current) =>
                current ? { ...current, disclosureText: event.target.value } : current,
              )
            }
            className="mt-2 min-h-24 border-zinc-800 bg-zinc-950 text-sm"
          />
          <div className="mt-4 flex items-end gap-3">
            <div className="w-32">
              <Label htmlFor="retention-days" className="text-xs text-zinc-300">Retention days</Label>
              <Input
                id="retention-days"
                type="number"
                min={1}
                max={365}
                value={policy.retentionDays}
                onChange={(event) =>
                  setPolicy((current) =>
                    current
                      ? { ...current, retentionDays: Number(event.target.value) }
                      : current,
                  )
                }
                className="mt-2 border-zinc-800 bg-zinc-950"
              />
            </div>
            <Button
              className="rounded-full bg-white text-black hover:bg-zinc-200"
              disabled={savePolicy.isPending || policy.disclosureText.trim().length < 20}
              onClick={() => savePolicy.mutate()}
            >
              {savePolicy.isPending ? "Saving…" : "Save policy"}
            </Button>
          </div>
        </div>
      )}

      {data.allowedConsentCapabilities.length > 0 && (
        <div className="rounded-2xl border border-zinc-800 bg-black p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <LockKeyhole className="h-4 w-4 text-cyan-400" /> Your permissions
          </p>
          <p className="mt-2 text-xs leading-5 text-zinc-500">{policy.disclosureText}</p>
          <div className="mt-4 space-y-3">
            {data.allowedConsentCapabilities.map((capability) => {
              const decision = consentByCapability.get(capability);
              const active = data.activeConsentCapabilities.includes(capability);
              return (
                <div key={capability} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-900 p-3">
                  <div>
                    <p className="text-xs font-semibold text-zinc-200">{capabilityLabels[capability]}</p>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      {active ? "Active for this room; permission is required to join." : "Permitted by the host, but not active."}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={decision === "granted" ? "default" : "outline"}
                      className="h-8 rounded-full"
                      disabled={saveConsent.isPending}
                      onClick={() => saveConsent.mutate({ capability, decision: "granted" })}
                    >
                      Allow
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-full border-zinc-700 bg-black text-zinc-300"
                      disabled={saveConsent.isPending}
                      onClick={() =>
                        saveConsent.mutate({
                          capability,
                          decision: decision === "granted" ? "withdrawn" : "declined",
                        })
                      }
                    >
                      {decision === "granted" ? "Withdraw" : "Decline"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(policy.privateCopilotEnabled || policy.visibleAiEnabled) && (
        <div className="rounded-2xl border border-zinc-800 bg-black p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-semibold"><Bot className="h-4 w-4 text-violet-400" /> AI room roster</p>
            <Badge variant="outline" className="border-zinc-700 text-[10px] text-zinc-400">AI is always labeled</Badge>
          </div>
          {data.aiProfiles.length === 0 ? (
            <p className="mt-3 text-xs text-zinc-500">No AI roles have been configured for this room.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {data.aiProfiles.map((profile) => (
                <div key={profile.id} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-900 p-3">
                  <div>
                    <p className="text-xs font-semibold text-zinc-200">{profile.name} <span className="ml-1 text-violet-400">AI</span></p>
                    <p className="mt-1 text-[11px] text-zinc-500">{roleLabels[profile.role]} · {humanize(profile.mode)} · {profile.audienceRole}+ only</p>
                  </div>
                  {data.canManage && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 rounded-full text-xs text-zinc-400"
                      onClick={() => changeProfileStatus.mutate({ id: profile.id, status: profile.status === "paused" ? "configured" : "paused" })}
                    >
                      {profile.status === "paused" ? "Resume" : "Pause"}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {data.canManage && ["scheduled", "live"].includes(roomStatus) && (
            <div className="mt-4 border-t border-zinc-900 pt-4">
              <p className="text-xs font-semibold text-zinc-300">Configure an AI role</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Input value={agentName} maxLength={80} onChange={(event) => setAgentName(event.target.value)} placeholder="AI participant name" className="border-zinc-800 bg-zinc-950" />
                <Select value={agentRole} onValueChange={(value) => setAgentRole(value as AiRole)}>
                  <SelectTrigger className="border-zinc-800 bg-zinc-950"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(roleLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={agentMode} onValueChange={(value) => setAgentMode(value as AiMode)}>
                  <SelectTrigger className="border-zinc-800 bg-zinc-950"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {policy.privateCopilotEnabled && <SelectItem value="private_copilot">Private copilot</SelectItem>}
                    {policy.visibleAiEnabled && <SelectItem value="visible_participant">Visible participant</SelectItem>}
                  </SelectContent>
                </Select>
                <Select value={audienceRole} onValueChange={(value) => setAudienceRole(value as typeof audienceRole)}>
                  <SelectTrigger className="border-zinc-800 bg-zinc-950"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">Owners only</SelectItem>
                    <SelectItem value="admin">Admins and owners</SelectItem>
                    <SelectItem value="moderator">Moderators and above</SelectItem>
                    <SelectItem value="member">All room members</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Textarea value={instructions} maxLength={5_000} onChange={(event) => setInstructions(event.target.value)} placeholder="Optional role instructions and boundaries" className="mt-3 min-h-20 border-zinc-800 bg-zinc-950" />
              <Button className="mt-3 rounded-full bg-white text-black hover:bg-zinc-200" disabled={!agentName.trim() || addProfile.isPending} onClick={() => addProfile.mutate()}>
                {addProfile.isPending ? "Adding…" : "Add AI role"}
              </Button>
            </div>
          )}
        </div>
      )}

      {data.canViewGuestBriefs && policy.guestBriefsEnabled && (
        <div className="rounded-2xl border border-zinc-800 bg-black p-4">
          <p className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4 text-amber-400" /> Guest briefs</p>
          <p className="mt-1 text-xs text-zinc-500">Verified CreativesOS facts only. No inferred diagnoses or hidden personality claims.</p>
          {guestBriefs.isLoading ? (
            <p className="mt-3 text-xs text-zinc-500">Loading attendee context…</p>
          ) : guestBriefs.data?.length ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {guestBriefs.data.map((guest) => (
                <div key={guest.userId} className="rounded-xl border border-zinc-900 p-3">
                  <p className="text-xs font-semibold text-zinc-200">{guest.displayName || guest.username}</p>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-zinc-500">{guest.bio || "No profile context provided."}</p>
                  <p className="mt-2 text-[10px] uppercase tracking-wide text-zinc-600">{guest.verifiedRoomHistory.roomCheckIns} check-ins · {guest.status}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-xs text-zinc-500">Guest context appears after members RSVP or check in.</p>
          )}
        </div>
      )}

      {(policy.engagementInsightsEnabled || policy.salesCoachingEnabled) && (
        <div className="rounded-2xl border border-zinc-800 bg-black p-4">
          <p className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-cyan-400" /> Evidence-backed suggestions</p>
          {data.insights.length === 0 ? (
            <p className="mt-2 text-xs leading-5 text-zinc-500">No suggestions yet. The system never invents audience sentiment or objections when it has no attributable evidence.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {data.insights.map((insight) => (
                <article key={insight.id} className="rounded-xl border border-zinc-900 p-3">
                  <p className="flex items-center gap-2 text-xs font-semibold text-zinc-200"><Eye className="h-3.5 w-3.5" /> {insight.title}</p>
                  <p className="mt-1 text-xs leading-5 text-zinc-400">{insight.body}</p>
                  <p className="mt-2 text-[10px] uppercase tracking-wide text-zinc-600">Draft · {insight.evidence.length} evidence item{insight.evidence.length === 1 ? "" : "s"}</p>
                  {data.canManage && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        className="h-8 rounded-full bg-white px-3 text-xs text-black hover:bg-zinc-200"
                        disabled={reviewInsight.isPending}
                        onClick={() =>
                          reviewInsight.mutate({
                            id: insight.id,
                            decision: "accept_note",
                          })
                        }
                      >
                        Save as note
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-full border-zinc-700 bg-black px-3 text-xs text-zinc-200 hover:bg-zinc-900"
                        disabled={reviewInsight.isPending}
                        onClick={() =>
                          reviewInsight.mutate({
                            id: insight.id,
                            decision: "accept_action",
                          })
                        }
                      >
                        Create action
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 rounded-full px-3 text-xs text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
                        disabled={reviewInsight.isPending}
                        onClick={() =>
                          reviewInsight.mutate({
                            id: insight.id,
                            decision: "dismiss",
                          })
                        }
                      >
                        Dismiss
                      </Button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
