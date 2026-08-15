import { describe, expect, it } from "vitest";
import { createAudienceFormSchema, createNewsletterIssueSchema, createNewsletterSequenceSchema, publicAudienceSubmissionSchema } from "../shared/audience";

describe("Audience Studio contracts", () => {
  it("always places a governed email field first and deduplicates tags", () => {
    const form = createAudienceFormSchema.parse({ name: "Briefing", title: "Join", fields: [{ key: "email", label: "Other", type: "email", required: false }, { key: "role", label: "Role", type: "text", required: false }], tags: ["VIP", "vip"], consentPurpose: "marketing", disclosureVersion: "v2", successMessage: "Done" });
    expect(form.fields[0]).toMatchObject({ key: "email", required: true });
    expect(form.fields.filter((field) => field.key === "email")).toHaveLength(1);
    expect(form.tags).toEqual(["vip"]);
  });

  it("requires explicit consent and a valid subscriber address", () => {
    expect(publicAudienceSubmissionSchema.safeParse({ email: "bad", values: {}, consentGranted: true }).success).toBe(false);
    expect(publicAudienceSubmissionSchema.safeParse({ email: "person@example.com", values: {}, consentGranted: false }).success).toBe(false);
  });

  it("requires A/B allocations to total one hundred", () => {
    const base = { name: "Issue", subject: "Subject", content: [{ id: "body", type: "text", content: { text: "Hello" } }] };
    expect(createNewsletterIssueSchema.safeParse({ ...base, variants: [{ key: "a", subject: "A", percentage: 40 }, { key: "b", subject: "B", percentage: 60 }] }).success).toBe(true);
    expect(createNewsletterIssueSchema.safeParse({ ...base, variants: [{ key: "a", subject: "A", percentage: 40 }] }).success).toBe(false);
  });

  it("rejects ambiguous sequence positions", () => {
    const step = { position: 1, delayMinutes: 0, subject: "Hello", content: [{ id: "one", type: "text", content: { text: "Body" } }] };
    expect(createNewsletterSequenceSchema.safeParse({ name: "Welcome", trigger: { type: "manual", value: null }, steps: [step, step] }).success).toBe(false);
  });
});
