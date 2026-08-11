import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  AlertTriangle,
  AtSign,
  BarChart3,
  Bot,
  CheckCheck,
  ChevronDown,
  Clock3,
  Download,
  GitMerge,
  Inbox,
  Mail,
  MessageCircle,
  Mic,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  Video,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useLocation } from "wouter";
import MessagePanel from "@/components/messages/MessagePanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type Business = { id: string; name: string; isDefault?: boolean };
type QueueItem = [id: string, label: string, icon: LucideIcon, count: number];
type Relationship = {
  id: string;
  displayName: string;
  avatarUrl?: string | null;
  lifecycleStage: string;
  status: string;
  aiSummary?: string | null;
  locale?: string | null;
  timezone?: string | null;
};
type Conversation = {
  id: string;
  title: string;
  status: string;
  priority: string;
  queue: string;
  aiMode: string;
  updatedAt: string;
  lastMessageAt?: string | null;
  relationship?: Relationship | null;
  assignedToUserId?: number | null;
};
type Binding = {
  id: string;
  connectionId?: string | null;
  provider: string;
  externalThreadId: string;
  status: string;
};
type Message = {
  id: string;
  direction: "inbound" | "outbound";
  authorType: string;
  provider: string;
  body: string;
  status: string;
  messageType: string;
  syntheticMedia: boolean;
  disclosure?: string | null;
  occurredAt: string;
  attachments?: Array<{ id: string; attachmentType: string; sourceUrl?: string | null; mimeType?: string | null; durationMs?: number | null }>;
};
type Suggestion = { id: string; suggestionType: string; title: string; body: string; confidence?: number | null };
type ConversationDetail = Conversation & {
  relationship: Relationship | null;
  bindings: Binding[];
  messages: Message[];
  notes: Array<{ id: string; body: string; createdAt: string }>;
  suggestions: Suggestion[];
};
type ProviderStatus = {
  adapters: Array<{ provider: string; capabilities: Record<string, boolean> }>;
  connections: Array<{ id: string; provider: string; providerAccountName: string; status: string; lastErrorCode?: string | null }>;
  permissions: { canAdminister: boolean };
  configuration?: {
    instagram?: { configured: boolean; requiredScopes: string[]; webhookPath: string };
    messenger?: { configured: boolean; requiredScopes: string[]; webhookPath: string };
    whatsapp?: { configured: boolean; connectionMode: string; webhookPath: string };
    x?: { configured: boolean; requiredScopes: string[]; webhookPathTemplate: string; pollingFallback: boolean };
  };
};
type HubSummary = { relationships: number; conversations: number; openConversations: number; queuedDeliveries: number; pendingAiSuggestions: number };
type AiStatus = { provider: string; configured: boolean; model: string; mode: string };
type VoiceProfile = { id: string; provider: string; displayName: string; status: string; ownershipVerificationStatus: string; disclosureText: string };
type VoiceProviderStatus = { provider: string; configured: boolean };
type CurrentUser = { id: number; username?: string };
type RelationshipDetail = Relationship & {
  identities: Array<{ id: string; provider: string; username?: string | null; address?: string | null; verificationStatus: string }>;
  tags: Array<{ id: string; name: string; color?: string | null }>;
  tasks: Array<{ id: string; title: string; body: string; status: string; priority: string; dueAt?: string | null }>;
  memories: Array<{ id: string; factType: string; value: unknown; status: string; confidence?: number | null }>;
  consents: Array<{ id: string; channel: string; purpose: string; status: string; source: string; updatedAt: string }>;
};
type MergeCandidate = { id: string; reason: string; confidence: number; sourceRelationship: Relationship | null; targetRelationship: Relationship | null };
type OperationsSnapshot = {
  periodStart: string;
  policy: { planKey: string; enforcementMode: string; maxActiveConnections: number; providerPayloadRetentionDays: number; auditRetentionDays: number; realtimeArtifactRetentionDays: number };
  capacity: Record<string, { used: number; reserved: number; limit: number }>;
  connections: Record<string, number>;
  deliveries: Record<string, number>;
  providerEvents: Record<string, number>;
  alerts: Array<{ id: string; severity: string; title: string; detail: string; status: string }>;
};
type AgentPolicy = { id: string; agentKey: string; role: string; mode: "observe" | "suggest" | "approval" | "delegated"; instructions: string; allowedActions: string[]; approvalRequiredActions: string[]; blockedActions: string[]; channelAllowlist: string[]; maxCostUnitsPerRun: number };
type CommunityRoom = { id: string; communityId: number; title: string; status: string; startsAt: string; provider: string };
type RelationshipRoomBinding = { id: string; roomId: string; room: CommunityRoom };
type RelationshipTimeline = { relationshipId: string; items: Array<{ id: string; type: string; occurredAt: string; title: string; body: string; metadata: Record<string, unknown> }> };

const voiceConsentText = "I attest that I own this voice or am the person represented by it, I authorize CreativesOS to generate disclosed voice messages using this profile, and I understand that I can revoke this authorization at any time.";

async function jsonRequest<T>(method: string, url: string, body?: unknown) {
  const response = await apiRequest(method, url, body);
  return response.json() as Promise<T>;
}

const providerIcons: Record<string, typeof MessageCircle> = {
  native: MessageCircle,
  instagram: AtSign,
  messenger: MessageCircle,
  whatsapp: MessageCircle,
  x: AtSign,
  email: Mail,
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}

function relativeTime(value?: string | null) {
  if (!value) return "";
  const delta = Date.now() - new Date(value).getTime();
  if (delta < 60_000) return "now";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h`;
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function memoryText(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "text" in value && typeof (value as { text?: unknown }).text === "string") return (value as { text: string }).text;
  return "Review the linked conversation evidence before accepting this memory.";
}

export default function MessagesPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const initializedBusiness = useRef<string | null>(null);
  const [legacyMode, setLegacyMode] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [queue, setQueue] = useState("open");
  const [composer, setComposer] = useState("");
  const [noteMode, setNoteMode] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [whatsappPhoneNumberId, setWhatsappPhoneNumberId] = useState("");
  const [whatsappWabaId, setWhatsappWabaId] = useState("");
  const [whatsappAccessToken, setWhatsappAccessToken] = useState("");
  const [whatsappAccountName, setWhatsappAccountName] = useState("");
  const [voiceDisplayName, setVoiceDisplayName] = useState("My verified voice");
  const [providerVoiceId, setProviderVoiceId] = useState("");
  const [voiceAttested, setVoiceAttested] = useState(false);
  const [voiceProfileId, setVoiceProfileId] = useState("");
  const [voiceScript, setVoiceScript] = useState("");
  const [voiceUseCase, setVoiceUseCase] = useState("relationship_follow_up");
  const [tagName, setTagName] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [operationsOpen, setOperationsOpen] = useState(false);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [meetingRoomId, setMeetingRoomId] = useState("");
  const [consentOpen, setConsentOpen] = useState(false);
  const [consentChannel, setConsentChannel] = useState("native");
  const [consentStatus, setConsentStatus] = useState<"unknown" | "granted" | "denied" | "withdrawn">("granted");
  const [consentEvidence, setConsentEvidence] = useState("");
  const [governanceOpen, setGovernanceOpen] = useState(false);
  const [agentMode, setAgentMode] = useState<AgentPolicy["mode"]>("approval");
  const [agentInstructions, setAgentInstructions] = useState("");
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [timelineOpen, setTimelineOpen] = useState(false);

  const businesses = useQuery<Business[]>({ queryKey: ["/api/businesses"] });
  const currentUser = useQuery<CurrentUser>({ queryKey: ["/api/user"] });
  const business = useMemo(() => businesses.data?.find((item) => item.isDefault) ?? businesses.data?.[0], [businesses.data]);
  const businessQuery = business ? `?businessId=${business.id}` : "";

  const initializeNative = useMutation({
    mutationFn: () => jsonRequest<{ synchronizedConversations: number }>("POST", "/api/relationship-hub/native/initialize", { businessId: business!.id }),
    onSuccess: async () => {
      // Initialization races the first page queries on a new account. Force an
      // immediate refresh so the native channel appears as soon as the server
      // commits it instead of waiting for the polling interval.
      await Promise.all([
        queryClient.refetchQueries({ queryKey: [`/api/relationship-hub/conversations${businessQuery}`] }),
        queryClient.refetchQueries({ queryKey: [`/api/relationship-hub/summary${businessQuery}`] }),
        queryClient.refetchQueries({ queryKey: [`/api/relationship-hub/providers${businessQuery}`] }),
      ]);
    },
  });

  useEffect(() => {
    if (!business || initializedBusiness.current === business.id) return;
    initializedBusiness.current = business.id;
    initializeNative.mutate();
  }, [business?.id]);

  const conversations = useQuery<Conversation[]>({
    queryKey: [`/api/relationship-hub/conversations${businessQuery}`],
    enabled: Boolean(business),
    refetchInterval: 5_000,
  });
  const summary = useQuery<HubSummary>({
    queryKey: [`/api/relationship-hub/summary${businessQuery}`],
    enabled: Boolean(business),
    refetchInterval: 10_000,
  });
  const providers = useQuery<ProviderStatus>({
    queryKey: [`/api/relationship-hub/providers${businessQuery}`],
    enabled: Boolean(business),
    refetchInterval: 30_000,
  });
  const aiStatus = useQuery<AiStatus>({
    queryKey: [`/api/relationship-hub/ai/status${businessQuery}`],
    enabled: Boolean(business),
  });
  const voiceProfiles = useQuery<VoiceProfile[]>({
    queryKey: [`/api/relationship-hub/voice-profiles${businessQuery}`],
    enabled: Boolean(business),
  });
  const voiceProviders = useQuery<VoiceProviderStatus[]>({
    queryKey: [`/api/relationship-hub/voice-providers${businessQuery}`],
    enabled: Boolean(business),
  });
  const operations = useQuery<OperationsSnapshot>({
    queryKey: [`/api/relationship-hub/operations${businessQuery}`],
    enabled: Boolean(business),
    refetchInterval: operationsOpen ? 10_000 : 60_000,
  });
  const mergeCandidates = useQuery<MergeCandidate[]>({
    queryKey: [`/api/relationship-hub/merge-candidates${businessQuery}`],
    enabled: Boolean(business && operationsOpen),
  });
  const agentPolicies = useQuery<AgentPolicy[]>({
    queryKey: [`/api/relationship-hub/agent-policies${businessQuery}`],
    enabled: Boolean(business),
  });
  const relationshipDirectory = useQuery<Relationship[]>({
    queryKey: [`/api/relationship-hub/relationships${businessQuery}`],
    enabled: Boolean(business && mergeOpen),
  });

  useEffect(() => {
    const policy = agentPolicies.data?.find((item) => item.agentKey === "relationship-copilot");
    if (!policy) return;
    setAgentMode(policy.mode);
    setAgentInstructions(policy.instructions);
  }, [agentPolicies.data]);

  const filteredConversations = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (conversations.data ?? []).filter((conversation) => {
      if (queue === "mine" && conversation.assignedToUserId !== currentUser.data?.id) return false;
      if (queue === "unassigned" && conversation.assignedToUserId != null) return false;
      if (queue === "ai" && conversation.aiMode === "observe") return false;
      if (queue === "open" && !["open", "pending"].includes(conversation.status)) return false;
      return !needle || conversation.title.toLowerCase().includes(needle) || conversation.relationship?.displayName.toLowerCase().includes(needle);
    });
  }, [conversations.data, currentUser.data?.id, queue, search]);

  useEffect(() => {
    if (selectedId && filteredConversations.some((conversation) => conversation.id === selectedId)) return;
    setSelectedId(filteredConversations[0]?.id ?? null);
  }, [filteredConversations, selectedId]);

  const detail = useQuery<ConversationDetail>({
    queryKey: [`/api/relationship-hub/conversations/${selectedId}`],
    enabled: Boolean(selectedId),
    refetchInterval: 3_000,
  });
  const relationshipDetail = useQuery<RelationshipDetail>({
    queryKey: [`/api/relationship-hub/relationships/${detail.data?.relationship?.id}`],
    enabled: Boolean(detail.data?.relationship?.id),
  });
  const relationshipRooms = useQuery<RelationshipRoomBinding[]>({
    queryKey: [`/api/relationship-hub/relationships/${detail.data?.relationship?.id}/rooms`],
    enabled: Boolean(detail.data?.relationship?.id),
  });
  const eligibleRooms = useQuery<CommunityRoom[]>({
    queryKey: [`/api/relationship-hub/relationships/${detail.data?.relationship?.id}/eligible-rooms`],
    enabled: Boolean(detail.data?.relationship?.id && meetingOpen),
  });
  const relationshipTimeline = useQuery<RelationshipTimeline>({
    queryKey: [`/api/relationship-hub/relationships/${detail.data?.relationship?.id}/timeline`],
    enabled: Boolean(detail.data?.relationship?.id && timelineOpen),
  });
  const invalidateRelationshipTimeline = () => {
    const relationshipId = detail.data?.relationship?.id;
    if (relationshipId) void queryClient.invalidateQueries({ queryKey: [`/api/relationship-hub/relationships/${relationshipId}/timeline`] });
  };

  const sendMessage = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("Choose a conversation first");
      if (noteMode) return jsonRequest("POST", `/api/relationship-hub/conversations/${selectedId}/notes`, { body: composer });
      return jsonRequest("POST", `/api/relationship-hub/conversations/${selectedId}/messages`, { body: composer });
    },
    onSuccess: () => {
      setComposer("");
      void queryClient.invalidateQueries({ queryKey: [`/api/relationship-hub/conversations/${selectedId}`] });
      void queryClient.invalidateQueries({ queryKey: [`/api/relationship-hub/conversations${businessQuery}`] });
      invalidateRelationshipTimeline();
    },
    onError: (error) => toast({ title: "Message not sent", description: error instanceof Error ? error.message : "Try again", variant: "destructive" }),
  });

  const updateConversation = useMutation({
    mutationFn: (body: Record<string, unknown>) => jsonRequest("PATCH", `/api/relationship-hub/conversations/${selectedId}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [`/api/relationship-hub/conversations/${selectedId}`] });
      void queryClient.invalidateQueries({ queryKey: [`/api/relationship-hub/conversations${businessQuery}`] });
    },
  });

  const requestAiSuggestions = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error("Choose a conversation first");
      if (!aiStatus.data?.configured) throw new Error("The AI provider has not been configured for this deployment");
      if (detail.data?.aiMode === "observe") await jsonRequest("PATCH", `/api/relationship-hub/conversations/${selectedId}`, { aiMode: "suggest" });
      return jsonRequest("POST", `/api/relationship-hub/conversations/${selectedId}/ai/suggestions`, { agentKey: "relationship-copilot" });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [`/api/relationship-hub/conversations/${selectedId}`] });
      void queryClient.invalidateQueries({ queryKey: [`/api/relationship-hub/conversations${businessQuery}`] });
      void queryClient.invalidateQueries({ queryKey: [`/api/relationship-hub/summary${businessQuery}`] });
      invalidateRelationshipTimeline();
      toast({ title: "Suggestions ready", description: "Every recommendation remains reviewable before it changes anything." });
    },
    onError: (error) => toast({ title: "AI assistant unavailable", description: error instanceof Error ? error.message : "Try again", variant: "destructive" }),
  });

  const reviewSuggestion = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "approve" | "reject" }) => jsonRequest("POST", `/api/relationship-hub/suggestions/${id}/review`, { decision }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [`/api/relationship-hub/conversations/${selectedId}`] });
      void queryClient.invalidateQueries({ queryKey: [`/api/relationship-hub/conversations${businessQuery}`] });
      void queryClient.invalidateQueries({ queryKey: [`/api/relationship-hub/summary${businessQuery}`] });
      invalidateRelationshipTimeline();
    },
    onError: (error) => toast({ title: "Suggestion not applied", description: error instanceof Error ? error.message : "Try again", variant: "destructive" }),
  });

  useEffect(() => {
    const active = voiceProfiles.data?.find((profile) => profile.status === "active");
    if (active && !voiceProfileId) setVoiceProfileId(active.id);
  }, [voiceProfileId, voiceProfiles.data]);

  const enrollVoice = useMutation({
    mutationFn: async () => {
      if (!business) throw new Error("Choose a business first");
      if (!voiceAttested) throw new Error("The voice owner attestation is required");
      const profile = await jsonRequest<VoiceProfile>("POST", "/api/relationship-hub/voice-profiles", { businessId: business.id, provider: "elevenlabs", displayName: voiceDisplayName, cloneType: "professional", allowedUseCases: ["relationship_follow_up", "customer_support", "community_update", "meeting_recap", "sales_follow_up"], blockedUseCases: [] });
      return jsonRequest<VoiceProfile>("POST", `/api/relationship-hub/voice-profiles/${profile.id}/verify`, { providerVoiceId, ownerAttestation: true, consentText: voiceConsentText });
    },
    onSuccess: (profile) => {
      setVoiceProfileId(profile.id);
      setProviderVoiceId("");
      void queryClient.invalidateQueries({ queryKey: [`/api/relationship-hub/voice-profiles${businessQuery}`] });
      toast({ title: "Voice profile verified", description: "It can now create disclosed voice messages after your approval." });
    },
    onError: (error) => toast({ title: "Voice setup not completed", description: error instanceof Error ? error.message : "Try again", variant: "destructive" }),
  });

  const sendVoice = useMutation({
    mutationFn: () => {
      if (!selectedId || !voiceProfileId) throw new Error("Choose a verified voice profile");
      return jsonRequest("POST", `/api/relationship-hub/conversations/${selectedId}/voice-messages`, { profileId: voiceProfileId, script: voiceScript, useCase: voiceUseCase, sourceType: "human" });
    },
    onSuccess: () => {
      setVoiceOpen(false);
      setVoiceScript("");
      void queryClient.invalidateQueries({ queryKey: [`/api/relationship-hub/conversations/${selectedId}`] });
      toast({ title: "Voice message queued", description: "The generated audio is labeled, privately stored, and sent through this conversation." });
    },
    onError: (error) => toast({ title: "Voice message not sent", description: error instanceof Error ? error.message : "Try again", variant: "destructive" }),
  });

  const updateRelationship = useMutation({
    mutationFn: (body: Record<string, unknown>) => jsonRequest("PATCH", `/api/relationship-hub/relationships/${detail.data?.relationship?.id}`, body),
    onSuccess: () => {
      void relationshipDetail.refetch();
      void detail.refetch();
      void conversations.refetch();
      invalidateRelationshipTimeline();
    },
  });

  const addRelationshipTag = useMutation({
    mutationFn: () => jsonRequest("POST", `/api/relationship-hub/relationships/${detail.data?.relationship?.id}/tags`, { name: tagName }),
    onSuccess: () => { setTagName(""); void relationshipDetail.refetch(); invalidateRelationshipTimeline(); },
  });

  const removeRelationshipTag = useMutation({
    mutationFn: (tagId: string) => apiRequest("DELETE", `/api/relationship-hub/relationships/${detail.data?.relationship?.id}/tags/${tagId}`),
    onSuccess: () => { void relationshipDetail.refetch(); invalidateRelationshipTimeline(); },
  });

  const addRelationshipTask = useMutation({
    mutationFn: () => jsonRequest("POST", `/api/relationship-hub/relationships/${detail.data?.relationship?.id}/tasks`, { title: taskTitle, body: "", priority: "normal" }),
    onSuccess: () => { setTaskTitle(""); void relationshipDetail.refetch(); invalidateRelationshipTimeline(); },
  });

  const completeRelationshipTask = useMutation({
    mutationFn: (taskId: string) => jsonRequest("PATCH", `/api/relationship-hub/tasks/${taskId}`, { status: "completed" }),
    onSuccess: () => { void relationshipDetail.refetch(); invalidateRelationshipTimeline(); },
  });

  const recordConsent = useMutation({
    mutationFn: () => {
      const relationshipId = detail.data?.relationship?.id;
      if (!relationshipId) throw new Error("Choose a relationship first");
      return jsonRequest("POST", `/api/relationship-hub/relationships/${relationshipId}/consents`, { channel: consentChannel, purpose: "messaging", status: consentStatus, evidenceNote: consentEvidence });
    },
    onSuccess: () => {
      setConsentOpen(false);
      setConsentEvidence("");
      void relationshipDetail.refetch();
      invalidateRelationshipTimeline();
      toast({ title: "Consent evidence recorded", description: "Automations will use the latest reviewed communication state." });
    },
    onError: (error) => toast({ title: "Consent not recorded", description: error instanceof Error ? error.message : "Try again", variant: "destructive" }),
  });

  const reviewMemory = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "accept" | "reject" }) => jsonRequest("POST", `/api/relationship-hub/memories/${id}/review`, { decision }),
    onSuccess: () => { void relationshipDetail.refetch(); invalidateRelationshipTimeline(); },
    onError: (error) => toast({ title: "Memory not reviewed", description: error instanceof Error ? error.message : "Try again", variant: "destructive" }),
  });

  const reviewMerge = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: "merge" | "reject" }) => jsonRequest("POST", `/api/relationship-hub/merge-candidates/${id}/review`, { decision }),
    onSuccess: () => {
      void mergeCandidates.refetch();
      void conversations.refetch();
      void relationshipDetail.refetch();
      invalidateRelationshipTimeline();
    },
    onError: (error) => toast({ title: "Identity review not completed", description: error instanceof Error ? error.message : "Try again", variant: "destructive" }),
  });

  const mergeCurrentRelationship = useMutation({
    mutationFn: async () => {
      const sourceId = detail.data?.relationship?.id;
      if (!sourceId || !mergeTargetId) throw new Error("Choose the record that should remain");
      const candidate = await jsonRequest<{ id: string }>("POST", `/api/relationship-hub/relationships/${sourceId}/merge-candidates`, { targetRelationshipId: mergeTargetId, reason: "Operator confirmed these records represent the same relationship", confidence: 1 });
      return jsonRequest("POST", `/api/relationship-hub/merge-candidates/${candidate.id}/review`, { decision: "merge" });
    },
    onSuccess: () => {
      setMergeOpen(false);
      setMergeTargetId("");
      setSelectedId(null);
      void conversations.refetch();
      void mergeCandidates.refetch();
      toast({ title: "Relationship records merged", description: "Identities, conversations, consent, tasks, notes, tags, and reviewed memory now share one canonical record." });
    },
    onError: (error) => toast({ title: "Records not merged", description: error instanceof Error ? error.message : "Try again", variant: "destructive" }),
  });

  const saveAgentPolicy = useMutation({
    mutationFn: () => jsonRequest("POST", "/api/relationship-hub/agent-policies", {
      businessId: business?.id,
      agentKey: "relationship-copilot",
      role: "Relationship copilot",
      mode: agentMode,
      allowedActions: ["message.send", "relationship.summary.propose", "relationship.task.propose", "relationship.note.propose", "relationship.escalate.propose"],
      approvalRequiredActions: ["message.send", "relationship.summary.propose", "relationship.task.propose", "relationship.note.propose", "relationship.escalate.propose"],
      blockedActions: [],
      channelAllowlist: [],
      maxCostUnitsPerRun: 100,
      instructions: agentInstructions,
    }),
    onSuccess: () => {
      setGovernanceOpen(false);
      void agentPolicies.refetch();
      toast({ title: "AI authority saved", description: "External actions remain human-approved under this policy." });
    },
    onError: (error) => toast({ title: "AI authority not saved", description: error instanceof Error ? error.message : "Try again", variant: "destructive" }),
  });

  const acknowledgeAlert = useMutation({
    mutationFn: (alertId: string) => jsonRequest("POST", `/api/relationship-hub/operations/alerts/${alertId}/acknowledge`, { businessId: business?.id }),
    onSuccess: () => void operations.refetch(),
    onError: (error) => toast({ title: "Alert not acknowledged", description: error instanceof Error ? error.message : "Try again", variant: "destructive" }),
  });

  const bindRelationshipRoom = useMutation({
    mutationFn: () => {
      if (!detail.data?.relationship?.id || !meetingRoomId) throw new Error("Choose a meeting room");
      return jsonRequest("POST", `/api/relationship-hub/relationships/${detail.data.relationship.id}/rooms`, { roomId: meetingRoomId, conversationId: selectedId, purpose: "relationship_meeting", contextPolicy: { includeTimeline: true, includePrivateNotes: false } });
    },
    onSuccess: () => {
      setMeetingOpen(false);
      setMeetingRoomId("");
      void relationshipRooms.refetch();
      invalidateRelationshipTimeline();
      toast({ title: "Meeting linked", description: "The governed room AI can use this relationship timeline as untrusted evidence, subject to room consent and role policy." });
    },
    onError: (error) => toast({ title: "Meeting not linked", description: error instanceof Error ? error.message : "Try again", variant: "destructive" }),
  });

  const connectInstagram = useMutation({
    mutationFn: () => jsonRequest<{ url: string }>("POST", "/api/relationship-hub/connections/instagram/authorize", { businessId: business?.id }),
    onSuccess: ({ url }) => { window.location.assign(url); },
    onError: (error) => toast({ title: "Instagram connection unavailable", description: error instanceof Error ? error.message : "Try again", variant: "destructive" }),
  });

  const connectX = useMutation({
    mutationFn: () => jsonRequest<{ url: string }>("POST", "/api/relationship-hub/connections/x/authorize", { businessId: business?.id }),
    onSuccess: ({ url }) => { window.location.assign(url); },
    onError: (error) => toast({ title: "X connection unavailable", description: error instanceof Error ? error.message : "Try again", variant: "destructive" }),
  });

  const connectMessenger = useMutation({
    mutationFn: () => jsonRequest<{ url: string }>("POST", "/api/relationship-hub/connections/messenger/authorize", { businessId: business?.id }),
    onSuccess: ({ url }) => { window.location.assign(url); },
    onError: (error) => toast({ title: "Messenger connection unavailable", description: error instanceof Error ? error.message : "Try again", variant: "destructive" }),
  });

  const connectWhatsApp = useMutation({
    mutationFn: () => jsonRequest("POST", "/api/relationship-hub/connections/whatsapp", { businessId: business?.id, phoneNumberId: whatsappPhoneNumberId, wabaId: whatsappWabaId || undefined, accessToken: whatsappAccessToken, accountName: whatsappAccountName || undefined }),
    onSuccess: () => {
      setWhatsappOpen(false); setWhatsappPhoneNumberId(""); setWhatsappWabaId(""); setWhatsappAccessToken(""); setWhatsappAccountName("");
      void providers.refetch();
      toast({ title: "WhatsApp connected", description: "Messages can now enter the unified inbox after the Meta webhook is subscribed." });
    },
    onError: (error) => toast({ title: "WhatsApp connection unavailable", description: error instanceof Error ? error.message : "Try again", variant: "destructive" }),
  });

  if (legacyMode) {
    return <main className="h-dvh bg-black text-white"><MessagePanel onClose={() => { setLegacyMode(false); void conversations.refetch(); }} /></main>;
  }

  const activeProviders = providers.data?.connections.filter((connection) => connection.status === "active") ?? [];
  const canAdminister = providers.data?.permissions.canAdminister === true;
  const activeBinding = detail.data?.bindings.find((binding) => binding.status === "active");
  const ActiveProviderIcon = providerIcons[activeBinding?.provider ?? "native"] ?? MessageCircle;

  return (
    <main className="flex h-dvh overflow-hidden bg-black text-white">
      <aside className="hidden w-56 shrink-0 border-r border-zinc-900 bg-[#050505] px-3 py-4 lg:flex lg:flex-col">
        <div className="flex items-center gap-3 px-2">
          <Button variant="ghost" size="icon" className="text-zinc-400 hover:bg-zinc-900 hover:text-white" onClick={() => setLocation("/")}><ArrowLeft className="h-5 w-5" /></Button>
          <div><p className="text-sm font-black">Relationship Hub</p><p className="text-[10px] text-zinc-600">{business?.name ?? "CreativesOS"}</p></div>
        </div>
        <nav className="mt-6 space-y-1">
          {([
            ["open", "Inbox", Inbox, summary.data?.openConversations ?? 0],
            ["mine", "Mine", UserRound, 0],
            ["unassigned", "Unassigned", Users, 0],
            ["ai", "AI managed", Bot, summary.data?.pendingAiSuggestions ?? 0],
          ] satisfies QueueItem[]).map(([id, label, Icon, count]) => (
            <button key={String(id)} onClick={() => setQueue(String(id))} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm ${queue === id ? "bg-zinc-900 font-bold text-white" : "text-zinc-500 hover:bg-zinc-950 hover:text-zinc-200"}`}>
              <Icon className="h-4 w-4" /><span className="flex-1">{String(label)}</span>{Number(count) > 0 && <span className="rounded-full bg-[#1d9bf0] px-2 py-0.5 text-[10px] font-bold text-white">{Number(count)}</span>}
            </button>
          ))}
        </nav>
        <div className="mt-7 px-3"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-700">Channels</p></div>
        <div className="mt-2 space-y-2 px-2">
          {activeProviders.map((connection) => {
            const Icon = providerIcons[connection.provider] ?? MessageCircle;
            return <div key={connection.id} className="flex items-center gap-2 text-xs text-zinc-400"><span className="grid h-7 w-7 place-items-center rounded-full bg-zinc-900"><Icon className="h-3.5 w-3.5" /></span><span className="truncate">{connection.providerAccountName}</span><span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-400" /></div>;
          })}
          {!activeProviders.length && <p className="text-xs leading-5 text-zinc-600">Connecting the native inbox…</p>}
          {!activeProviders.some((connection) => connection.provider === "instagram") && <button onClick={() => connectInstagram.mutate()} disabled={!canAdminister || connectInstagram.isPending || !providers.data?.configuration?.instagram?.configured} className="flex w-full items-center gap-2 rounded-xl border border-dashed border-zinc-800 px-2 py-2 text-left text-[10px] text-zinc-500 disabled:opacity-50"><span className="grid h-7 w-7 place-items-center rounded-full bg-zinc-900"><AtSign className="h-3.5 w-3.5" /></span><span>{providers.data?.configuration?.instagram?.configured ? "Connect Instagram" : "Instagram setup pending"}</span></button>}
          {!activeProviders.some((connection) => connection.provider === "messenger") && <button onClick={() => connectMessenger.mutate()} disabled={!canAdminister || connectMessenger.isPending || !providers.data?.configuration?.messenger?.configured} className="flex w-full items-center gap-2 rounded-xl border border-dashed border-zinc-800 px-2 py-2 text-left text-[10px] text-zinc-500 disabled:opacity-50"><span className="grid h-7 w-7 place-items-center rounded-full bg-zinc-900"><MessageCircle className="h-3.5 w-3.5" /></span><span>{providers.data?.configuration?.messenger?.configured ? "Connect Messenger" : "Messenger setup pending"}</span></button>}
          {!activeProviders.some((connection) => connection.provider === "whatsapp") && <button onClick={() => setWhatsappOpen(true)} disabled={!canAdminister || !providers.data?.configuration?.whatsapp?.configured} className="flex w-full items-center gap-2 rounded-xl border border-dashed border-zinc-800 px-2 py-2 text-left text-[10px] text-zinc-500 disabled:opacity-50"><span className="grid h-7 w-7 place-items-center rounded-full bg-zinc-900"><MessageCircle className="h-3.5 w-3.5" /></span><span>{providers.data?.configuration?.whatsapp?.configured ? "Connect WhatsApp" : "WhatsApp setup pending"}</span></button>}
          {!activeProviders.some((connection) => connection.provider === "x") && <button onClick={() => connectX.mutate()} disabled={!canAdminister || connectX.isPending || !providers.data?.configuration?.x?.configured} className="flex w-full items-center gap-2 rounded-xl border border-dashed border-zinc-800 px-2 py-2 text-left text-[10px] text-zinc-500 disabled:opacity-50"><span className="grid h-7 w-7 place-items-center rounded-full bg-zinc-900"><AtSign className="h-3.5 w-3.5" /></span><span>{providers.data?.configuration?.x?.configured ? "Connect X" : "X setup pending"}</span></button>}
        </div>
        <div className="mt-auto rounded-2xl border border-zinc-900 bg-zinc-950 p-3">
          <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-400" /><p className="text-xs font-bold">Governed AI</p></div>
          <p className="mt-2 text-[10px] leading-4 text-zinc-600">Agent actions follow the authority and approval policy for this business.</p>
          <div className="mt-3 flex flex-wrap gap-3"><button onClick={() => setLocation("/automations")} className="text-[10px] font-bold text-[#1d9bf0]">Automations</button>{canAdminister && <button onClick={() => setGovernanceOpen(true)} className="text-[10px] font-bold text-[#1d9bf0]">AI policy</button>}<button onClick={() => setOperationsOpen(true)} className="text-[10px] font-bold text-[#1d9bf0]">Usage & health</button></div>
        </div>
      </aside>

      <section className={`${selectedId ? "hidden md:flex" : "flex"} w-full shrink-0 flex-col border-r border-zinc-900 md:w-[340px] xl:w-[380px]`}>
        <header className="border-b border-zinc-900 px-4 pb-3 pt-4">
          <div className="flex items-center gap-2"><Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setLocation("/")}><ArrowLeft className="h-5 w-5" /></Button><h1 className="flex-1 text-xl font-black">Inbox</h1><Button variant="ghost" size="icon" className="text-zinc-400 hover:bg-zinc-900" onClick={() => setLegacyMode(true)} title="Start or manage native chats"><Plus className="h-5 w-5" /></Button></div>
          <div className="relative mt-3"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search people and conversations" className="h-10 rounded-xl border-zinc-900 bg-zinc-950 pl-9 text-sm" /></div>
          <div className="mt-3 flex gap-2 overflow-x-auto [scrollbar-width:none]">
            {["open", "mine", "unassigned", "ai"].map((item) => <button key={item} onClick={() => setQueue(item)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold capitalize ${queue === item ? "bg-white text-black" : "bg-zinc-950 text-zinc-500"}`}>{item}</button>)}
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">
          {conversations.isLoading || initializeNative.isPending ? <div className="p-8 text-center text-sm text-zinc-600">Loading the unified inbox…</div> : filteredConversations.length ? filteredConversations.map((conversation) => (
            <button key={conversation.id} onClick={() => setSelectedId(conversation.id)} className={`flex w-full gap-3 border-b border-zinc-950 px-4 py-4 text-left transition ${selectedId === conversation.id ? "bg-zinc-950" : "hover:bg-zinc-950/60"}`}>
              <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-[#1d9bf0] to-violet-500 text-xs font-black">{conversation.relationship?.avatarUrl ? <img src={conversation.relationship.avatarUrl} alt="" className="h-full w-full object-cover" /> : initials(conversation.relationship?.displayName ?? conversation.title)}</div>
              <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate text-sm font-bold">{conversation.relationship?.displayName ?? conversation.title}</p><span className="ml-auto text-[10px] text-zinc-700">{relativeTime(conversation.lastMessageAt ?? conversation.updatedAt)}</span></div><p className="mt-1 truncate text-xs text-zinc-500">{conversation.relationship?.aiSummary || `${conversation.queue === "unassigned" ? "Unassigned" : "Conversation"} · ${conversation.status}`}</p><div className="mt-2 flex items-center gap-1.5"><span className="rounded-full bg-zinc-900 px-2 py-0.5 text-[9px] font-bold capitalize text-zinc-500">{conversation.priority}</span>{conversation.aiMode !== "observe" && <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[9px] font-bold text-violet-300">AI {conversation.aiMode}</span>}</div></div>
            </button>
          )) : <div className="px-8 py-20 text-center"><Inbox className="mx-auto h-8 w-8 text-zinc-800" /><p className="mt-4 text-sm font-bold text-zinc-400">No matching conversations</p><p className="mt-2 text-xs leading-5 text-zinc-700">Start a native chat or connect another messaging channel.</p><Button className="mt-5 rounded-full" onClick={() => setLegacyMode(true)}>Start native chat</Button></div>}
        </div>
      </section>

      <section className={`${selectedId ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>
        {detail.data ? <>
          <header className="flex h-16 items-center gap-3 border-b border-zinc-900 px-4">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSelectedId(null)}><ArrowLeft className="h-5 w-5" /></Button>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-[#1d9bf0] to-violet-500 text-[10px] font-black">{initials(detail.data.relationship?.displayName ?? detail.data.title)}</div>
            <div className="min-w-0"><p className="truncate text-sm font-bold">{detail.data.relationship?.displayName ?? detail.data.title}</p><div className="flex items-center gap-1 text-[10px] text-zinc-600"><ActiveProviderIcon className="h-3 w-3" /><span className="capitalize">{activeBinding?.provider ?? "native"}</span><span>·</span><span className="capitalize">{detail.data.status}</span></div></div>
            <div className="ml-auto flex items-center gap-1"><Button onClick={() => setTimelineOpen(true)} variant="ghost" size="icon" className="text-zinc-500" title="Relationship timeline"><Clock3 className="h-4 w-4" /></Button><Button variant="ghost" size="sm" className="hidden rounded-full text-xs text-zinc-400 sm:flex" onClick={() => updateConversation.mutate({ status: detail.data.status === "closed" ? "open" : "closed" })}>{detail.data.status === "closed" ? "Reopen" : "Close"}</Button><Button onClick={() => setOperationsOpen(true)} variant="ghost" size="icon" className="text-zinc-500" title="Relationship Hub controls"><MoreHorizontal className="h-5 w-5" /></Button></div>
          </header>
          <div className="flex-1 overflow-y-auto px-4 py-5 md:px-8">
            <div className="mx-auto max-w-3xl space-y-4">
              {detail.data.messages.map((message) => (
                <div key={message.id} className={`flex ${message.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-5 ${message.direction === "outbound" ? "rounded-br-md bg-[#1d9bf0] text-white" : "rounded-bl-md bg-zinc-900 text-zinc-100"}`}>
                    {message.syntheticMedia && <div className="mb-2 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide opacity-70"><Sparkles className="h-3 w-3" />AI-generated voice</div>}
                    <p className="whitespace-pre-wrap">{message.body}</p>
                    {message.attachments?.filter((attachment) => ["audio", "voice_note"].includes(attachment.attachmentType) && attachment.sourceUrl).map((attachment) => <audio key={attachment.id} controls preload="metadata" src={attachment.sourceUrl!} className="mt-2 h-10 w-full max-w-64" />)}
                    {message.disclosure && <p className="mt-2 text-[9px] opacity-60">{message.disclosure}</p>}
                    <div className={`mt-1.5 flex items-center justify-end gap-1 text-[9px] ${message.direction === "outbound" ? "text-white/60" : "text-zinc-600"}`}><span>{new Date(message.occurredAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>{message.direction === "outbound" && <CheckCheck className="h-3 w-3" />}</div>
                  </div>
                </div>
              ))}
              {detail.data.notes.map((note) => <div key={note.id} className="mx-auto max-w-lg rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-100"><p className="font-bold text-amber-400">Internal note</p><p className="mt-1 leading-5">{note.body}</p></div>)}
              {!detail.data.messages.length && <div className="py-20 text-center text-sm text-zinc-700">This conversation has no messages yet.</div>}
            </div>
          </div>
          <footer className="border-t border-zinc-900 bg-black px-4 py-3 md:px-8">
            <div className="mx-auto max-w-3xl">
              <div className="mb-2 flex items-center gap-2"><button onClick={() => setNoteMode(false)} className={`rounded-full px-3 py-1 text-[10px] font-bold ${!noteMode ? "bg-zinc-800 text-white" : "text-zinc-600"}`}>Reply</button><button onClick={() => setNoteMode(true)} className={`rounded-full px-3 py-1 text-[10px] font-bold ${noteMode ? "bg-amber-500/15 text-amber-300" : "text-zinc-600"}`}>Internal note</button><span className="ml-auto text-[9px] text-zinc-700">Sending via {activeBinding?.provider ?? "native"}</span></div>
              <div className={`rounded-2xl border p-2 ${noteMode ? "border-amber-500/30 bg-amber-500/5" : "border-zinc-800 bg-zinc-950"}`}>
                <Textarea value={composer} onChange={(event) => setComposer(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (composer.trim()) sendMessage.mutate(); } }} placeholder={noteMode ? "Leave a note for your team…" : "Reply to this conversation…"} className="min-h-16 resize-none border-0 bg-transparent text-sm focus-visible:ring-0" />
                <div className="flex items-center gap-1"><Button onClick={() => requestAiSuggestions.mutate()} disabled={requestAiSuggestions.isPending} variant="ghost" size="icon" className="text-zinc-500" title={aiStatus.data?.configured ? "Generate governed AI suggestions" : "AI provider setup pending"}><Sparkles className={`h-4 w-4 ${requestAiSuggestions.isPending ? "animate-pulse text-violet-300" : ""}`} /></Button><Button onClick={() => setVoiceOpen(true)} variant="ghost" size="icon" className="text-zinc-500" title="Create a verified voice message"><Mic className="h-4 w-4" /></Button><Button onClick={() => sendMessage.mutate()} disabled={!composer.trim() || sendMessage.isPending} size="sm" className={`ml-auto rounded-full ${noteMode ? "bg-amber-300 text-black hover:bg-amber-200" : "bg-white text-black hover:bg-zinc-200"}`}><Send className="mr-1 h-3.5 w-3.5" />{noteMode ? "Add note" : "Send"}</Button></div>
              </div>
            </div>
          </footer>
        </> : selectedId ? <div className="grid flex-1 place-items-center text-sm text-zinc-700">Loading conversation…</div> : <div className="grid flex-1 place-items-center"><div className="text-center"><MessageCircle className="mx-auto h-10 w-10 text-zinc-800" /><p className="mt-4 text-sm font-bold text-zinc-500">Choose a conversation</p></div></div>}
      </section>

      {detail.data && <aside className="hidden w-72 shrink-0 overflow-y-auto border-l border-zinc-900 bg-[#050505] p-5 xl:block">
        <div className="text-center"><div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-[#1d9bf0] to-violet-500 text-lg font-black">{initials(detail.data.relationship?.displayName ?? detail.data.title)}</div><p className="mt-3 font-black">{detail.data.relationship?.displayName ?? detail.data.title}</p><p className="mt-1 text-xs capitalize text-zinc-600">{detail.data.relationship?.lifecycleStage ?? "Contact"}</p></div>
        <div className="mt-6 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-zinc-950 p-2"><p className="text-sm font-black">{detail.data.messages.length}</p><p className="text-[9px] text-zinc-600">Messages</p></div><div className="rounded-xl bg-zinc-950 p-2"><p className="text-sm font-black">{detail.data.bindings.length}</p><p className="text-[9px] text-zinc-600">Channels</p></div><div className="rounded-xl bg-zinc-950 p-2"><p className="text-sm font-black">{detail.data.suggestions.length}</p><p className="text-[9px] text-zinc-600">Insights</p></div></div>
        <div className="mt-6"><div className="flex items-center"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-700">AI relationship brief</p><Sparkles className="ml-auto h-3.5 w-3.5 text-violet-400" /></div><p className="mt-3 text-xs leading-5 text-zinc-400">{detail.data.relationship?.aiSummary || "AI will build an evidence-linked brief as this relationship develops. Inferences remain reviewable and never become hidden facts."}</p></div>
        {detail.data.suggestions.length > 0 && <div className="mt-6 space-y-2"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-700">Suggested next actions</p>{detail.data.suggestions.map((suggestion) => <div key={suggestion.id} className="rounded-xl border border-violet-500/15 bg-violet-500/5 p-3"><div className="flex items-center gap-2"><Bot className="h-3.5 w-3.5 text-violet-300" /><p className="text-xs font-bold">{suggestion.title}</p></div><p className="mt-2 text-[10px] leading-4 text-zinc-500">{suggestion.body}</p><div className="mt-3 flex gap-2"><button disabled={reviewSuggestion.isPending} onClick={() => reviewSuggestion.mutate({ id: suggestion.id, decision: "approve" })} className="rounded-full bg-white px-3 py-1 text-[9px] font-black text-black">{suggestion.suggestionType === "reply" ? "Approve & send" : "Apply"}</button><button disabled={reviewSuggestion.isPending} onClick={() => reviewSuggestion.mutate({ id: suggestion.id, decision: "reject" })} className="rounded-full px-3 py-1 text-[9px] font-bold text-zinc-600 hover:text-white">Dismiss</button></div></div>)}</div>}
        {relationshipDetail.data && <>
          <div className="mt-6"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-700">Lifecycle</p><select value={relationshipDetail.data.lifecycleStage} onChange={(event) => updateRelationship.mutate({ lifecycleStage: event.target.value })} className="mt-3 h-9 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 text-xs text-white"><option value="new">New</option><option value="engaged">Engaged</option><option value="lead">Lead</option><option value="customer">Customer</option><option value="partner">Partner</option><option value="alumni">Alumni</option></select></div>
          <div className="mt-6"><div className="flex items-center"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-700">Known identities</p><button onClick={() => setMergeOpen(true)} className="ml-auto text-[10px] font-bold text-[#1d9bf0]">Merge duplicate</button></div><div className="mt-3 space-y-2">{relationshipDetail.data.identities.map((identity) => <div key={identity.id} className="rounded-xl bg-zinc-950 px-3 py-2 text-[10px]"><span className="font-bold capitalize text-zinc-300">{identity.provider}</span><span className="ml-2 text-zinc-600">{identity.username || identity.address || "Verified identity"}</span></div>)}</div></div>
          <div className="mt-6"><div className="flex items-center"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-700">Communication consent</p><button onClick={() => { setConsentChannel(activeBinding?.provider ?? "native"); setConsentOpen(true); }} className="ml-auto text-[10px] font-bold text-[#1d9bf0]">Record</button></div><div className="mt-3 space-y-2">{relationshipDetail.data.consents.map((consent) => <div key={consent.id} className="flex items-center rounded-xl bg-zinc-950 px-3 py-2 text-[10px]"><span className="font-bold capitalize text-zinc-300">{consent.channel}</span><span className={`ml-auto rounded-full px-2 py-0.5 font-bold capitalize ${consent.status === "granted" ? "bg-emerald-500/10 text-emerald-300" : consent.status === "withdrawn" || consent.status === "denied" ? "bg-red-500/10 text-red-300" : "bg-zinc-900 text-zinc-500"}`}>{consent.status}</span></div>)}{!relationshipDetail.data.consents.length && <p className="text-[10px] leading-4 text-zinc-600">No explicit communication consent evidence has been recorded. Customer STOP/START commands update this automatically.</p>}</div></div>
          {relationshipDetail.data.memories.some((memory) => memory.status === "proposed") && <div className="mt-6"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-700">Review AI memory</p><div className="mt-3 space-y-2">{relationshipDetail.data.memories.filter((memory) => memory.status === "proposed").map((memory) => <div key={memory.id} className="rounded-xl border border-violet-500/15 bg-violet-500/5 p-3"><p className="text-[9px] font-bold uppercase tracking-wide text-violet-300">{memory.factType}</p><p className="mt-1 text-[10px] leading-4 text-zinc-400">{memoryText(memory.value)}</p><div className="mt-2 flex gap-2"><button onClick={() => reviewMemory.mutate({ id: memory.id, decision: "accept" })} disabled={reviewMemory.isPending} className="rounded-full bg-white px-2.5 py-1 text-[9px] font-black text-black">Accept</button><button onClick={() => reviewMemory.mutate({ id: memory.id, decision: "reject" })} disabled={reviewMemory.isPending} className="rounded-full px-2.5 py-1 text-[9px] font-bold text-zinc-600 hover:text-white">Reject</button></div></div>)}</div></div>}
          <div className="mt-6"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-700">Tags</p><div className="mt-3 flex flex-wrap gap-1.5">{relationshipDetail.data.tags.map((tag) => <button key={tag.id} onClick={() => removeRelationshipTag.mutate(tag.id)} title="Remove tag" className="rounded-full bg-zinc-900 px-2.5 py-1 text-[9px] font-bold text-zinc-400 hover:text-red-300">{tag.name} ×</button>)}</div><div className="mt-2 flex gap-2"><Input value={tagName} onChange={(event) => setTagName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && tagName.trim()) addRelationshipTag.mutate(); }} placeholder="Add tag" className="h-8 border-zinc-800 bg-zinc-950 text-xs" /><Button onClick={() => addRelationshipTag.mutate()} disabled={!tagName.trim() || addRelationshipTag.isPending} size="sm" variant="outline" className="h-8 border-zinc-800 bg-black"><Plus className="h-3.5 w-3.5" /></Button></div></div>
          <div className="mt-6"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-700">Follow-up tasks</p><div className="mt-3 space-y-2">{relationshipDetail.data.tasks.filter((task) => task.status === "open").map((task) => <button key={task.id} onClick={() => completeRelationshipTask.mutate(task.id)} className="flex w-full items-start gap-2 rounded-xl bg-zinc-950 px-3 py-2 text-left text-[10px] text-zinc-400"><span className="mt-0.5 h-3 w-3 shrink-0 rounded-full border border-zinc-600" /><span>{task.title}</span></button>)}</div><div className="mt-2 flex gap-2"><Input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && taskTitle.trim()) addRelationshipTask.mutate(); }} placeholder="Add follow-up" className="h-8 border-zinc-800 bg-zinc-950 text-xs" /><Button onClick={() => addRelationshipTask.mutate()} disabled={!taskTitle.trim() || addRelationshipTask.isPending} size="sm" variant="outline" className="h-8 border-zinc-800 bg-black"><Plus className="h-3.5 w-3.5" /></Button></div></div>
          <div className="mt-6"><div className="flex items-center"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-700">Relationship meetings</p><button onClick={() => setMeetingOpen(true)} className="ml-auto text-[10px] font-bold text-[#1d9bf0]">Link room</button></div><div className="mt-3 space-y-2">{relationshipRooms.data?.map((binding) => <button key={binding.id} onClick={() => setLocation(`/communities/${binding.room.communityId}/rooms/${binding.room.id}`)} className="flex w-full items-center gap-2 rounded-xl bg-zinc-950 px-3 py-2 text-left"><Video className="h-4 w-4 text-violet-300" /><span className="truncate text-[10px] text-zinc-300">{binding.room.title}</span><span className="ml-auto text-[9px] capitalize text-zinc-600">{binding.room.status}</span></button>)}{!relationshipRooms.data?.length && <p className="text-[10px] leading-4 text-zinc-600">Link a native community room to give consent-gated meeting AI this relationship context.</p>}</div></div>
        </>}
        <div className="mt-6"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-700">Channels</p><div className="mt-3 space-y-2">{detail.data.bindings.map((binding) => { const Icon = providerIcons[binding.provider] ?? MessageCircle; return <div key={binding.id} className="flex items-center gap-2 rounded-xl bg-zinc-950 px-3 py-2"><Icon className="h-4 w-4 text-zinc-500" /><span className="text-xs capitalize">{binding.provider}</span><span className="ml-auto h-1.5 w-1.5 rounded-full bg-emerald-400" /></div>; })}</div></div>
        <div className="mt-6"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-700">Conversation controls</p><div className="mt-3 space-y-2"><button onClick={() => updateConversation.mutate({ assignedToUserId: detail.data.assignedToUserId === currentUser.data?.id ? null : currentUser.data?.id, queue: detail.data.assignedToUserId === currentUser.data?.id ? "unassigned" : "mine" })} className="flex w-full items-center rounded-xl bg-zinc-950 px-3 py-2.5 text-left text-xs"><UserRound className="mr-2 h-4 w-4 text-[#1d9bf0]" />{detail.data.assignedToUserId === currentUser.data?.id ? "Unassign from me" : "Assign to me"}</button><button onClick={() => updateConversation.mutate({ aiMode: detail.data.aiMode === "observe" ? "suggest" : "observe" })} className="flex w-full items-center rounded-xl bg-zinc-950 px-3 py-2.5 text-left text-xs"><Bot className="mr-2 h-4 w-4 text-violet-300" />AI mode: <span className="ml-1 capitalize text-zinc-400">{detail.data.aiMode}</span><ChevronDown className="ml-auto h-3.5 w-3.5 text-zinc-700" /></button><button onClick={() => updateConversation.mutate({ status: "snoozed", snoozedUntil: new Date(Date.now() + 24 * 60 * 60_000).toISOString() })} className="flex w-full items-center rounded-xl bg-zinc-950 px-3 py-2.5 text-left text-xs"><Clock3 className="mr-2 h-4 w-4 text-zinc-500" />Snooze 24 hours</button><button onClick={() => updateConversation.mutate({ status: detail.data.status === "closed" ? "open" : "closed" })} className="flex w-full items-center rounded-xl bg-zinc-950 px-3 py-2.5 text-left text-xs"><CheckCheck className="mr-2 h-4 w-4 text-emerald-400" />{detail.data.status === "closed" ? "Reopen conversation" : "Close conversation"}</button></div></div>
      </aside>}

      <Dialog open={operationsOpen} onOpenChange={setOperationsOpen}>
        <DialogContent className="border-zinc-800 bg-zinc-950 text-white sm:max-w-xl">
          <DialogHeader><DialogTitle>Relationship Hub usage & health</DialogTitle><DialogDescription className="text-zinc-500">Current billing-period capacity and durable delivery signals for {business?.name ?? "this business"}.</DialogDescription></DialogHeader>
          <div className="grid grid-cols-2 gap-3">{Object.entries(operations.data?.capacity ?? {}).map(([metric, value]) => { const unlimited = value.limit < 0; const committed = value.used + value.reserved; const ratio = unlimited || value.limit === 0 ? 0 : Math.min(100, Math.round((committed / value.limit) * 100)); return <div key={metric} className="rounded-xl border border-zinc-800 bg-black p-3"><div className="flex items-center gap-2"><BarChart3 className="h-3.5 w-3.5 text-[#1d9bf0]" /><p className="text-[10px] font-bold capitalize text-zinc-400">{metric.replaceAll(".", " ")}</p></div><p className="mt-2 text-lg font-black">{value.used.toLocaleString()}<span className="ml-1 text-[10px] font-normal text-zinc-600">/ {unlimited ? "unlimited" : value.limit.toLocaleString()}</span></p>{value.reserved > 0 && <p className="mt-1 text-[9px] font-semibold text-amber-300">{value.reserved.toLocaleString()} reserved in active work</p>}<div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-900"><div className={`h-full rounded-full ${ratio >= 90 ? "bg-red-400" : ratio >= 75 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${ratio}%` }} /></div></div>; })}</div>
          <div className="rounded-xl border border-zinc-800 bg-black p-3 text-xs text-zinc-400"><div className="flex justify-between"><span>Plan / enforcement</span><strong className="capitalize text-white">{operations.data?.policy.planKey ?? "standard"} · {operations.data?.policy.enforcementMode ?? "enforce"}</strong></div><div className="mt-2 flex justify-between"><span>Active connections</span><strong className="text-white">{operations.data?.connections.active ?? 0} / {(operations.data?.policy.maxActiveConnections ?? -1) < 0 ? "unlimited" : operations.data?.policy.maxActiveConnections}</strong></div><div className="mt-2 flex justify-between"><span>Queued or retrying deliveries</span><strong className="text-white">{(operations.data?.deliveries.queued ?? 0) + (operations.data?.deliveries.retrying ?? 0)}</strong></div><div className="mt-2 flex justify-between"><span>Dead-letter deliveries</span><strong className={(operations.data?.deliveries.dead_letter ?? 0) > 0 ? "text-red-300" : "text-white"}>{operations.data?.deliveries.dead_letter ?? 0}</strong></div><div className="mt-2 flex justify-between"><span>Retention</span><strong className="text-white">payload {operations.data?.policy.providerPayloadRetentionDays ?? 30}d · audit {operations.data?.policy.auditRetentionDays ?? 365}d</strong></div></div>
          {(operations.data?.alerts.length ?? 0) > 0 ? <div className="space-y-2">{operations.data?.alerts.map((alert) => <div key={alert.id} className="flex gap-3 rounded-xl border border-amber-900/50 bg-amber-950/20 p-3"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /><div className="min-w-0 flex-1"><p className="text-xs font-bold text-amber-100">{alert.title}</p><p className="mt-1 text-[10px] leading-4 text-amber-200/60">{alert.detail}</p>{alert.status === "open" && <button onClick={() => acknowledgeAlert.mutate(alert.id)} disabled={acknowledgeAlert.isPending} className="mt-2 text-[9px] font-bold text-amber-200 hover:text-white">Acknowledge</button>}{alert.status === "acknowledged" && <p className="mt-2 text-[9px] font-bold uppercase tracking-wide text-amber-400/50">Acknowledged · awaiting recovery</p>}</div></div>)}</div> : <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 p-3 text-xs text-emerald-200">No unresolved Relationship Hub operational alerts.</div>}
          {(mergeCandidates.data?.length ?? 0) > 0 && <div className="space-y-2"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-600">Identity review</p>{mergeCandidates.data?.map((candidate) => <div key={candidate.id} className="rounded-xl border border-zinc-800 bg-black p-3"><div className="flex items-center gap-2"><GitMerge className="h-4 w-4 text-violet-300" /><p className="text-xs font-bold">{candidate.sourceRelationship?.displayName ?? "Unknown contact"} may be {candidate.targetRelationship?.displayName ?? "another contact"}</p></div><p className="mt-2 text-[10px] leading-4 text-zinc-500">{candidate.reason} · {Math.round(candidate.confidence * 100)}% confidence</p><div className="mt-3 flex gap-2"><button onClick={() => reviewMerge.mutate({ id: candidate.id, decision: "merge" })} disabled={reviewMerge.isPending} className="rounded-full bg-white px-3 py-1 text-[9px] font-black text-black">Merge records</button><button onClick={() => reviewMerge.mutate({ id: candidate.id, decision: "reject" })} disabled={reviewMerge.isPending} className="rounded-full px-3 py-1 text-[9px] font-bold text-zinc-600 hover:text-white">Keep separate</button></div></div>)}</div>}
          {canAdminister && <div className="grid grid-cols-2 gap-2"><button onClick={() => { setOperationsOpen(false); setGovernanceOpen(true); }} className="flex items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-black px-3 py-3 text-xs font-bold text-zinc-300 hover:text-white"><ShieldCheck className="h-4 w-4" />AI policy</button><a href={`/api/relationship-hub/export${businessQuery}`} download className="flex items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-black px-3 py-3 text-xs font-bold text-zinc-300 hover:border-zinc-700 hover:text-white"><Download className="h-4 w-4" />Export data</a></div>}
        </DialogContent>
      </Dialog>
      <Dialog open={governanceOpen} onOpenChange={setGovernanceOpen}>
        <DialogContent className="border-zinc-800 bg-zinc-950 text-white sm:max-w-lg">
          <DialogHeader><DialogTitle>Relationship AI authority</DialogTitle><DialogDescription className="text-zinc-500">Choose how the relationship copilot can assist. Customer messages remain untrusted evidence and all external actions remain reviewable.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <label className="block text-xs font-bold text-zinc-400">Operating mode<select value={agentMode} onChange={(event) => setAgentMode(event.target.value as AgentPolicy["mode"])} className="mt-2 h-10 w-full rounded-md border border-zinc-800 bg-black px-3 text-sm text-white"><option value="observe">Observe only</option><option value="suggest">Suggest actions</option><option value="approval">Act only after approval</option><option value="delegated">Delegated within policy</option></select></label>
            <label className="block text-xs font-bold text-zinc-400">Business guidance<Textarea value={agentInstructions} onChange={(event) => setAgentInstructions(event.target.value)} maxLength={20000} placeholder="Tone, escalation rules, service standards, and relationship goals…" className="mt-2 min-h-32 border-zinc-800 bg-black text-white" /></label>
            <div className="rounded-xl border border-violet-900/50 bg-violet-950/20 p-3 text-[11px] leading-5 text-violet-200">This screen never grants hidden psychological profiling, secret access, or unrestricted sending. Replies, notes, tasks, summaries, and escalations stay on the explicit action allowlist and require human approval.</div>
            <Button onClick={() => saveAgentPolicy.mutate()} disabled={saveAgentPolicy.isPending} className="w-full bg-white text-black hover:bg-zinc-200">{saveAgentPolicy.isPending ? "Saving…" : "Save governed authority"}</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={consentOpen} onOpenChange={(open) => { setConsentOpen(open); if (!open) setConsentEvidence(""); }}>
        <DialogContent className="border-zinc-800 bg-zinc-950 text-white sm:max-w-lg">
          <DialogHeader><DialogTitle>Record communication consent</DialogTitle><DialogDescription className="text-zinc-500">Capture what the contact explicitly communicated. CreativesOS will not treat a vague note as permission.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <label className="block text-xs font-bold text-zinc-400">Channel<Input value={consentChannel} onChange={(event) => setConsentChannel(event.target.value)} maxLength={100} className="mt-2 border-zinc-800 bg-black text-white" /></label>
            <label className="block text-xs font-bold text-zinc-400">State<select value={consentStatus} onChange={(event) => setConsentStatus(event.target.value as typeof consentStatus)} className="mt-2 h-10 w-full rounded-md border border-zinc-800 bg-black px-3 text-sm text-white"><option value="granted">Granted</option><option value="withdrawn">Withdrawn</option><option value="denied">Denied</option><option value="unknown">Unknown</option></select></label>
            <label className="block text-xs font-bold text-zinc-400">Evidence note<Textarea value={consentEvidence} onChange={(event) => setConsentEvidence(event.target.value)} maxLength={2000} placeholder={consentStatus === "granted" ? "Where and when did the contact explicitly agree?" : "What did the contact communicate?"} className="mt-2 min-h-24 border-zinc-800 bg-black text-white" /></label>
            <div className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-3 text-[11px] leading-5 text-amber-200">Granted consent requires specific evidence. A denied or withdrawn state immediately blocks automated replies on this channel.</div>
            <Button onClick={() => recordConsent.mutate()} disabled={!consentChannel.trim() || (consentStatus === "granted" && consentEvidence.trim().length < 10) || recordConsent.isPending} className="w-full bg-white text-black hover:bg-zinc-200">{recordConsent.isPending ? "Recording…" : "Record reviewed state"}</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={mergeOpen} onOpenChange={(open) => { setMergeOpen(open); if (!open) setMergeTargetId(""); }}>
        <DialogContent className="border-zinc-800 bg-zinc-950 text-white sm:max-w-lg">
          <DialogHeader><DialogTitle>Merge duplicate relationship</DialogTitle><DialogDescription className="text-zinc-500">Choose the canonical record that should remain. The current record will be archived after its identities and history move.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <label className="block text-xs font-bold text-zinc-400">Canonical record<select value={mergeTargetId} onChange={(event) => setMergeTargetId(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-zinc-800 bg-black px-3 text-sm text-white"><option value="">Choose another relationship</option>{relationshipDirectory.data?.filter((relationship) => relationship.id !== detail.data?.relationship?.id && relationship.status === "active").map((relationship) => <option key={relationship.id} value={relationship.id}>{relationship.displayName} · {relationship.lifecycleStage}</option>)}</select></label>
            <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-3 text-[11px] leading-5 text-red-200">This combines identities, consent, conversations, notes, tasks, tags, and reviewed AI memory. It cannot be automatically undone. Verify that both records are the same person or organization.</div>
            <Button onClick={() => mergeCurrentRelationship.mutate()} disabled={!mergeTargetId || mergeCurrentRelationship.isPending} className="w-full bg-white text-black hover:bg-zinc-200"><GitMerge className="mr-2 h-4 w-4" />{mergeCurrentRelationship.isPending ? "Merging…" : "Confirm canonical merge"}</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={timelineOpen} onOpenChange={setTimelineOpen}>
        <DialogContent className="max-h-[85vh] overflow-hidden border-zinc-800 bg-zinc-950 text-white sm:max-w-2xl">
          <DialogHeader><DialogTitle>Canonical relationship timeline</DialogTitle><DialogDescription className="text-zinc-500">Messages across every channel, consent changes, team notes, tasks, and governed record actions in one chronology.</DialogDescription></DialogHeader>
          <div className="max-h-[62vh] space-y-2 overflow-y-auto pr-1 [scrollbar-width:none]">{relationshipTimeline.isLoading ? <p className="py-12 text-center text-sm text-zinc-600">Loading relationship history…</p> : relationshipTimeline.data?.items.length ? relationshipTimeline.data.items.map((item) => <div key={item.id} className="rounded-xl border border-zinc-800 bg-black p-3"><div className="flex items-start gap-3"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.type === "message" ? "bg-[#1d9bf0]" : item.type === "consent" ? "bg-emerald-400" : item.type === "note" ? "bg-amber-400" : item.type === "task" ? "bg-violet-400" : "bg-zinc-600"}`} /><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="text-xs font-bold capitalize text-zinc-200">{item.title}</p><span className="ml-auto shrink-0 text-[9px] text-zinc-700">{new Date(item.occurredAt).toLocaleString()}</span></div>{item.body && <p className="mt-2 whitespace-pre-wrap text-[11px] leading-5 text-zinc-500">{item.body}</p>}</div></div></div>) : <p className="py-12 text-center text-sm text-zinc-600">No relationship activity yet.</p>}</div>
        </DialogContent>
      </Dialog>
      <Dialog open={meetingOpen} onOpenChange={(open) => { setMeetingOpen(open); if (!open) setMeetingRoomId(""); }}>
        <DialogContent className="border-zinc-800 bg-zinc-950 text-white sm:max-w-lg">
          <DialogHeader><DialogTitle>Link a relationship meeting</DialogTitle><DialogDescription className="text-zinc-500">Choose a room you manage. Its existing recording, transcription, and AI consent rules remain authoritative.</DialogDescription></DialogHeader>
          <div className="space-y-4"><select value={meetingRoomId} onChange={(event) => setMeetingRoomId(event.target.value)} className="h-11 w-full rounded-xl border border-zinc-800 bg-black px-3 text-sm text-white"><option value="">Choose a community room</option>{eligibleRooms.data?.map((room) => <option key={room.id} value={room.id}>{room.title} · {new Date(room.startsAt).toLocaleString()} · {room.status}</option>)}</select><div className="rounded-xl border border-zinc-800 bg-black p-3 text-[11px] leading-5 text-zinc-400">The AI runtime receives a bounded relationship summary and recent timeline as untrusted evidence. Private notes stay excluded. Participants must still grant active room consent before recording, transcription, or AI analysis begins.</div>{eligibleRooms.data && eligibleRooms.data.length === 0 && <button onClick={() => setLocation("/communities")} className="text-xs font-bold text-[#1d9bf0]">Create or manage a community room</button>}<Button onClick={() => bindRelationshipRoom.mutate()} disabled={!meetingRoomId || bindRelationshipRoom.isPending} className="w-full bg-white text-black hover:bg-zinc-200"><Video className="mr-2 h-4 w-4" />{bindRelationshipRoom.isPending ? "Linking securely…" : "Link room to relationship"}</Button></div>
        </DialogContent>
      </Dialog>
      <Dialog open={voiceOpen} onOpenChange={setVoiceOpen}>
        <DialogContent className="border-zinc-800 bg-zinc-950 text-white sm:max-w-lg">
          <DialogHeader><DialogTitle>Verified voice message</DialogTitle><DialogDescription className="text-zinc-500">Only the voice owner can enroll, approve, generate, or revoke this profile. Every generated message is disclosed as synthetic media.</DialogDescription></DialogHeader>
          {(voiceProfiles.data?.filter((profile) => profile.status === "active").length ?? 0) > 0 ? <div className="space-y-4">
            <label className="block text-xs font-bold text-zinc-400">Voice profile<select value={voiceProfileId} onChange={(event) => setVoiceProfileId(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-zinc-800 bg-black px-3 text-sm text-white">{voiceProfiles.data?.filter((profile) => profile.status === "active").map((profile) => <option key={profile.id} value={profile.id}>{profile.displayName}</option>)}</select></label>
            <label className="block text-xs font-bold text-zinc-400">Use case<select value={voiceUseCase} onChange={(event) => setVoiceUseCase(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-zinc-800 bg-black px-3 text-sm text-white"><option value="relationship_follow_up">Relationship follow-up</option><option value="customer_support">Customer support</option><option value="community_update">Community update</option><option value="meeting_recap">Meeting recap</option><option value="sales_follow_up">Sales follow-up</option></select></label>
            <label className="block text-xs font-bold text-zinc-400">Exact script<Textarea value={voiceScript} onChange={(event) => setVoiceScript(event.target.value)} maxLength={2500} placeholder="Write exactly what your verified voice should say…" className="mt-2 min-h-32 border-zinc-800 bg-black text-white" /></label>
            <div className="rounded-xl border border-amber-900/50 bg-amber-950/20 p-3 text-[11px] leading-5 text-amber-200">AI-written scripts require a separate approval by the verified voice owner. Authentication, money-transfer, legal-consent, medical, emergency, political-persuasion, and impersonation uses are blocked.</div>
            <Button onClick={() => sendVoice.mutate()} disabled={!voiceScript.trim() || sendVoice.isPending} className="w-full bg-white text-black hover:bg-zinc-200"><Mic className="mr-2 h-4 w-4" />{sendVoice.isPending ? "Generating securely…" : "Generate and send"}</Button>
          </div> : <div className="space-y-4">
            <div className={`rounded-xl border p-3 text-xs ${voiceProviders.data?.find((provider) => provider.provider === "elevenlabs")?.configured ? "border-emerald-900 bg-emerald-950/20 text-emerald-200" : "border-amber-900 bg-amber-950/20 text-amber-200"}`}>{voiceProviders.data?.find((provider) => provider.provider === "elevenlabs")?.configured ? "ElevenLabs is connected. Enter a voice ID from your verified ElevenLabs account." : "The ElevenLabs deployment credential is still required before enrollment can be validated."}</div>
            <label className="block text-xs font-bold text-zinc-400">Profile name<Input value={voiceDisplayName} onChange={(event) => setVoiceDisplayName(event.target.value)} className="mt-2 border-zinc-800 bg-black text-white" /></label>
            <label className="block text-xs font-bold text-zinc-400">ElevenLabs voice ID<Input value={providerVoiceId} onChange={(event) => setProviderVoiceId(event.target.value)} type="password" autoComplete="off" className="mt-2 border-zinc-800 bg-black text-white" /></label>
            <label className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-black p-3 text-xs leading-5 text-zinc-400"><input type="checkbox" checked={voiceAttested} onChange={(event) => setVoiceAttested(event.target.checked)} className="mt-1" /><span>{voiceConsentText}</span></label>
            <Button onClick={() => enrollVoice.mutate()} disabled={!voiceDisplayName.trim() || !providerVoiceId.trim() || !voiceAttested || enrollVoice.isPending || !voiceProviders.data?.find((provider) => provider.provider === "elevenlabs")?.configured} className="w-full bg-white text-black hover:bg-zinc-200">{enrollVoice.isPending ? "Validating ownership…" : "Verify and activate voice"}</Button>
          </div>}
        </DialogContent>
      </Dialog>
      <Dialog open={whatsappOpen} onOpenChange={(open) => { setWhatsappOpen(open); if (!open) setWhatsappAccessToken(""); }}>
        <DialogContent className="border-zinc-800 bg-zinc-950 text-white sm:max-w-lg">
          <DialogHeader><DialogTitle>Connect WhatsApp Business</DialogTitle><DialogDescription className="text-zinc-500">Use a Meta system-user token with WhatsApp Business Messaging access. The token is encrypted immediately and never returned by the API.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <label className="block text-xs font-bold text-zinc-400">Phone number ID<Input value={whatsappPhoneNumberId} onChange={(event) => setWhatsappPhoneNumberId(event.target.value)} autoComplete="off" className="mt-2 border-zinc-800 bg-black text-white" /></label>
            <label className="block text-xs font-bold text-zinc-400">WhatsApp Business Account ID (optional)<Input value={whatsappWabaId} onChange={(event) => setWhatsappWabaId(event.target.value)} autoComplete="off" className="mt-2 border-zinc-800 bg-black text-white" /></label>
            <label className="block text-xs font-bold text-zinc-400">Display name (optional)<Input value={whatsappAccountName} onChange={(event) => setWhatsappAccountName(event.target.value)} className="mt-2 border-zinc-800 bg-black text-white" /></label>
            <label className="block text-xs font-bold text-zinc-400">System-user access token<Input value={whatsappAccessToken} onChange={(event) => setWhatsappAccessToken(event.target.value)} type="password" autoComplete="new-password" className="mt-2 border-zinc-800 bg-black text-white" /></label>
            <div className="rounded-xl border border-zinc-800 bg-black p-3 text-[11px] leading-5 text-zinc-400">After connection, subscribe the WhatsApp app to the callback shown in the provider operations guide. Replies obey Meta's customer-service window; proactive outreach requires approved templates and is intentionally not automated here.</div>
            <Button onClick={() => connectWhatsApp.mutate()} disabled={!whatsappPhoneNumberId.trim() || whatsappAccessToken.trim().length < 20 || connectWhatsApp.isPending} className="w-full bg-white text-black hover:bg-zinc-200">{connectWhatsApp.isPending ? "Verifying securely…" : "Verify and connect"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
