import { describe, expect, it } from "vitest";
import {
  automationBackoffMs,
  automationConfigContainsSecret,
  automationDefinitionInputSchema,
  requiresAutomationApproval,
  sanitizeAutomationError,
} from "../server/automation-policy";
import { getAutomationAction, listAutomationActions } from "../server/automation-actions";
import { automationTemplates } from "../server/automation-templates";

describe("automation governance", () => {
  it("rejects duplicate step keys and positions", () => {
    const result = automationDefinitionInputSchema.safeParse({
      name: "Unsafe duplicate",
      steps: [
        { stepKey: "same", name: "One", actionType: "text.compose", position: 0, config: {} },
        { stepKey: "same", name: "Two", actionType: "text.compose", position: 0, config: {} },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("requires approval only when policy and consequence demand it", () => {
    expect(requiresAutomationApproval("none", true)).toBe(false);
    expect(requiresAutomationApproval("always", false)).toBe(true);
    expect(requiresAutomationApproval("consequential", false)).toBe(false);
    expect(requiresAutomationApproval("consequential", true)).toBe(true);
  });

  it("uses bounded exponential retry delays", () => {
    expect(automationBackoffMs(1)).toBe(1_000);
    expect(automationBackoffMs(4)).toBe(8_000);
    expect(automationBackoffMs(20)).toBe(60_000);
  });

  it("redacts credentials from stored failures", () => {
    expect(sanitizeAutomationError(new Error("Bearer abc.def_secret"))).toContain("Bearer [redacted]");
  });

  it("refuses credentials inside persisted workflow configuration", () => {
    expect(automationConfigContainsSecret({ apiKey: "anything" })).toBe(true);
    const result = automationDefinitionInputSchema.safeParse({
      name: "Unsafe secret",
      steps: [{ stepKey: "compose", name: "Compose", actionType: "text.compose", position: 0, config: { template: "sk_live_do_not_store" } }],
    });
    expect(result.success).toBe(false);
  });

  it("ships templates that only reference registered native actions", () => {
    expect(listAutomationActions().length).toBeGreaterThanOrEqual(6);
    for (const template of automationTemplates) {
      for (const step of template.steps) expect(getAutomationAction(step.actionType), step.actionType).toBeDefined();
    }
    expect(getAutomationAction("campaign.create")?.consequential).toBe(true);
    expect(getAutomationAction("native.comment.reply")?.consequential).toBe(true);
    expect(getAutomationAction("native.dm.send")?.consequential).toBe(true);
  });
});
