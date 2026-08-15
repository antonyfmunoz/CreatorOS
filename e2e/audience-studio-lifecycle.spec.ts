import { expect, test } from "@playwright/test";

test("Audience Studio captures, nurtures, exports, hands off, and honors opt-out", async ({ page }) => {
  const stamp = `${test.info().project.name}-${Date.now()}`;
  const email = `audience-${stamp}@example.com`;
  const created = await page.request.post("/api/audience/forms", { data: { name: `Form ${stamp}`, title: "Join the owned audience", description: "A governed signup", fields: [{ key: "role", label: "Role", type: "select", required: true, options: ["creator", "brand"] }], tags: ["field-test"], consentPurpose: "marketing", disclosureVersion: "qualification-v1", successMessage: "Welcome aboard" } });
  expect(created.status()).toBe(201);
  const form = await created.json() as { id: string; publicId: string };
  expect((await page.request.post(`/api/audience/forms/${form.id}/publish`)).status()).toBe(200);
  const publicForm = await page.request.get(`/api/public/audience/forms/${form.publicId}`); expect(publicForm.status()).toBe(200); expect((await publicForm.json()).fields[0].key).toBe("email");
  const invalid = await page.request.post(`/api/public/audience/forms/${form.publicId}/submissions`, { data: { email, displayName: "Qualified Subscriber", values: {}, consentGranted: true } }); expect(invalid.status()).toBe(400);
  const submission = await page.request.post(`/api/public/audience/forms/${form.publicId}/submissions`, { data: { email, displayName: "Qualified Subscriber", values: { role: "creator" }, consentGranted: true } }); expect(submission.status()).toBe(201);

  const audience = await (await page.request.get("/api/audience")).json() as { profiles: Array<{ profile: { relationshipId: string; subscriberStatus: string }; relationship: { displayName: string } }> };
  const captured = audience.profiles.find((row) => row.relationship.displayName === "Qualified Subscriber"); expect(captured?.profile.subscriberStatus).toBe("subscribed"); const relationshipId = captured!.profile.relationshipId;

  const sequenceResponse = await page.request.post("/api/audience/sequences", { data: { name: `Welcome ${stamp}`, trigger: { type: "manual", value: null }, steps: [{ position: 1, delayMinutes: 0, subject: "Welcome", previewText: "Start here", content: [{ id: "welcome", type: "text", content: { text: "Welcome to the owned audience" } }] }] } }); expect(sequenceResponse.status()).toBe(201); const sequence = (await sequenceResponse.json()).sequence as { id: string };
  expect((await page.request.post(`/api/audience/sequences/${sequence.id}/activate`)).status()).toBe(200);
  expect((await page.request.post(`/api/audience/sequences/${sequence.id}/enroll`, { data: { relationshipId } })).status()).toBe(201);
  const dispatched = await (await page.request.post("/api/audience/sequences/dispatch-due")).json() as { dispatched: number }; expect(dispatched.dispatched).toBeGreaterThanOrEqual(1);

  const issueResponse = await page.request.post("/api/audience/newsletters/issues", { data: { name: `Issue ${stamp}`, subject: "The field-tested issue", previewText: "Preview", segmentId: null, content: [{ id: "body", type: "text", content: { text: "A complete newsletter lifecycle" } }], variants: [{ key: "a", subject: "Variant A", percentage: 50 }, { key: "b", subject: "Variant B", percentage: 50 }], scheduledAt: null } }); expect(issueResponse.status()).toBe(201); const issue = await issueResponse.json() as { id: string };
  const sent = await (await page.request.post(`/api/audience/newsletters/issues/${issue.id}/send`)).json() as { recipients: number; accepted: number }; expect(sent.recipients).toBeGreaterThanOrEqual(1); expect(sent.accepted).toBe(sent.recipients);

  expect((await page.request.post(`/api/audience/relationships/${relationshipId}/handoff`, { data: { reason: "Subscriber requested a strategy call" } })).status()).toBe(201);
  const link = await (await page.request.post(`/api/audience/relationships/${relationshipId}/preference-link`)).json() as { token: string };
  expect((await page.request.get(`/api/public/audience/preferences/${link.token}`)).status()).toBe(200);
  expect((await page.request.put(`/api/public/audience/preferences/${link.token}`, { data: { marketingEmail: false, digestCadence: "off", timezone: "UTC" } })).status()).toBe(200);
  const afterOptOut = await (await page.request.get("/api/audience")).json() as { profiles: Array<{ profile: { relationshipId: string; subscriberStatus: string } }> }; expect(afterOptOut.profiles.find((row) => row.profile.relationshipId === relationshipId)?.profile.subscriberStatus).toBe("unsubscribed");

  const imported = await (await page.request.post("/api/audience/import", { data: { csv: `email,name,consent,tags\nformula-${stamp}@example.com,=2+2,unknown,imported` } })).json() as { imported: number }; expect(imported.imported).toBe(1);
  const exported = await page.request.get("/api/audience/export.csv"); expect(exported.status()).toBe(200); expect(await exported.text()).toContain("'=2+2");

  await page.goto("/business/audience"); await expect(page.getByRole("heading", { name: "Audience Studio" })).toBeVisible(); await page.getByRole("button", { name: "capture" }).click(); await expect(page.getByText("Join the owned audience")).toBeVisible(); await page.getByRole("button", { name: "newsletters" }).click(); await expect(page.getByText("The field-tested issue")).toBeVisible();
});
