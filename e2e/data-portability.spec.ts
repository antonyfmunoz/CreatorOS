import { expect, test, type Page, type TestInfo } from "@playwright/test";

function actor(testInfo: TestInfo) {
  return testInfo.project.name.startsWith("mobile") ? 1 : 2;
}

function api(page: Page, userId: number, method: string, url: string, data?: unknown) {
  return page.request.fetch(url, { method, data, headers: { "x-creativesos-demo-user": String(userId) } });
}

test("portable operating data validates, imports atomically, replays safely and exports", async ({ page }, testInfo) => {
  const owner = actor(testInfo);
  const outsider = owner === 1 ? 2 : 1;
  const marker = `${testInfo.project.name}-${Date.now()}`;
  const migrationPackage = {
    schemaVersion: "creativesos.portability.v1",
    sourceSystem: "qualification-suite",
    products: [{ sourceId: `product-${marker}`, title: `Portable offer ${marker}`, description: "Migrated product", price: 29, category: "Education", status: "draft" }],
    courses: [{ sourceId: `course-${marker}`, title: `Portable course ${marker}`, description: "Migrated course", price: 49, category: "Education", status: "draft", modules: [{ sourceId: `module-${marker}`, title: "Foundation", description: "Start here", lessons: [{ sourceId: `lesson-${marker}`, title: "Welcome", body: "Portable lesson", published: true, assessment: { passingScorePercent: 70, questions: [{ id: `question-${marker}`, prompt: "Ready?", choices: ["Yes", "No"], answerIndex: 0 }] } }] }] }],
    contacts: [{ sourceId: `contact-${marker}`, name: `Portable contact ${marker}`, purchaseInfo: "Imported with consent evidence retained externally" }],
    automations: [{ sourceId: `automation-${marker}`, name: `Portable automation ${marker}`, description: "Review before activation", triggerType: "manual", triggerConfig: {}, status: "draft", steps: [{ stepKey: "compose", name: "Compose", actionType: "text.compose", config: { template: "Hello {{input.name}}" }, position: 0, approvalPolicy: "none", retryLimit: 1, timeoutMs: 10_000 }] }],
  };
  const validation = await api(page, owner, "POST", "/api/portability/import/validate", { package: migrationPackage });
  expect(validation.ok(), await validation.text()).toBeTruthy();
  expect(await validation.json()).toMatchObject({ valid: true, counts: { total: 4 }, guarantees: { atomic: true, idempotent: true, importedAutomationsInactive: true } });

  const idempotencyKey = `portability-${marker}`;
  const imported = await api(page, owner, "POST", "/api/portability/import", { idempotencyKey, package: migrationPackage });
  expect(imported.status(), await imported.text()).toBe(201);
  expect(await imported.json()).toMatchObject({ replayed: false, job: { status: "completed", summary: { totalImported: 4, totalSkipped: 0 } } });
  const replay = await api(page, owner, "POST", "/api/portability/import", { idempotencyKey, package: migrationPackage });
  expect(replay.ok(), await replay.text()).toBeTruthy();
  expect(await replay.json()).toMatchObject({ replayed: true, job: { status: "completed" } });
  const conflict = await api(page, owner, "POST", "/api/portability/import", { idempotencyKey, package: { ...migrationPackage, products: [{ ...migrationPackage.products[0], price: 30 }] } });
  expect(conflict.status()).toBe(409);

  const ownerJobs = await api(page, owner, "GET", "/api/portability/imports");
  expect(ownerJobs.ok()).toBeTruthy();
  expect((await ownerJobs.json()).some((job: { idempotencyKey: string }) => job.idempotencyKey === idempotencyKey)).toBe(true);
  const outsiderJobs = await api(page, outsider, "GET", "/api/portability/imports");
  expect(outsiderJobs.ok()).toBeTruthy();
  expect((await outsiderJobs.json()).some((job: { idempotencyKey: string }) => job.idempotencyKey === idempotencyKey)).toBe(false);

  const exported = await api(page, owner, "GET", "/api/portability/export");
  expect(exported.ok(), await exported.text()).toBeTruthy();
  const bundle = await exported.json();
  expect(bundle.schemaVersion).toBe("creativesos.portability.v1");
  expect(bundle.products.some((product: { title: string }) => product.title === `Portable offer ${marker}`)).toBe(true);
  expect(bundle.courses.some((course: { title: string; modules: unknown[] }) => course.title === `Portable course ${marker}` && course.modules.length === 1)).toBe(true);
  expect(bundle.contacts.some((contact: { name: string }) => contact.name === `Portable contact ${marker}`)).toBe(true);
  expect(bundle.automations.some((automation: { name: string; status: string }) => automation.name === `Portable automation ${marker}` && automation.status === "draft")).toBe(true);

  const secretPackage = { ...migrationPackage, automations: [{ ...migrationPackage.automations[0], sourceId: `secret-${marker}`, triggerConfig: { api_key: "do-not-import" } }] };
  const secretValidation = await api(page, owner, "POST", "/api/portability/import/validate", { package: secretPackage });
  expect(secretValidation.ok()).toBeTruthy();
  expect(await secretValidation.json()).toMatchObject({ valid: false });

  await page.goto("/business/portability");
  await expect(page.getByRole("heading", { name: "Data portability" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Validate" })).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
});
