import { z } from "zod";

export const roomIntelligenceRoles = [
  "sales_coach",
  "facilitator",
  "guest_researcher",
  "engagement_analyst",
  "chief_of_staff",
  "community_moderator",
] as const;
export const roomAiModes = ["private_copilot", "visible_participant"] as const;
export const roomAudienceRoles = ["owner", "admin", "moderator", "member"] as const;
export const roomConsentCapabilities = ["recording", "transcription", "ai_analysis"] as const;
export const roomConsentDecisions = ["granted", "declined", "withdrawn"] as const;

export const roomIntelligencePolicyInputSchema = z
  .object({
    privateCopilotEnabled: z.boolean(),
    visibleAiEnabled: z.boolean(),
    guestBriefsEnabled: z.boolean(),
    engagementInsightsEnabled: z.boolean(),
    salesCoachingEnabled: z.boolean(),
    recordingAllowed: z.boolean(),
    transcriptionAllowed: z.boolean(),
    aiAnalysisAllowed: z.boolean(),
    disclosureText: z.string().trim().min(20).max(2_000),
    retentionDays: z.number().int().min(1).max(365),
  })
  .strict();

export const roomAiProfileInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    role: z.enum(roomIntelligenceRoles),
    mode: z.enum(roomAiModes),
    audienceRole: z.enum(roomAudienceRoles),
    instructions: z.string().trim().max(5_000).default(""),
  })
  .strict();

export const roomAiProfileStatusInputSchema = z
  .object({ status: z.enum(["configured", "paused", "removed"]) })
  .strict();

export const roomConsentInputSchema = z
  .object({
    capability: z.enum(roomConsentCapabilities),
    decision: z.enum(roomConsentDecisions),
  })
  .strict();

export const roomInsightReviewInputSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("accept_note") }).strict(),
  z
    .object({
      decision: z.literal("accept_action"),
      assigneeUserId: z.number().int().positive().nullable().optional(),
      dueAt: z.string().datetime({ offset: true }).nullable().optional(),
    })
    .strict(),
  z.object({ decision: z.literal("dismiss") }).strict(),
]);

export function acceptedRoomInsightContent(insight: {
  title: string;
  body: string;
}) {
  return `${insight.title.trim()}\n\n${insight.body.trim()}`;
}

export type RoomIntelligencePolicyInput = z.infer<
  typeof roomIntelligencePolicyInputSchema
>;
export type RoomConsentCapability = (typeof roomConsentCapabilities)[number];

const roleRank: Record<string, number> = {
  member: 1,
  moderator: 2,
  admin: 3,
  owner: 4,
};

export function canAccessRoomAiProfile(
  membershipRole: string,
  audienceRole: string,
) {
  return (roleRank[membershipRole] ?? 0) >= (roleRank[audienceRole] ?? 99);
}

export function canViewRoomGuestBriefs(
  membershipRole: string,
  canManage: boolean,
  guestBriefsEnabled: boolean,
) {
  return (
    guestBriefsEnabled &&
    (canManage || membershipRole === "moderator")
  );
}

export function policyAllowsConsentCapability(
  policy: Pick<
    RoomIntelligencePolicyInput,
    "recordingAllowed" | "transcriptionAllowed" | "aiAnalysisAllowed"
  >,
  capability: RoomConsentCapability,
) {
  if (capability === "recording") return policy.recordingAllowed;
  if (capability === "transcription") return policy.transcriptionAllowed;
  return policy.aiAnalysisAllowed;
}

export function activeRoomConsentCapabilities(room: {
  recordingEnabled: boolean;
  transcriptionEnabled: boolean;
  aiAssistanceEnabled: boolean;
}): RoomConsentCapability[] {
  return [
    ...(room.recordingEnabled ? (["recording"] as const) : []),
    ...(room.transcriptionEnabled ? (["transcription"] as const) : []),
    ...(room.aiAssistanceEnabled ? (["ai_analysis"] as const) : []),
  ];
}

export function missingRoomConsentCapabilities(
  required: readonly RoomConsentCapability[],
  granted: readonly string[],
) {
  const grantedCapabilities = new Set(granted);
  return required.filter(
    (capability) => !grantedCapabilities.has(capability),
  );
}

export const defaultRoomIntelligencePolicy: RoomIntelligencePolicyInput = {
  privateCopilotEnabled: false,
  visibleAiEnabled: false,
  guestBriefsEnabled: false,
  engagementInsightsEnabled: false,
  salesCoachingEnabled: false,
  recordingAllowed: false,
  transcriptionAllowed: false,
  aiAnalysisAllowed: false,
  disclosureText:
    "This room may use explicitly enabled AI assistance. Active processing is disclosed before it begins, and you can decline or withdraw consent.",
  retentionDays: 30,
};
