import { expect, test } from "@playwright/test";
test.setTimeout(120_000);

const pixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNkYPj/n4GBgYGJAQoAHgQCAfKxWiAAAAAASUVORK5CYII=",
  "base64",
);

test("DesignStudio saves, versions, reviews, resizes, exports, and distributes governed graphics", async ({ page }, testInfo) => {
  const stamp = `${testInfo.project.name}-${Date.now()}`;
  const createdResponse = await page.request.post("/api/design", { data: { name: `Launch ${stamp}`, kind: "thumbnail", width: 1280, height: 720, brandKitId: null } }); expect(createdResponse.status()).toBe(201); const project = await createdResponse.json() as { id: string; revision: number; document: { pages: Array<{ id: string; elements: unknown[] }> } };
  const document = structuredClone(project.document); document.pages[0].elements.push({ id: "proof", type: "shape", shape: "ellipse", x: 900, y: 400, width: 220, height: 220, rotation: 0, opacity: 0.9, locked: true, zIndex: 9, fill: "#1d9bf0", stroke: "#ffffff", strokeWidth: 4, radius: 0 });
  const saved = await page.request.patch(`/api/design/${project.id}`, { data: { revision: project.revision, document } }); expect(saved.status()).toBe(200); const savedProject = await saved.json() as { revision: number }; expect(savedProject.revision).toBe(project.revision + 1);
  const conformance = await page.request.get(`/api/design/${project.id}`); expect(conformance.status()).toBe(200); const conformancePayload = await conformance.json() as { versions: Array<{ revision: number }>; events: Array<{ eventType: string; revision: number }> }; expect(conformancePayload.versions.map((version) => version.revision)).toEqual([2, 1]); expect(conformancePayload.events.map((event) => event.eventType)).toEqual(expect.arrayContaining(["design.project.created", "design.project.revised"]));
  const stale = await page.request.patch(`/api/design/${project.id}`, { data: { revision: project.revision, document } }); expect(stale.status()).toBe(409);
  const template = await page.request.post(`/api/design/${project.id}/templates`, { data: { name: `Locked ${stamp}` } }); expect(template.status()).toBe(201); expect((await template.json()).lockedElementIds).toContain("proof");
  const variant = await page.request.post(`/api/design/${project.id}/resize`, { data: { name: `Square ${stamp}`, width: 1080, height: 1080, mode: "fit" } }); expect(variant.status()).toBe(201); expect((await variant.json()).sourceProjectId).toBe(project.id);
  const versionResponse = await page.request.post(`/api/design/${project.id}/versions`, { data: { label: "Client review" } }); expect(versionResponse.status()).toBe(201); const version = await versionResponse.json() as { id: string; revision: number }; expect(version.revision).toBe(savedProject.revision);
  const reviewResponse = await page.request.post(`/api/design/versions/${version.id}/review`, { data: { label: "Launch creative", days: 7 } }); expect(reviewResponse.status()).toBe(201); const review = await reviewResponse.json() as { reviewUrl: string }; const token = review.reviewUrl.split("/").at(-1)!;
  const publicReview = await page.request.get(`/api/design/reviews/${token}`); expect(publicReview.status()).toBe(200); expect((await publicReview.json()).version.document.pages[0].elements).toHaveLength(3);
  const preview = await page.request.get(`/api/design/reviews/${token}/preview.svg?pageId=page-1`); expect(preview.status()).toBe(200); expect(await preview.text()).toContain("Make the idea impossible to ignore");
  expect((await page.request.post(`/api/design/reviews/${token}/comments`, { data: { reviewerName: "Reviewer", body: "Increase contrast", pageId: "page-1", x: 0.4, y: 0.5 } })).status()).toBe(201);
  expect((await page.request.post(`/api/design/reviews/${token}/decision`, { data: { reviewerName: "Reviewer", decision: "approved", note: "Ready" } })).status()).toBe(201);
  const reviewed = await page.request.get(`/api/design/${project.id}`); const reviewedPayload = await reviewed.json() as { project: { status: string }; events: Array<{ eventType: string }> }; expect(reviewedPayload.project.status).toBe("approved"); expect(reviewedPayload.events.map((event) => event.eventType)).toEqual(expect.arrayContaining(["design.review.started", "design.review.commented", "design.review.approved"]));
  for (const format of ["svg", "png", "jpeg", "webp"]) { const exported = await page.request.post(`/api/design/${project.id}/export`, { data: { format, pageId: "page-1", visibility: "private", quality: 90, scale: format === "svg" ? 1 : 0.5 } }); expect(exported.status()).toBe(201); const payload = await exported.json(); expect(payload.asset.mimeType).toContain(format === "jpeg" ? "jpeg" : format); if (format === "png") { const distribution = await page.request.post(`/api/design/${project.id}/distribution`, { data: { assetId: payload.asset.id, content: "Launch", platforms: ["creativesos"], scheduledFor: new Date(Date.now() + 60_000).toISOString() } }); expect(distribution.status()).toBe(201); expect((await distribution.json()).assetIds).toContain(payload.asset.id); } }
  expect((await page.request.post(`/api/design/${project.id}/collaborators`, { data: { userId: testInfo.project.name === "mobile-chromium" ? 2 : 1, role: "editor" } })).status()).toBe(201);
  const sourceName = `design-source-${stamp}.png`;
  const sourceResponse = await page.request.post("/api/assets/upload-proxy", {
    multipart: {
      kind: "photo",
      visibility: "private",
      image: { name: sourceName, mimeType: "image/png", buffer: pixel },
    },
  });
  expect(sourceResponse.status()).toBe(201);
  const source = (await sourceResponse.json()) as { asset: { id: string } };
  const streamResponse = await page.request.get(
    `/api/assets/${source.asset.id}/stream`,
  );
  expect(streamResponse.status()).toBe(200);
  expect(streamResponse.headers()["content-type"]).toContain("image/png");

  await page.goto("/business/design"); await expect(page.getByRole("heading", { name: "DesignStudio" })).toBeVisible(); await expect(page.getByText(`Launch ${stamp}`)).toBeVisible(); await page.getByText(`Launch ${stamp}`).click(); await expect(page.getByLabel("Design canvas")).toBeVisible(); await expect(page.getByRole("button", { name: "Export" })).toBeVisible();
  await page.getByLabel("Media Cloud image").selectOption({ label: sourceName });
  await expect(page.getByText("Media Cloud image added to the design.")).toBeVisible();
  await expect(page.getByLabel("Design canvas").locator("image")).toHaveCount(1);
  await page.getByLabel("Alternative text").fill("Campaign source artwork");
  await page.getByLabel("Image fit").selectOption("contain");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved with conflict protection.")).toBeVisible();
  await page.reload();
  const renderedImage = page.getByLabel("Design canvas").locator("image");
  await expect(renderedImage).toHaveCount(1);
  await expect(renderedImage).toHaveAttribute(
    "href",
    `/api/assets/${source.asset.id}/stream`,
  );
  await expect(renderedImage).toHaveAttribute("preserveAspectRatio", "xMidYMid meet");
  await page.getByRole("button", { name: "Export" }).click();
  await expect(page.getByText("PNG exported to Media Cloud.")).toBeVisible();
});
