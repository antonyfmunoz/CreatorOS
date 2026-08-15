import {
  expect,
  test,
  type APIResponse,
  type Page,
  type TestInfo,
} from "@playwright/test";

function actors(testInfo: TestInfo) {
  const owner = testInfo.project.name.startsWith("mobile") ? 1 : 2;
  return { owner, peer: owner === 1 ? 2 : 1, outsider: 5 };
}

async function api(
  page: Page,
  actor: number,
  method: string,
  url: string,
  data?: unknown,
) {
  return page.request.fetch(url, {
    method,
    data,
    headers: { "x-creativesos-demo-user": String(actor) },
  });
}

async function ok(response: APIResponse) {
  expect(
    response.ok(),
    `${response.status()} ${response.url()}: ${await response.text()}`,
  ).toBeTruthy();
}

test("community onboarding and evidence-backed gamification enforce the full member lifecycle", async ({
  page,
}, testInfo) => {
  const { owner, peer, outsider } = actors(testInfo);
  const marker = `${testInfo.project.name}-${Date.now()}`;

  const createdResponse = await api(page, owner, "POST", "/api/communities", {
    name: `Engagement ${marker}`,
    description: "A guided, qualified community journey.",
    iconColor: "#27272a",
  });
  await ok(createdResponse);
  const community = await createdResponse.json();

  const questionsResponse = await api(
    page,
    owner,
    "PUT",
    `/api/communities/${community.id}/onboarding/questions`,
    {
      questions: [
        {
          prompt: "What outcome are you building toward?",
          kind: "text",
          options: [],
          required: true,
        },
        {
          prompt: "Choose your current focus",
          kind: "single_select",
          options: [
            { id: "audience", label: "Audience" },
            { id: "revenue", label: "Revenue" },
          ],
          required: true,
        },
      ],
    },
  );
  await ok(questionsResponse);
  const questions = (await questionsResponse.json()).questions;

  expect(
    (
      await api(
        page,
        outsider,
        "GET",
        `/api/communities/${community.id}/onboarding`,
      )
    ).status(),
  ).toBe(403);
  expect(
    (
      await api(
        page,
        outsider,
        "GET",
        `/api/communities/${community.id}/leaderboard`,
      )
    ).status(),
  ).toBe(403);
  await ok(
    await api(page, peer, "POST", `/api/communities/${community.id}/join`, {}),
  );

  const incomplete = await api(
    page,
    peer,
    "POST",
    `/api/communities/${community.id}/onboarding/complete`,
    {
      answers: [
        { questionId: questions[0].id, value: "Build a durable audience" },
      ],
    },
  );
  expect(incomplete.status()).toBe(400);
  const invalidOption = await api(
    page,
    peer,
    "POST",
    `/api/communities/${community.id}/onboarding/complete`,
    {
      answers: [
        { questionId: questions[0].id, value: "Build a durable audience" },
        { questionId: questions[1].id, value: "not-an-option" },
      ],
    },
  );
  expect(invalidOption.status()).toBe(400);
  const validAnswers = {
    answers: [
      { questionId: questions[0].id, value: "Build a durable audience" },
      { questionId: questions[1].id, value: "audience" },
    ],
  };
  await ok(
    await api(
      page,
      peer,
      "POST",
      `/api/communities/${community.id}/onboarding/complete`,
      validAnswers,
    ),
  );
  // Retrying a successful request is safe and cannot mint another reward.
  await ok(
    await api(
      page,
      peer,
      "POST",
      `/api/communities/${community.id}/onboarding/complete`,
      validAnswers,
    ),
  );

  const channelsResponse = await api(
    page,
    owner,
    "GET",
    `/api/communities/${community.id}/channels`,
  );
  await ok(channelsResponse);
  const [channel] = await channelsResponse.json();
  for (let index = 0; index < 12; index += 1) {
    await ok(
      await api(page, peer, "POST", "/api/channel-messages", {
        channelId: channel.id,
        content: `Substantive qualification message ${index} for ${marker}`,
      }),
    );
  }

  const leaderboardResponse = await api(
    page,
    peer,
    "GET",
    `/api/communities/${community.id}/leaderboard`,
  );
  await ok(leaderboardResponse);
  const leaderboard = await leaderboardResponse.json();
  const peerEntry = leaderboard.entries.find(
    (entry: { userId: number }) => entry.userId === peer,
  );
  expect(peerEntry).toMatchObject({ rank: 1, points: 55, level: 2 });
  expect(
    peerEntry.badges.map((badge: { name: string }) => badge.name),
  ).toContain("First steps");

  // Updating the flow deliberately asks active members to confirm it again.
  await ok(
    await api(
      page,
      owner,
      "PUT",
      `/api/communities/${community.id}/onboarding/questions`,
      {
        questions: questions.map(
          (question: {
            id: string;
            prompt: string;
            kind: string;
            options: unknown[];
            required: boolean;
          }) => ({
            ...question,
            prompt: question.prompt.replace("building", "working"),
          }),
        ),
      },
    ),
  );

  await page.setExtraHTTPHeaders({ "x-creativesos-demo-user": String(peer) });
  await page.goto(`/communities/${community.id}`);
  await expect(page.getByTestId("community-onboarding")).toBeVisible();
  await page
    .getByRole("textbox", { name: /What outcome/ })
    .fill("A qualified member journey");
  await page.getByText("Audience", { exact: true }).click();
  await page.getByRole("button", { name: "Complete onboarding" }).click();
  await expect(page.getByTestId("community-progress-summary")).toBeVisible();
  await page
    .getByTestId("community-progress-summary")
    .getByRole("button", { name: "Leaderboard" })
    .click();
  await expect(page.getByTestId("community-leaderboard")).toContainText(
    "55 points",
  );
  await expect(page.getByTestId("current-community-rank")).toContainText("#1");
});
