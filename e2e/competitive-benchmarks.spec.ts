import { expect, test, type APIResponse, type Page } from "@playwright/test";

async function ok(response: APIResponse) {
  expect(
    response.ok(),
    `${response.status()} ${response.url()}: ${await response.text()}`,
  ).toBeTruthy();
}

const completedRun = (overrides: Record<string, unknown>) => ({
  status: "completed",
  activeTimeMs: 600_000,
  elapsedTimeMs: 900_000,
  applicationCount: 1,
  exportCount: 0,
  uploadCount: 0,
  manualHandoffCount: 0,
  actionCount: 24,
  retryCount: 0,
  failureCount: 0,
  unrecoverableErrorCount: 0,
  outputQualityScore: 4.8,
  safetyScore: 4.8,
  reliabilityScore: 4.8,
  accessibilityScore: 4.8,
  notes:
    "Qualification operator completed the locked workflow and preserved all required technical evidence.",
  evidence: [
    {
      kind: "input_manifest",
      uri: "artifact://benchmark/input",
      checksum: "sha256:input",
    },
    {
      kind: "action_log",
      uri: "artifact://benchmark/actions",
      checksum: "sha256:actions",
    },
    {
      kind: "output_artifact",
      uri: "artifact://benchmark/output",
      checksum: "sha256:output",
    },
    {
      kind: "run_recording",
      uri: "artifact://benchmark/recording",
      checksum: "sha256:recording",
    },
  ],
  ...overrides,
});

test("locked equal-input runs preserve evidence and calculate connected advantage", async ({
  page,
}) => {
  const lockedEnvironment = {
    protocolVersion: "1",
    sourceManifestId: "manifest:native-social-fixture-v1",
    deviceClass: "desktop-browser",
    networkClass: "broadband",
    operatorSkillLevel: "trained",
    locale: "en-US",
  };
  const listResponse = await page.request.get("/api/benchmarks");
  await ok(listResponse);
  const definitions = await listResponse.json();
  expect(definitions).toHaveLength(20);
  expect(
    new Set(
      definitions.map((definition: { family: string }) => definition.family),
  ).size,
  ).toBe(20);
  for (const definition of definitions) {
    expect(definition.sourceReferences.length).toBeGreaterThan(0);
    expect(definition.competitiveState).toBe("not_benchmarked");
  }
  const social = definitions.find(
    (definition: { family: string }) => definition.family === "native_social",
  );
  expect(social.competitiveState).toBe("not_benchmarked");
  expect(social.sourceReferences.length).toBeGreaterThanOrEqual(4);

  const lockResponse = await page.request.post(
    `/api/benchmarks/${social.id}/lock`,
  );
  await ok(lockResponse);
  expect((await lockResponse.json()).status).toBe("locked");
  expect(
    (await page.request.post(`/api/benchmarks/${social.id}/lock`)).status(),
  ).toBe(409);

  const nativeStart = await page.request.post(
    `/api/benchmarks/${social.id}/runs`,
    {
      data: {
        implementation: "creativesos",
        comparisonProduct: null,
        environment: lockedEnvironment,
      },
    },
  );
  await ok(nativeStart);
  const nativeRun = await nativeStart.json();
  const comparisonStart = await page.request.post(
    `/api/benchmarks/${social.id}/runs`,
    {
      data: {
        implementation: "comparison",
        comparisonProduct: "X",
        environment: lockedEnvironment,
      },
    },
  );
  await ok(comparisonStart);
  const comparisonRun = await comparisonStart.json();
  expect(
    (
      await page.request.post(`/api/benchmarks/${social.id}/runs`, {
        data: {
          implementation: "comparison",
          comparisonProduct: "Unlisted Product",
          environment: {},
        },
      })
    ).status(),
  ).toBe(400);

  await ok(
    await page.request.patch(`/api/benchmarks/runs/${nativeRun.id}`, {
      data: completedRun({
        activeTimeMs: 600_000,
        elapsedTimeMs: 720_000,
        manualHandoffCount: 1,
      }),
    }),
  );
  await ok(
    await page.request.patch(`/api/benchmarks/runs/${comparisonRun.id}`, {
      data: completedRun({
        activeTimeMs: 900_000,
        elapsedTimeMs: 1_200_000,
        applicationCount: 4,
        exportCount: 2,
        uploadCount: 2,
        manualHandoffCount: 4,
        outputQualityScore: 5,
        safetyScore: 5,
        reliabilityScore: 5,
        accessibilityScore: 5,
      }),
    }),
  );

  const assessmentResponse = await page.request.post(
    `/api/benchmarks/${social.id}/assess`,
    {
      data: {
        creativesOsRunId: nativeRun.id,
        comparisonRunId: comparisonRun.id,
        qualityComparable: true,
        reviewerNote:
          "The locked outputs are materially comparable across output quality, safety, reliability, and accessibility for this qualification fixture.",
      },
    },
  );
  await ok(assessmentResponse);
  expect(await assessmentResponse.json()).toMatchObject({
    state: "connected_advantage_proven",
    qualityComparable: true,
  });

  await page.goto("/business/benchmarks");
  await expect(
    page.getByRole("heading", { name: "Competitive Benchmarks" }),
  ).toBeVisible();
  await expect(
    page
      .locator("div.inline-flex")
      .filter({ hasText: /^connected advantage proven$/ })
      .first(),
  ).toBeVisible();
  await expect(page.getByText("Current primary sources").first()).toBeVisible();
  await page.getByLabel("Search benchmark families").fill("Vimeo");
  await expect(page.getByText("Showing 1 of 20 families")).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Ingest, govern, review, publish and retire reusable media",
    }),
  ).toBeVisible();
});
