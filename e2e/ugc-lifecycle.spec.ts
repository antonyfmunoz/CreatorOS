import { expect, test, type APIResponse, type Page, type TestInfo } from "@playwright/test";

function actors(testInfo: TestInfo) {
  const brand = testInfo.project.name.startsWith("mobile") ? 1 : 2;
  return { brand, creator: brand === 1 ? 2 : 1, moderator: 3, outsider: 4 };
}

async function api(page: Page, actor: number, method: string, url: string, data?: unknown) {
  return page.request.fetch(url, { method, data, headers: { "x-creativesos-demo-user": String(actor) } });
}

async function ok(response: APIResponse) {
  expect(response.ok(), `${response.status()} ${response.url()}: ${await response.text()}`).toBeTruthy();
}

test("brand and creator complete a native UGC brief, revision, approval, performance, and earnings lifecycle", async ({ page }, testInfo) => {
  const { brand, creator, moderator, outsider } = actors(testInfo);
  const marker = `${testInfo.project.name}-${Date.now()}`;
  const brandBusinesses = await api(page, brand, "GET", "/api/businesses"); await ok(brandBusinesses);
  const business = (await brandBusinesses.json())[0];
  const creatorAssets = await api(page, creator, "GET", "/api/assets"); await ok(creatorAssets);
  const allAssets = await creatorAssets.json() as Array<{ id: string; visibility: string }>;
  const publicAsset = allAssets.find((asset) => asset.visibility === "public")!;
  const privateAsset = allAssets.find((asset) => asset.visibility === "private")!;

  await ok(await api(page, creator, "PUT", "/api/ugc/profile", { headline: "Performance UGC creator", bio: "Builds conversion-oriented product stories.", niches: ["Wellness"], languages: ["English"], startingRateCents: 20_000, currency: "usd", availability: "available", portfolioPublic: true }));
  const portfolioResponse = await api(page, creator, "POST", "/api/ugc/portfolio", { assetId: publicAsset.id, title: `Portfolio ${marker}`, description: "Qualified public work", category: "Wellness", format: "vertical_video", public: true, performance: { impressions: 999_999_999, conversions: 999_999, attributedRevenueCents: 999_999_999 } }); await ok(portfolioResponse);
  const portfolio = await portfolioResponse.json();
  expect(portfolio.performance).toEqual({ impressions: 0, conversions: 0, attributedRevenueCents: 0 });

  const briefResponse = await api(page, brand, "POST", "/api/ugc/opportunities", {
    businessId: business.id, title: `UGC launch ${marker}`, description: "Create a conversion-oriented vertical story with a strong hook and product demonstration.", category: "Wellness", platforms: ["Instagram", "TikTok"],
    deliverables: [{ title: "Vertical product story", quantity: 1, format: "vertical_video", notes: "Include hook and CTA" }], compensationModel: "hybrid", fixedFeeCents: 20_000, commissionBps: 1_000, currency: "usd",
    applicationDeadline: new Date(Date.now() + 86_400_000).toISOString(), contentDueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    usageRights: { placement: "organic_and_paid", durationDays: 90, territories: ["Worldwide"], allowDerivativeEdits: true, includeRawFootage: false, includeLikeness: true, includeVoice: true, exclusivityDays: 0 },
    eligibility: { countries: [], minimumAge: 18, niches: ["Wellness"], requiresPortfolio: true, notes: "" }, revisionLimit: 2, disclosure: "Paid partnership disclosure required.",
  }); await ok(briefResponse); const brief = await briefResponse.json();
  await ok(await api(page, brand, "POST", `/api/ugc/opportunities/${brief.id}/publish`, {}));
  const discover = await api(page, creator, "GET", `/api/ugc/discover?q=${encodeURIComponent(marker)}`); await ok(discover);
  expect((await discover.json()).map((row: { opportunity: { id: string } }) => row.opportunity.id)).toContain(brief.id);
  expect((await api(page, brand, "POST", `/api/ugc/opportunities/${brief.id}/applications`, { pitch: "Self application", portfolioItemIds: [portfolio.id] })).status()).toBe(409);

  const applicationResponse = await api(page, creator, "POST", `/api/ugc/opportunities/${brief.id}/applications`, { pitch: "I will lead with the problem, demonstrate the product, and close with a direct CTA.", portfolioItemIds: [portfolio.id], proposedFeeCents: 20_000 }); await ok(applicationResponse); const application = await applicationResponse.json();
  expect((await api(page, outsider, "GET", `/api/ugc/opportunities/${brief.id}/applications`)).status()).toBe(403);
  await ok(await api(page, brand, "PATCH", `/api/ugc/applications/${application.id}`, { status: "shortlisted" }));
  const acceptedResponse = await api(page, brand, "POST", `/api/ugc/applications/${application.id}/accept`, {}); await ok(acceptedResponse); const collaboration = await acceptedResponse.json();
  const moderatorWorkroom = await api(page, moderator, "GET", `/api/ugc/workrooms/${collaboration.id}`);
  if (brand === 1) {
    await ok(moderatorWorkroom);
    expect(await moderatorWorkroom.json()).toMatchObject({ role: "brand", collaboration: { id: collaboration.id } });
  } else {
    expect(moderatorWorkroom.status()).toBe(404);
  }
  expect((await api(page, outsider, "GET", `/api/ugc/workrooms/${collaboration.id}`)).status()).toBe(404);

  const firstResponse = await api(page, creator, "POST", `/api/ugc/workrooms/${collaboration.id}/submissions`, { assetId: privateAsset.id, caption: "First caption", notes: "First qualified version" }); await ok(firstResponse); const first = await firstResponse.json();
  expect((await api(page, creator, "POST", `/api/ugc/submissions/${first.id}/review`, { decision: "approved", feedback: "Self review" })).status()).toBe(403);
  await ok(await api(page, brand, "POST", `/api/ugc/submissions/${first.id}/review`, { decision: "revision_requested", feedback: "Move the product proof into the first five seconds." }));
  const secondResponse = await api(page, creator, "POST", `/api/ugc/workrooms/${collaboration.id}/submissions`, { assetId: privateAsset.id, caption: "Revised caption", notes: "Proof moved into the hook" }); await ok(secondResponse); const second = await secondResponse.json();
  expect(second.version).toBe(2);
  await ok(await api(page, brand, "POST", `/api/ugc/submissions/${second.id}/review`, { decision: "approved", feedback: "Approved for launch" }));
  const performanceKey = `qualification-performance-${marker}`;
  const performancePayload = { idempotencyKey: performanceKey, source: "qualification", impressions: 50_000, engagements: 2_000, clicks: 500, conversions: 100, spendCents: 25_000, attributedRevenueCents: 100_000 };
  const performance = await api(page, brand, "POST", `/api/ugc/workrooms/${collaboration.id}/performance`, performancePayload); await ok(performance);
  expect((await performance.json()).commissionAmountCents).toBe(10_000);
  const replayedPerformance = await api(page, brand, "POST", `/api/ugc/workrooms/${collaboration.id}/performance`, performancePayload); await ok(replayedPerformance);
  expect((await replayedPerformance.json()).replayed).toBe(true);
  const workroom = await api(page, creator, "GET", `/api/ugc/workrooms/${collaboration.id}`); await ok(workroom);
  expect(await workroom.json()).toMatchObject({ role: "creator", collaboration: { status: "approved" }, earningsSummary: { totalCents: 30_000, approvedCents: 30_000 } });
  const earnings = await api(page, creator, "GET", "/api/ugc/earnings"); await ok(earnings);
  expect(await earnings.json()).toMatchObject({ totals: { totalCents: 30_000, approvedCents: 30_000 } });

  await page.goto("/ugc");
  await expect(page.getByRole("heading", { name: "UGC Studio" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "UGC workspace" })).toBeVisible();
});
