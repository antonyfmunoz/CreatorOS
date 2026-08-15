import { describe, expect, it } from "vitest";
import { createSponsorDealSchema, createSponsorshipProposalSchema, sponsorshipUsageRightsSchema } from "../shared/sponsorship";
const rights = { channels: ["youtube"], territories: ["worldwide"], durationDays: 90, paidMedia: false, whitelisting: false, exclusivityCategory: null, exclusivityDays: 0 };
describe("Sponsorship Studio contract", () => {
  it("models bounded usage and exclusivity rights", () => { expect(sponsorshipUsageRightsSchema.parse(rights).durationDays).toBe(90); expect(sponsorshipUsageRightsSchema.safeParse({ ...rights, durationDays: 99_999 }).success).toBe(false); });
  it("accepts a deal linked to shared commercial records", () => { expect(createSponsorDealSchema.parse({ brandName: "Acme", contactId: null, campaignId: null, title: "Launch", description: "", currency: "usd", proposedValueCents: 250000, disclosure: "#ad", usageRights: rights, renewalAt: null }).brandName).toBe("Acme"); });
  it("requires explicit deliverables and payment terms", () => { expect(createSponsorshipProposalSchema.safeParse({ summary: "Launch", valueCents: 250000, validUntil: new Date(Date.now()+86400000), deliverables: [], paymentTerms: "Net 30", cancellationTerms: "", usageRights: rights }).success).toBe(false); });
});
