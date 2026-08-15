import { expect, test, type Page } from "@playwright/test";

const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
async function upload(page: Page, name: string) {
  const response = await page.request.post("/api/assets/upload-proxy", { multipart: { kind: "photo", visibility: "private", image: { name, mimeType: "image/png", buffer: pixel } } }); expect(response.status()).toBe(201); return (await response.json() as { asset: { id: string } }).asset;
}

test("provenance and rights enforcement propagate through derivatives", async ({ page }) => {
  await page.goto("/"); const stamp = Date.now(); const parent = await upload(page, `rights-parent-${stamp}.png`); const child = await upload(page, `rights-child-${stamp}.png`);
  expect((await page.request.post(`/api/trust/assets/${parent.id}/provenance`, { data: { kind: "cloned_voice", provider: "qualification", model: "consented-fixture", tool: "CreativesOS", disclosure: "Synthetic voice disclosed and backed by explicit speaker consent.", sourceAssetIds: [], metadata: { consent: "field_test" } } })).status()).toBe(201);
  expect((await page.request.post(`/api/media/assets/${child.id}/lineage`, { data: { parentAssetId: parent.id, relationship: "derived_from", metadata: { fieldTest: true } } })).status()).toBe(201);
  const childClaims = await (await page.request.get(`/api/trust/assets/${child.id}/provenance`)).json() as Array<{ kind: string; inheritedFromClaimId: string | null }>;
  expect(childClaims.some((claim) => claim.kind === "cloned_voice" && claim.inheritedFromClaimId)).toBe(true);
  const parentDetail = await (await page.request.get(`/api/media/assets/${parent.id}`)).json() as { rights: Array<{ id: string }> }; expect(parentDetail.rights.length).toBeGreaterThan(0);
  expect((await page.request.post(`/api/media/assets/${parent.id}/rights/${parentDetail.rights[0].id}/status`, { data: { status: "revoked" } })).status()).toBe(200);
  const childDetail = await (await page.request.get(`/api/media/assets/${child.id}`)).json() as { rights: Array<{ effectiveStatus: string }> }; expect(childDetail.rights.every((right) => right.effectiveStatus === "revoked")).toBe(true);

  const statement = "I declare under penalty of perjury that I own the identified work and that the challenged use is not authorized by me, my agent, or the law.";
  const takedown = await (await page.request.post("/api/trust/rights-cases", { data: { assetId: parent.id, targetType: "asset", targetId: parent.id, caseType: "takedown", claimantName: "Qualification Rights Owner", contactEmail: "rights@example.com", statement, jurisdiction: "US", evidence: [{ assetId: parent.id }] } })).json() as { id: string };
  const counter = await page.request.post("/api/trust/rights-cases", { data: { assetId: parent.id, targetType: "asset", targetId: parent.id, caseType: "counter_notice", parentCaseId: takedown.id, claimantName: "Qualification Publisher", contactEmail: "publisher@example.com", statement: `${statement} I consent to the applicable jurisdiction and request restoration after notice.`, jurisdiction: "US", evidence: [] } }); expect(counter.status()).toBe(201);
  const caseDetail = await (await page.request.get(`/api/trust/rights-cases/${takedown.id}`)).json() as { status: string; events: Array<{ eventType: string }> }; expect(caseDetail.status).toBe("countered"); expect(caseDetail.events.some((event) => event.eventType === "counter_notice.received")).toBe(true);
});
