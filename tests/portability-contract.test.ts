import { describe, expect, it } from "vitest";
import { portabilityPackageSchema } from "../shared/portability";

const base = {
  schemaVersion: "creativesos.portability.v1" as const,
  sourceSystem: "qualification",
  products: [],
  courses: [],
  contacts: [],
  automations: [],
};

describe("data portability contract", () => {
  it("accepts bounded canonical records", () => {
    const parsed = portabilityPackageSchema.parse({
      ...base,
      products: [{ sourceId: "product-1", title: "Portable offer", description: "Owned", price: 25, category: "Education" }],
      contacts: [{ sourceId: "contact-1", name: "Portable customer" }],
    });
    expect(parsed.products[0].status).toBe("draft");
    expect(parsed.contacts).toHaveLength(1);
  });

  it("rejects duplicate source identities and invalid assessment answers", () => {
    expect(portabilityPackageSchema.safeParse({ ...base, contacts: [{ sourceId: "same", name: "One" }, { sourceId: "same", name: "Two" }] }).success).toBe(false);
    expect(portabilityPackageSchema.safeParse({ ...base, courses: [{ sourceId: "course", title: "Course", description: "", price: 0, category: "Education", modules: [{ sourceId: "module", title: "Module", description: "", lessons: [{ sourceId: "lesson", title: "Lesson", assessment: { questions: [{ id: "q", prompt: "Question", choices: ["A", "B"], answerIndex: 2 }] } }] }] }] }).success).toBe(false);
  });
});
