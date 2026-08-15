import { describe, expect, it } from "vitest";
import { provenanceClaimSchema, submitRightsCaseSchema } from "../shared/trust";

describe("rights and provenance contracts", () => {
  it("requires disclosure for synthetic media and cloned voice", () => { expect(provenanceClaimSchema.safeParse({ kind: "cloned_voice", disclosure: "", sourceAssetIds: [], metadata: {} }).success).toBe(false); expect(provenanceClaimSchema.safeParse({ kind: "cloned_voice", disclosure: "AI-generated voice used with the verified speaker's consent.", sourceAssetIds: [], metadata: {} }).success).toBe(true); });
  it("requires a substantive attestation for rights cases", () => { expect(submitRightsCaseSchema.safeParse({ targetType: "post", targetId: "1", caseType: "takedown", claimantName: "Owner", contactEmail: "owner@example.com", statement: "Too short" }).success).toBe(false); });
});
