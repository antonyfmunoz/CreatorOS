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
  const xRequirements = social.parityRequirements.filter(
    (requirement: {
      comparisonProduct: string;
      tier: string;
    }) =>
      requirement.comparisonProduct === "X" &&
      requirement.tier === "required_parity",
  );
  expect(xRequirements.length).toBeGreaterThanOrEqual(8);

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

  const requirementResults = xRequirements.map(
    (requirement: { id: string; capability: string }, index: number) => ({
      requirementId: requirement.id,
      status: index === 0 ? "failed" : "passed",
      evidenceKinds: [
        "input_manifest",
        "action_log",
        "output_artifact",
        "run_recording",
      ],
      note:
        index === 0
          ? `The locked evidence shows a material ${requirement.capability} deficit that requires product remediation.`
          : `The locked evidence proves ${requirement.capability} in both compared runs.`,
    }),
  );
  const incompleteAssessment = await page.request.post(
    `/api/benchmarks/${social.id}/assess`,
    {
      data: {
        creativesOsRunId: nativeRun.id,
        comparisonRunId: comparisonRun.id,
        qualityComparable: true,
        reviewerNote:
          "This deliberately incomplete review must not be accepted as specialist-substitution parity.",
        requirementResults: requirementResults.slice(1),
      },
    },
  );
  expect(incompleteAssessment.status()).toBe(409);
  expect(await incompleteAssessment.json()).toMatchObject({
    message:
      "Assess every locked required-parity capability for the selected comparison product",
    missingRequirementIds: [xRequirements[0]!.id],
  });

  const assessmentResponse = await page.request.post(
    `/api/benchmarks/${social.id}/assess`,
    {
      data: {
        creativesOsRunId: nativeRun.id,
        comparisonRunId: comparisonRun.id,
        qualityComparable: true,
        reviewerNote:
          "The locked outputs are materially comparable across output quality, safety, reliability, and accessibility for this qualification fixture.",
        requirementResults,
      },
    },
  );
  await ok(assessmentResponse);
  expect(await assessmentResponse.json()).toMatchObject({
    state: "parity_failed",
    qualityComparable: true,
    requiredCapabilityCount: xRequirements.length,
    passedCapabilityCount: xRequirements.length - 1,
    failedCapabilityCount: 1,
  });

  const failedListResponse = await page.request.get("/api/benchmarks");
  await ok(failedListResponse);
  const failedSocial = (await failedListResponse.json()).find(
    (definition: { family: string }) => definition.family === "native_social",
  );
  expect(failedSocial.remediations).toHaveLength(1);
  expect(failedSocial.remediations[0]).toMatchObject({
    requirementId: xRequirements[0]!.id,
    comparisonProduct: "X",
    status: "open",
    priority: 100,
    failureCount: 1,
  });
  expect(failedSocial.remediations[0].workItemId).toBeTruthy();

  const manualResolve = await page.request.patch(
    `/api/benchmarks/remediations/${failedSocial.remediations[0].id}`,
    { data: { status: "resolved" } },
  );
  expect(manualResolve.status()).toBe(400);

  await page.goto("/business/benchmarks");
  const remediationSection = page
    .getByText("Mandatory parity remediation")
    .first()
    .locator("xpath=ancestor::section");
  await remediationSection.getByText("Plan ownership and timing").click();
  await remediationSection.getByLabel("Remediation priority").fill("83");
  await remediationSection.getByLabel("Remediation due date").fill("2026-09-15");
  await remediationSection
    .getByLabel("Remediation operator note")
    .fill("Product owner will close the measured parity deficit before the September release train.");
  await remediationSection.getByRole("button", { name: "Save plan" }).click();
  await expect(page.getByText("Remediation plan saved")).toBeVisible();
  const plannedListResponse = await page.request.get("/api/benchmarks");
  await ok(plannedListResponse);
  const plannedSocial = (await plannedListResponse.json()).find(
    (definition: { family: string }) => definition.family === "native_social",
  );
  expect(plannedSocial.remediations[0]).toMatchObject({
    priority: 83,
    operatorNote:
      "Product owner will close the measured parity deficit before the September release train.",
  });
  expect(plannedSocial.remediations[0].dueAt).toContain("2026-09-15");

  await ok(
    await page.request.patch(
      `/api/benchmarks/remediations/${failedSocial.remediations[0].id}`,
      { data: { status: "in_progress" } },
    ),
  );
  await ok(
    await page.request.patch(
      `/api/benchmarks/remediations/${failedSocial.remediations[0].id}`,
      { data: { status: "ready_for_retest" } },
    ),
  );

  const planningResponse = await page.request.get("/api/planning/calendar");
  await ok(planningResponse);
  expect(await planningResponse.json()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: failedSocial.remediations[0].workItemId,
        sourceType: "benchmark_remediation",
        kind: "product_gap",
        status: "review",
      }),
    ]),
  );
  const plannerCloseAttempt = await page.request.post(
    `/api/planning/items/${failedSocial.remediations[0].workItemId}/status`,
    { data: { status: "scheduled" } },
  );
  expect(plannerCloseAttempt.status()).toBe(409);
  expect(await plannerCloseAttempt.json()).toMatchObject({
    message: "A benchmark remediation can close only after a passing locked retest",
  });

  const retestNativeStart = await page.request.post(
    `/api/benchmarks/${social.id}/runs`,
    {
      data: {
        implementation: "creativesos",
        comparisonProduct: null,
        environment: lockedEnvironment,
      },
    },
  );
  await ok(retestNativeStart);
  const retestNative = await retestNativeStart.json();
  const retestComparisonStart = await page.request.post(
    `/api/benchmarks/${social.id}/runs`,
    {
      data: {
        implementation: "comparison",
        comparisonProduct: "X",
        environment: lockedEnvironment,
      },
    },
  );
  await ok(retestComparisonStart);
  const retestComparison = await retestComparisonStart.json();
  await ok(
    await page.request.patch(`/api/benchmarks/runs/${retestNative.id}`, {
      data: completedRun({
        activeTimeMs: 600_000,
        elapsedTimeMs: 720_000,
        manualHandoffCount: 1,
      }),
    }),
  );
  await ok(
    await page.request.patch(`/api/benchmarks/runs/${retestComparison.id}`, {
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
  const retestAssessment = await page.request.post(
    `/api/benchmarks/${social.id}/assess`,
    {
      data: {
        creativesOsRunId: retestNative.id,
        comparisonRunId: retestComparison.id,
        qualityComparable: true,
        reviewerNote:
          "The locked retest proves the remediated capability and all other required outcomes are now materially comparable.",
        requirementResults: requirementResults.map((result) => ({
          ...result,
          status: "passed",
          note: `The locked retest closes ${result.requirementId} with evidence in both runs.`,
        })),
      },
    },
  );
  await ok(retestAssessment);
  const retestAssessmentBody = await retestAssessment.json();
  expect(retestAssessmentBody).toMatchObject({
    state: "connected_advantage_proven",
    failedCapabilityCount: 0,
  });

  const resolvedListResponse = await page.request.get("/api/benchmarks");
  await ok(resolvedListResponse);
  const resolvedSocial = (await resolvedListResponse.json()).find(
    (definition: { family: string }) => definition.family === "native_social",
  );
  expect(resolvedSocial.remediations[0]).toMatchObject({ status: "resolved" });
  expect(resolvedSocial.remediations[0].resolvedByAssessmentId).toBe(
    retestAssessmentBody.id,
  );

  const resolvedPlanningResponse = await page.request.get("/api/planning/calendar");
  await ok(resolvedPlanningResponse);
  expect(await resolvedPlanningResponse.json()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: failedSocial.remediations[0].workItemId,
        status: "retrospective",
      }),
    ]),
  );

  await page.goto("/business/benchmarks");
  await expect(
    page.getByRole("heading", { name: "Competitive Benchmarks" }),
  ).toBeVisible();
  await expect(
    page.getByText("Specialist-substitution parity contract").first(),
  ).toBeVisible();
  await expect(page.getByText("Mandatory parity remediation").first()).toBeVisible();
  await expect(page.getByText(/resolved by locked retest/).first()).toBeVisible();
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
