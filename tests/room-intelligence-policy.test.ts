import { describe, expect, it } from "vitest";
import {
  activeRoomConsentCapabilities,
  canAccessRoomAiProfile,
  canViewRoomGuestBriefs,
  defaultRoomIntelligencePolicy,
  missingRoomConsentCapabilities,
  policyAllowsConsentCapability,
  roomAiProfileInputSchema,
} from "../server/room-intelligence-policy";

describe("room intelligence policy", () => {
  it("keeps all intelligence disabled by default", () => {
    expect(defaultRoomIntelligencePolicy.privateCopilotEnabled).toBe(false);
    expect(defaultRoomIntelligencePolicy.visibleAiEnabled).toBe(false);
    expect(defaultRoomIntelligencePolicy.aiAnalysisAllowed).toBe(false);
  });

  it("enforces the room role hierarchy for private AI profiles", () => {
    expect(canAccessRoomAiProfile("owner", "admin")).toBe(true);
    expect(canAccessRoomAiProfile("moderator", "moderator")).toBe(true);
    expect(canAccessRoomAiProfile("member", "moderator")).toBe(false);
    expect(canAccessRoomAiProfile("admin", "owner")).toBe(false);
  });

  it("limits guest briefs to managers and moderators when enabled", () => {
    expect(canViewRoomGuestBriefs("owner", true, true)).toBe(true);
    expect(canViewRoomGuestBriefs("moderator", false, true)).toBe(true);
    expect(canViewRoomGuestBriefs("member", false, true)).toBe(false);
    expect(canViewRoomGuestBriefs("owner", true, false)).toBe(false);
  });

  it("requires policy permission before accepting participant consent", () => {
    expect(
      policyAllowsConsentCapability(
        { recordingAllowed: false, transcriptionAllowed: true, aiAnalysisAllowed: true },
        "recording",
      ),
    ).toBe(false);
    expect(
      policyAllowsConsentCapability(
        { recordingAllowed: false, transcriptionAllowed: true, aiAnalysisAllowed: true },
        "ai_analysis",
      ),
    ).toBe(true);
  });

  it("derives consent gates only from active room processing", () => {
    expect(
      activeRoomConsentCapabilities({
        recordingEnabled: false,
        transcriptionEnabled: true,
        aiAssistanceEnabled: true,
      }),
    ).toEqual(["transcription", "ai_analysis"]);
  });

  it("rejects unsupported analysis roles", () => {
    expect(
      roomAiProfileInputSchema.safeParse({
        name: "Diagnosis bot",
        role: "psychoanalyst",
        mode: "private_copilot",
        audienceRole: "owner",
        instructions: "Diagnose guests",
      }).success,
    ).toBe(false);
  });

  it("blocks room entry until every active capability is granted", () => {
    expect(
      missingRoomConsentCapabilities(
        ["recording", "transcription", "ai_analysis"],
        ["recording", "ai_analysis"],
      ),
    ).toEqual(["transcription"]);
    expect(
      missingRoomConsentCapabilities(
        ["recording", "transcription"],
        ["recording", "transcription"],
      ),
    ).toEqual([]);
  });
});
