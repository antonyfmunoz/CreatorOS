import { expect, test, type APIResponse, type Page, type TestInfo } from "@playwright/test";

function actors(testInfo: TestInfo) {
  const owner = testInfo.project.name.startsWith("mobile") ? 1 : 2;
  return { owner, peer: owner === 1 ? 2 : 1, third: 3 };
}

async function api(page: Page, actor: number, method: string, url: string, data?: unknown) {
  return page.request.fetch(url, {
    method,
    data,
    headers: { "x-creativesos-demo-user": String(actor) },
  });
}

async function expectOk(response: APIResponse) {
  expect(response.ok(), `${response.status()} ${response.url()}: ${await response.text()}`).toBeTruthy();
}

test("social actions, polls, stories and repost constraints persist", async ({ page }, testInfo) => {
  const { owner, peer } = actors(testInfo);
  const marker = `${testInfo.project.name}-${Date.now()}`;
  const created = await api(page, owner, "POST", "/api/posts", {
    content: `Original lifecycle post ${marker} mentioning @sarahmitchell`,
    mediaType: "text",
    addToStory: true,
    pollData: { question: `Choose ${marker}`, options: ["First", "Second"] },
  });
  await expectOk(created);
  const post = await created.json();

  const likeOne = await api(page, peer, "POST", `/api/posts/${post.id}/like`);
  await expectOk(likeOne);
  expect((await likeOne.json()).likes).toBe(1);
  const likeTwo = await api(page, peer, "POST", `/api/posts/${post.id}/like`);
  await expectOk(likeTwo);
  expect((await likeTwo.json()).likes).toBe(1);

  await expectOk(await api(page, peer, "POST", `/api/posts/${post.id}/save`));
  await expectOk(await api(page, peer, "POST", `/api/posts/${post.id}/save`));
  const saved = await api(page, peer, "GET", `/api/users/${peer}/saved-posts`);
  await expectOk(saved);
  expect((await saved.json()).filter((candidate: { id: number }) => candidate.id === post.id)).toHaveLength(1);

  const commentResponse = await api(page, peer, "POST", "/api/comments", { postId: post.id, content: `Comment ${marker}` });
  await expectOk(commentResponse);
  const comment = await commentResponse.json();
  await expectOk(await api(page, owner, "POST", "/api/comments", { postId: post.id, parentId: comment.id, content: `Reply ${marker}` }));
  const count = await api(page, owner, "GET", `/api/posts/${post.id}/comment-count`);
  await expectOk(count);
  expect((await count.json()).count).toBe(2);
  const persistedPost = await api(page, owner, "GET", `/api/posts/${post.id}`);
  await expectOk(persistedPost);
  expect((await persistedPost.json()).comments).toBe(2);

  const pollResponse = await api(page, owner, "GET", `/api/posts/${post.id}/poll`);
  await expectOk(pollResponse);
  const poll = await pollResponse.json();
  expect(poll.options).toHaveLength(2);
  await expectOk(await api(page, peer, "POST", `/api/posts/${post.id}/poll/vote`, { optionId: poll.options[0].id }));
  const selectedPoll = await api(page, peer, "GET", `/api/posts/${post.id}/poll`);
  await expectOk(selectedPoll);
  expect((await selectedPoll.json()).viewerOptionId).toBe(poll.options[0].id);

  const repostResponse = await api(page, peer, "POST", "/api/posts", { content: `Reposted ${marker}`, mediaType: "text", repostOfId: post.id });
  await expectOk(repostResponse);
  const repost = await repostResponse.json();
  expect((await api(page, peer, "POST", "/api/posts", { content: "Duplicate repost", mediaType: "text", repostOfId: post.id })).status()).toBe(409);
  expect((await api(page, owner, "POST", "/api/posts", { content: "Nested repost", mediaType: "text", repostOfId: repost.id })).status()).toBe(409);
  expect((await api(page, peer, "PATCH", `/api/posts/${post.id}`, { content: "Unauthorized edit" })).status()).toBe(403);

  const stories = await api(page, owner, "GET", `/api/users/${owner}/stories`);
  await expectOk(stories);
  const createdStory = (await stories.json()).find((story: { caption?: string }) => story.caption?.includes(marker));
  expect(createdStory).toBeTruthy();
  await expectOk(await api(page, peer, "POST", `/api/stories/${createdStory.id}/view`));
  await expectOk(await api(page, peer, "POST", `/api/stories/${createdStory.id}/reaction`, { reaction: "like" }));
  const reactions = await api(page, peer, "GET", `/api/users/${peer}/story-reactions`);
  await expectOk(reactions);
  expect((await reactions.json()).some((reaction: { storyId: number }) => reaction.storyId === createdStory.id)).toBeTruthy();
});

test("profile follow graph and ownership boundaries persist", async ({ page }, testInfo) => {
  const { owner, peer } = actors(testInfo);
  await expectOk(await api(page, owner, "POST", `/api/users/${peer}/follow`));
  await expectOk(await api(page, owner, "POST", `/api/users/${peer}/follow`));
  const followers = await api(page, owner, "GET", `/api/users/${peer}/followers/count`);
  await expectOk(followers);
  expect(await followers.json()).toBeGreaterThanOrEqual(1);
  expect((await api(page, owner, "PATCH", `/api/users/${peer}`, { bio: "Unauthorized profile edit" })).status()).toBe(403);
  await page.goto(`/profile/${peer}`);
  await expect(page.getByText(peer === 2 ? "Sarah Mitchell" : "Owner Creative", { exact: true }).first()).toBeVisible();
  const profileNav = page.getByRole("navigation", { name: "Profile content" });
  await expect(profileNav.getByRole("button")).toHaveCount(6);
  await expect(profileNav.getByRole("button", { name: "Public" })).toHaveCount(0);
  await expectOk(await api(page, owner, "POST", `/api/users/${peer}/unfollow`));
});

test("direct and group messaging enforce participants and survive reload", async ({ page }, testInfo) => {
  const { owner, peer, third } = actors(testInfo);
  const marker = `${testInfo.project.name}-${Date.now()}`;
  const directResponse = await api(page, owner, "POST", "/api/conversations", { userIds: [owner, peer], isGroup: false });
  await expectOk(directResponse);
  const direct = await directResponse.json();
  const duplicate = await api(page, owner, "POST", "/api/conversations", { userIds: [owner, peer], isGroup: false });
  await expectOk(duplicate);
  expect((await duplicate.json()).id).toBe(direct.id);
  const messageResponse = await api(page, owner, "POST", "/api/messages", { conversationId: direct.id, content: `Message ${marker}` });
  await expectOk(messageResponse);
  const message = await messageResponse.json();
  await expectOk(await api(page, peer, "POST", "/api/messages", { conversationId: direct.id, content: `Reply ${marker}`, replyToMessageId: message.id }));
  await expectOk(await api(page, peer, "POST", `/api/messages/${message.id}/reaction`, { reaction: "heart" }));
  expect((await api(page, third, "GET", `/api/conversations/${direct.id}/messages`)).status()).toBe(403);
  const messages = await api(page, owner, "GET", `/api/conversations/${direct.id}/messages`);
  await expectOk(messages);
  expect((await messages.json()).map((item: { content: string }) => item.content)).toEqual(expect.arrayContaining([`Message ${marker}`, `Reply ${marker}`]));

  const groupResponse = await api(page, owner, "POST", "/api/conversations", { userIds: [owner, peer, third], name: `Field team ${marker}`, isGroup: true });
  await expectOk(groupResponse);
  const group = await groupResponse.json();
  await expectOk(await api(page, third, "POST", "/api/messages", { conversationId: group.id, content: `Group message ${marker}` }));
  const conversationList = await api(page, owner, "GET", `/api/users/${owner}/conversations`);
  await expectOk(conversationList);
  expect((await conversationList.json()).some((item: { id: number; name?: string }) => item.id === group.id && item.name?.includes(marker))).toBeTruthy();
});

test("notification read state and account isolation persist", async ({ page }, testInfo) => {
  const { owner, peer } = actors(testInfo);
  const marker = `${testInfo.project.name}-${Date.now()}`;
  const created = await api(page, owner, "POST", "/api/notifications", { type: "system", message: `Qualification notification ${marker}` });
  await expectOk(created);
  const notification = await created.json();
  expect((await api(page, peer, "PATCH", `/api/notifications/${notification.id}/mark-read`)).status()).toBe(403);
  await expectOk(await api(page, owner, "PATCH", `/api/notifications/${notification.id}/mark-read`));
  const listed = await api(page, owner, "GET", `/api/users/${owner}/notifications`);
  await expectOk(listed);
  expect((await listed.json()).find((item: { id: string }) => item.id === notification.id)?.read).toBe(true);
  await page.goto("/notifications");
  await expect(page.getByText(`Qualification notification ${marker}`, { exact: true })).toBeVisible();
});

test("marketplace saves and cart are durable and account-scoped", async ({ page }, testInfo) => {
  const { owner, third } = actors(testInfo);
  const catalog = await api(page, owner, "GET", "/api/marketplace/products?category=all&sort=newest&page=1&pageSize=24");
  await expectOk(catalog);
  const product = (await catalog.json()).items.find((item: { userId: number }) => item.userId !== owner);
  expect(product.id).toBeTruthy();
  await expectOk(await api(page, owner, "PUT", `/api/marketplace/products/${product.id}/save`));
  await expectOk(await api(page, owner, "PUT", `/api/marketplace/products/${product.id}/save`));
  const saved = await api(page, owner, "GET", "/api/marketplace/saved-products");
  await expectOk(saved);
  expect((await saved.json()).filter((item: { id: number }) => item.id === product.id)).toHaveLength(1);
  await expectOk(await api(page, owner, "POST", "/api/cart/items", { productId: product.id }));
  const cart = await api(page, owner, "GET", "/api/cart");
  await expectOk(cart);
  expect((await cart.json()).some((item: { id: number }) => item.id === product.id)).toBeTruthy();
  const isolatedCart = await api(page, third, "GET", "/api/cart");
  await expectOk(isolatedCart);
  expect((await isolatedCart.json()).some((item: { id: number }) => item.id === product.id)).toBeFalsy();
  await page.goto(`/marketplace/product/${product.id}`);
  await expect(page.getByRole("heading", { name: product.title })).toBeVisible();
});

test("community owner, member and moderator lifecycle is enforced", async ({ page }, testInfo) => {
  const { owner, peer, third } = actors(testInfo);
  const marker = `${testInfo.project.name}-${Date.now()}`;
  const created = await api(page, owner, "POST", "/api/communities", { name: `Lifecycle ${marker}`, description: "Role-qualified community", iconColor: "#1d9bf0" });
  await expectOk(created);
  const community = await created.json();
  const preJoinChannels = await api(page, peer, "GET", `/api/communities/${community.id}/channels`);
  expect(preJoinChannels.status()).toBe(403);
  await expectOk(await api(page, peer, "POST", `/api/communities/${community.id}/join`));
  await expectOk(await api(page, third, "POST", `/api/communities/${community.id}/join`));
  expect((await api(page, peer, "POST", "/api/channels", { communityId: community.id, name: "member-created" })).status()).toBe(403);
  const channelResponse = await api(page, owner, "POST", "/api/channels", { communityId: community.id, name: "field-tests" });
  await expectOk(channelResponse);
  const channel = await channelResponse.json();
  const messageResponse = await api(page, peer, "POST", "/api/channel-messages", { channelId: channel.id, content: `Community message ${marker}` });
  await expectOk(messageResponse);
  const message = await messageResponse.json();
  await expectOk(await api(page, owner, "POST", `/api/channel-messages/${message.id}/pin`));
  const pollResponse = await api(page, peer, "POST", `/api/channels/${channel.id}/polls`, { question: "Which path?", options: ["One", "Two"] });
  await expectOk(pollResponse);
  const poll = await pollResponse.json();
  await expectOk(await api(page, third, "POST", `/api/channel-polls/${poll.id}/vote`, { optionId: poll.options[1].id }));
  await expectOk(await api(page, owner, "PATCH", `/api/communities/${community.id}/members/${peer}`, { role: "admin" }));
  await expectOk(await api(page, peer, "PATCH", `/api/communities/${community.id}/members/${third}`, { status: "muted", reason: "Qualification moderation" }));
  expect((await api(page, third, "POST", "/api/channel-messages", { channelId: channel.id, content: "Should be blocked" })).status()).toBe(403);
  const moderation = await api(page, owner, "GET", `/api/communities/${community.id}/moderation-actions`);
  await expectOk(moderation);
  expect((await moderation.json()).some((item: { targetUserId: number; action: string }) => item.targetUserId === third && item.action === "muted")).toBeTruthy();
});
