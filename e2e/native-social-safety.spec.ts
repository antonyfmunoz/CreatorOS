import {
  expect,
  test,
  type APIResponse,
  type Page,
  type TestInfo,
} from "@playwright/test";

function actors(testInfo: TestInfo) {
  const owner = testInfo.project.name.startsWith("mobile") ? 1 : 2;
  const peer = owner === 1 ? 2 : 1;
  return { owner, peer, outsider: 3 };
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

test.afterEach(async ({ page }, testInfo) => {
  const { owner, peer } = actors(testInfo);
  await api(page, owner, "DELETE", `/api/discovery/blocks/${peer}`);
  await api(page, peer, "DELETE", `/api/discovery/blocks/${owner}`);
  await ok(
    await api(page, owner, "PUT", `/api/discovery/safety-controls/${peer}`, {
      muted: false,
      restricted: false,
    }),
  );
});

type Feed = {
  contractVersion: string;
  items: Array<{
    id: number;
    userId: number;
    content: string;
    discovery: { explanation: string[]; policyVersion: number };
  }>;
};

test("ranked feed safety and restricted-comment review enforce real visibility boundaries", async ({
  page,
}, testInfo) => {
  const { owner, peer, outsider } = actors(testInfo);
  const marker = `${testInfo.project.name}-${Date.now()}`;

  // Make the test independent of controls left by another lifecycle.
  await api(page, owner, "DELETE", `/api/discovery/blocks/${peer}`);
  await api(page, peer, "DELETE", `/api/discovery/blocks/${owner}`);
  await ok(
    await api(page, owner, "PUT", `/api/discovery/safety-controls/${peer}`, {
      muted: false,
      restricted: false,
    }),
  );

  const ownerPostResponse = await api(page, owner, "POST", "/api/posts", {
    content: `Owner safety boundary ${marker}`,
    mediaType: "text",
  });
  await ok(ownerPostResponse);
  const ownerPost = await ownerPostResponse.json();
  const peerPostResponse = await api(page, peer, "POST", "/api/posts", {
    content: `Peer discovery proof ${marker} #production`,
    mediaType: "text",
  });
  await ok(peerPostResponse);
  const peerPost = await peerPostResponse.json();
  await ok(await api(page, owner, "POST", `/api/users/${peer}/follow`));

  const followingResponse = await api(
    page,
    owner,
    "GET",
    "/api/discovery/feed?mode=following&limit=50",
  );
  await ok(followingResponse);
  const following = (await followingResponse.json()) as Feed;
  expect(following.contractVersion).toBe("creativesos.discovery.feed.v1");
  const rankedPeerPost = following.items.find(
    (item) => item.id === peerPost.id,
  );
  expect(rankedPeerPost?.discovery.explanation.length).toBeGreaterThanOrEqual(
    3,
  );
  expect(rankedPeerPost?.discovery.policyVersion).toBeGreaterThan(0);

  await ok(
    await api(page, owner, "PUT", `/api/discovery/safety-controls/${peer}`, {
      muted: true,
      restricted: false,
    }),
  );
  const mutedFeed = (await (
    await api(page, owner, "GET", "/api/discovery/feed?mode=following&limit=50")
  ).json()) as Feed;
  expect(mutedFeed.items.some((item) => item.userId === peer)).toBe(false);

  await ok(
    await api(page, owner, "PUT", `/api/discovery/safety-controls/${peer}`, {
      muted: false,
      restricted: true,
    }),
  );
  const heldResponse = await api(page, peer, "POST", "/api/comments", {
    postId: ownerPost.id,
    content: `Restricted comment ${marker}`,
  });
  await ok(heldResponse);
  const held = await heldResponse.json();
  expect(held.visibility).toBe("held");

  const publicComments = await (
    await api(page, outsider, "GET", `/api/posts/${ownerPost.id}/comments`)
  ).json();
  expect(
    publicComments.some((comment: { id: number }) => comment.id === held.id),
  ).toBe(false);
  const authorComments = await (
    await api(page, peer, "GET", `/api/posts/${ownerPost.id}/comments`)
  ).json();
  expect(
    authorComments.find((comment: { id: number }) => comment.id === held.id),
  ).toMatchObject({
    visibility: "held",
  });
  expect(
    (
      await (
        await api(
          page,
          outsider,
          "GET",
          `/api/posts/${ownerPost.id}/comment-count`,
        )
      ).json()
    ).count,
  ).toBe(0);

  const approvalResponse = await api(
    page,
    owner,
    "PATCH",
    `/api/comments/${held.id}/moderation`,
    { action: "approve" },
  );
  await ok(approvalResponse);
  expect((await approvalResponse.json()).visibility).toBe("public");
  const approvedComments = await (
    await api(page, outsider, "GET", `/api/posts/${ownerPost.id}/comments`)
  ).json();
  expect(
    approvedComments.some((comment: { id: number }) => comment.id === held.id),
  ).toBe(true);

  await ok(await api(page, owner, "POST", `/api/discovery/blocks/${peer}`, {}));
  expect(
    (
      await api(page, peer, "POST", "/api/comments", {
        postId: ownerPost.id,
        content: `Blocked interaction ${marker}`,
      })
    ).status(),
  ).toBe(403);
  const blockedFeed = (await (
    await api(
      page,
      owner,
      "GET",
      "/api/discovery/feed?mode=recommended&limit=50",
    )
  ).json()) as Feed;
  expect(blockedFeed.items.some((item) => item.userId === peer)).toBe(false);

  expect(
    (
      await api(page, owner, "PUT", `/api/discovery/safety-controls/${peer}`, {
        muted: true,
      })
    ).status(),
  ).toBe(400);
});
