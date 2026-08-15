import { expect, test } from "@playwright/test";

type Feed = { contractVersion: string; mode: string; requestId: string; policy: { version: number }; items: Array<{ id: number; userId: number; discovery: { rank: number; explanation: string[]; policyVersion: number } }> };

test("indexed search and explainable feeds enforce safety and fairness", async ({ page }) => {
  await page.goto("/"); const current = await (await page.request.get("/api/user")).json() as { id: number };
  const stamp = Date.now(); const marker = `NebulaDiscovery${stamp}`;
  const created = await page.request.post("/api/posts", { data: { content: `${marker} #video production field test`, mediaType: "text" } }); expect(created.status()).toBe(201);
  expect((await page.request.put("/api/discovery/preferences", { data: { interests: ["video", "business"], hiddenCreatorIds: [], sensitiveContent: "hide" } })).status()).toBe(200);
  const search = await (await page.request.get(`/api/search?query=${marker}`)).json() as { posts: Array<{ content: string; user: { id: number; password?: string } }>; search: { indexed: boolean; contractVersion: string } };
  expect(search.search).toMatchObject({ indexed: true, contractVersion: "creativesos.search.v1" }); expect(search.posts.some((post) => post.content.includes(marker))).toBe(true); expect(search.posts[0].user.password).toBeUndefined();

  for (const mode of ["chronological", "following", "recommended"] as const) {
    const feed = await (await page.request.get(`/api/discovery/feed?mode=${mode}&limit=20`)).json() as Feed; expect(feed.contractVersion).toBe("creativesos.discovery.feed.v1"); expect(feed.mode).toBe(mode); expect(feed.requestId).toBeTruthy(); expect(feed.policy.version).toBeGreaterThan(0); for (const [index, item] of feed.items.entries()) { expect(item.discovery.rank).toBe(index + 1); expect(item.discovery.policyVersion).toBe(feed.policy.version); expect(item.discovery.explanation.length).toBeGreaterThanOrEqual(3); }
    if (mode === "recommended") { const counts = new Map<number, number>(); feed.items.forEach((item) => counts.set(item.userId, (counts.get(item.userId) ?? 0) + 1)); expect(Math.max(0, ...counts.values())).toBeLessThanOrEqual(2); }
  }
  const chronological = await (await page.request.get("/api/discovery/feed?mode=chronological&limit=50")).json() as Feed; const other = chronological.items.find((item) => item.userId !== current.id);
  if (other) { expect((await page.request.post(`/api/discovery/blocks/${other.userId}`)).status()).toBeLessThan(300); const filtered = await (await page.request.get("/api/discovery/feed?mode=recommended&limit=50")).json() as Feed; expect(filtered.items.some((item) => item.userId === other.userId)).toBe(false); expect((await page.request.delete(`/api/discovery/blocks/${other.userId}`)).status()).toBe(204); }
});
