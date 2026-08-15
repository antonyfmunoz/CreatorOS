import { describe, expect, it } from "vitest";
import { createCreatorSiteSchema, creatorSiteRedirectSchema, creatorSiteSectionPayloadSchema } from "../shared/creator-site";
describe("Creator Site contract", () => {
  it("accepts an owned themed destination", () => { expect(createCreatorSiteSchema.parse({ slug: "antony-creative", name: "Antony", tagline: "Own the relationship", bio: "", avatarAssetId: null, theme: { background: "#000000", surface: "#09090b", text: "#ffffff", muted: "#71717a", accent: "#1d9bf0", radius: "large", font: "sans" }, seo: { title: "Antony", description: "Creator", imageAssetId: null, noIndex: false } }).slug).toBe("antony-creative"); });
  it("bounds public section payloads", () => { expect(creatorSiteSectionPayloadSchema.parse({ type: "links", heading: "Start", links: [{ id: "one", label: "Offer", url: "/marketplace", description: "", featured: true }] }).links).toHaveLength(1); expect(creatorSiteSectionPayloadSchema.safeParse({ type: "embed", heading: "", provider: "youtube", url: "javascript:alert(1)" }).success).toBe(false); });
  it("limits redirect behavior", () => { expect(creatorSiteRedirectSchema.parse({ sourcePath: "/start", targetUrl: "/marketplace", statusCode: 302 }).statusCode).toBe(302); expect(creatorSiteRedirectSchema.safeParse({ sourcePath: "//evil", targetUrl: "https://example.com", statusCode: 305 }).success).toBe(false); });
});
