import { describe, expect, it } from "vitest";
import { createPodcastEpisodeSchema, createPodcastShowSchema, podcastPollSchema } from "../shared/podcast";
describe("Podcast Studio contracts", () => {
  it("requires owner contact and entitlement backing for gated shows", () => { expect(createPodcastShowSchema.safeParse({ title: "Show", author: "Owner", ownerEmail: "owner@example.com", access: "public" }).success).toBe(true); expect(createPodcastShowSchema.safeParse({ title: "Show", author: "Owner", ownerEmail: "owner@example.com", access: "members", entitlementProductId: null }).success).toBe(false); });
  it("orders chapters and rejects duplicate timecodes", () => { const base = { title: "Episode", mediaAssetId: "00000000-0000-4000-8000-000000000000" }; const parsed = createPodcastEpisodeSchema.parse({ ...base, chapters: [{ startSeconds: 30, title: "Second" }, { startSeconds: 0, title: "First" }] }); expect(parsed.chapters.map((chapter) => chapter.title)).toEqual(["First", "Second"]); expect(createPodcastEpisodeSchema.safeParse({ ...base, chapters: [{ startSeconds: 0, title: "One" }, { startSeconds: 0, title: "Two" }] }).success).toBe(false); });
  it("requires unique poll choices", () => { expect(podcastPollSchema.safeParse({ question: "Pick", options: [{ id: "a", label: "A" }, { id: "a", label: "B" }] }).success).toBe(false); });
});
