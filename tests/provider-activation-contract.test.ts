import { describe, expect, it } from "vitest";
import {
  providerActivationDefinitions,
  providerActivationEvidenceInputSchema,
  providerActivationProviderIds,
  providerActivationRunInputSchema,
  providerActivationStages,
  summarizeProviderActivationRun,
} from "../shared/provider-activation";

describe("provider activation contract", () => {
  it("covers every provider capability with the complete acceptance protocol", () => {
    expect(providerActivationProviderIds).toHaveLength(22);
    expect(providerActivationStages).toHaveLength(14);
    expect(new Set(providerActivationProviderIds).size).toBe(providerActivationProviderIds.length);
    expect(providerActivationDefinitions.map((item) => item.id)).toEqual(providerActivationProviderIds);
    expect(providerActivationDefinitions.every((item) => item.requiredStages === providerActivationStages)).toBe(true);
  });

  it("requires a safe durable reference for passing evidence", () => {
    const base = { stage: "connect", outcome: "passed", summary: "OAuth connection completed in a controlled field test." };
    expect(providerActivationEvidenceInputSchema.safeParse(base).success).toBe(false);
    expect(providerActivationEvidenceInputSchema.safeParse({ ...base, evidenceUrl: "http://example.com/evidence" }).success).toBe(false);
    expect(providerActivationEvidenceInputSchema.safeParse({ ...base, evidenceUrl: "https://example.com/evidence?token=secret" }).success).toBe(false);
    expect(providerActivationEvidenceInputSchema.safeParse({ ...base, evidenceUrl: "https://example.com/evidence#private" }).success).toBe(false);
    expect(providerActivationEvidenceInputSchema.safeParse({ ...base, evidenceUrl: "https://example.com/evidence" }).success).toBe(true);
  });

  it("rejects secret-like summaries and invalid evidence times", () => {
    const base = { stage: "connect", outcome: "blocked", summary: "Provider approval is not available for the production tenant." };
    expect(providerActivationEvidenceInputSchema.safeParse({ ...base, summary: "client_secret=do-not-store-this-value" }).success).toBe(false);
    expect(providerActivationEvidenceInputSchema.safeParse({ ...base, observedAt: new Date(Date.now() + 10 * 60_000) }).success).toBe(false);
    expect(providerActivationEvidenceInputSchema.safeParse({ ...base, observedAt: "2026-01-02", expiresAt: "2026-01-01" }).success).toBe(false);
    expect(providerActivationRunInputSchema.safeParse({ environment: "production", summary: "access_token=never-store-provider-tokens" }).success).toBe(false);
  });

  it("derives qualification only from every current latest stage", () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    const passed = providerActivationStages.map((stage) => ({ stage, outcome: "passed", observedAt: createdAt, createdAt }));
    expect(summarizeProviderActivationRun("youtube_distribution", passed, createdAt).qualifiable).toBe(true);
    expect(summarizeProviderActivationRun("youtube_distribution", passed.slice(1), createdAt)).toMatchObject({ qualifiable: false, state: "in_progress", missing: ["connect"] });
    const superseded = [...passed, { stage: "connect", outcome: "failed", observedAt: createdAt, createdAt: new Date("2026-01-02T00:00:00Z") }];
    expect(summarizeProviderActivationRun("youtube_distribution", superseded, new Date("2026-01-03T00:00:00Z"))).toMatchObject({ qualifiable: false, state: "failed", failed: ["connect"] });
  });

  it("treats expired evidence as missing from current qualification", () => {
    const evidence = providerActivationStages.map((stage) => ({ stage, outcome: "passed", observedAt: "2026-01-01", expiresAt: stage === "connect" ? "2026-01-02" : null, createdAt: "2026-01-01" }));
    expect(summarizeProviderActivationRun("umh_federation", evidence, new Date("2026-01-03"))).toMatchObject({ qualifiable: false, expired: ["connect"], missing: ["connect"] });
  });
});
