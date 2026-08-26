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
  // The qualification seed may already contain history for this direct pair.
  // Establish a deterministic cursor for both actors before measuring the new
  // message rather than assuming the conversation starts empty.
  await expectOk(await api(page, owner, "PATCH", `/api/conversations/${direct.id}/read`));
  await expectOk(await api(page, peer, "PATCH", `/api/conversations/${direct.id}/read`));
  const messageResponse = await api(page, owner, "POST", "/api/messages", { conversationId: direct.id, content: `Message ${marker}` });
  await expectOk(messageResponse);
  const message = await messageResponse.json();

  const peerBeforeRead = await api(page, peer, "GET", `/api/users/${peer}/conversations`);
  await expectOk(peerBeforeRead);
  expect((await peerBeforeRead.json()).find((item: { id: number }) => item.id === direct.id)).toMatchObject({
    unreadCount: 1,
    lastMessage: { id: message.id, content: `Message ${marker}`, senderId: owner },
  });
  expect((await api(page, third, "PATCH", `/api/conversations/${direct.id}/read`)).status()).toBe(403);
  await expectOk(await api(page, peer, "PATCH", `/api/conversations/${direct.id}/read`));
  const peerAfterRead = await api(page, peer, "GET", `/api/users/${peer}/conversations`);
  await expectOk(peerAfterRead);
  expect((await peerAfterRead.json()).find((item: { id: number }) => item.id === direct.id).unreadCount).toBe(0);

  expect((await api(page, peer, "PATCH", `/api/messages/${message.id}`, { content: "Unauthorized edit" })).status()).toBe(403);
  const edited = await api(page, owner, "PATCH", `/api/messages/${message.id}`, { content: `Edited ${marker}` });
  await expectOk(edited);
  expect((await edited.json()).content).toBe(`Edited ${marker}`);
  const peerHubConversations = await api(page, peer, "GET", "/api/relationship-hub/conversations?status=all");
  await expectOk(peerHubConversations);
  const peerHubConversation = (await peerHubConversations.json()).find((item: { nativeConversationId?: number }) => item.nativeConversationId === direct.id);
  expect(peerHubConversation?.id).toBeTruthy();
  const peerHubDetail = await api(page, peer, "GET", `/api/relationship-hub/conversations/${peerHubConversation.id}`);
  await expectOk(peerHubDetail);
  expect((await peerHubDetail.json()).messages.find((item: { externalMessageId?: string }) => item.externalMessageId === `native:${message.id}`)).toMatchObject({
    body: `Edited ${marker}`,
    direction: "inbound",
  });
  await expectOk(await api(page, peer, "POST", "/api/messages", { conversationId: direct.id, content: `Reply ${marker}`, replyToMessageId: message.id }));
  await expectOk(await api(page, peer, "POST", `/api/messages/${message.id}/reaction`, { reaction: "heart" }));
  expect((await api(page, third, "POST", `/api/messages/${message.id}/reaction`, { reaction: "heart" })).status()).toBe(403);
  expect((await api(page, third, "GET", `/api/conversations/${direct.id}/messages`)).status()).toBe(403);
  const ownerBeforeRead = await api(page, owner, "GET", `/api/users/${owner}/conversations`);
  await expectOk(ownerBeforeRead);
  expect((await ownerBeforeRead.json()).find((item: { id: number }) => item.id === direct.id).unreadCount).toBe(1);
  await expectOk(await api(page, owner, "PATCH", `/api/conversations/${direct.id}/read`));
  const messages = await api(page, owner, "GET", `/api/conversations/${direct.id}/messages`);
  await expectOk(messages);
  expect((await messages.json()).map((item: { content: string }) => item.content)).toEqual(expect.arrayContaining([`Edited ${marker}`, `Reply ${marker}`]));

  const groupResponse = await api(page, owner, "POST", "/api/conversations", { userIds: [owner, peer, third], name: `Field team ${marker}`, isGroup: true });
  await expectOk(groupResponse);
  const group = await groupResponse.json();
  await expectOk(await api(page, third, "POST", "/api/messages", { conversationId: group.id, content: `Group message ${marker}` }));
  const ownerGroupBeforeRead = await api(page, owner, "GET", `/api/users/${owner}/conversations`);
  const peerGroupBeforeRead = await api(page, peer, "GET", `/api/users/${peer}/conversations`);
  await expectOk(ownerGroupBeforeRead);
  await expectOk(peerGroupBeforeRead);
  expect((await ownerGroupBeforeRead.json()).find((item: { id: number }) => item.id === group.id).unreadCount).toBe(1);
  expect((await peerGroupBeforeRead.json()).find((item: { id: number }) => item.id === group.id).unreadCount).toBe(1);
  await expectOk(await api(page, owner, "PATCH", `/api/conversations/${group.id}/read`));
  const ownerGroupAfterRead = await api(page, owner, "GET", `/api/users/${owner}/conversations`);
  const peerGroupStillUnread = await api(page, peer, "GET", `/api/users/${peer}/conversations`);
  await expectOk(ownerGroupAfterRead);
  await expectOk(peerGroupStillUnread);
  expect((await ownerGroupAfterRead.json()).find((item: { id: number }) => item.id === group.id).unreadCount).toBe(0);
  expect((await peerGroupStillUnread.json()).find((item: { id: number }) => item.id === group.id).unreadCount).toBe(1);
  const conversationList = await api(page, owner, "GET", `/api/users/${owner}/conversations`);
  await expectOk(conversationList);
  expect((await conversationList.json()).some((item: { id: number; name?: string }) => item.id === group.id && item.name?.includes(marker))).toBeTruthy();

  const hubMessageResponse = await api(page, owner, "POST", "/api/messages", { conversationId: direct.id, content: `Hub lifecycle ${marker}` });
  await expectOk(hubMessageResponse);
  const hubMessage = await hubMessageResponse.json();
  await expectOk(await api(page, owner, "POST", "/api/relationship-hub/native/initialize", {}));
  const hubConversationsResponse = await api(page, owner, "GET", "/api/relationship-hub/conversations?status=all");
  await expectOk(hubConversationsResponse);
  const hubConversation = (await hubConversationsResponse.json()).find((item: { nativeConversationId?: number }) => item.nativeConversationId === direct.id);
  expect(hubConversation?.id).toBeTruthy();
  const hubDetailResponse = await api(page, owner, "GET", `/api/relationship-hub/conversations/${hubConversation.id}`);
  await expectOk(hubDetailResponse);
  const canonicalHubMessage = (await hubDetailResponse.json()).messages.find((item: { externalMessageId?: string }) => item.externalMessageId === `native:${hubMessage.id}`);
  expect(canonicalHubMessage?.id).toBeTruthy();

  const editKey = `hub-edit-${marker}`;
  await expectOk(await api(page, owner, "POST", `/api/relationship-hub/conversations/${hubConversation.id}/actions`, {
    actionType: "message.edit",
    targetExternalMessageId: `native:${hubMessage.id}`,
    body: `Hub edited ${marker}`,
    idempotencyKey: editKey,
  }));
  await expect.poll(async () => {
    const response = await api(page, owner, "GET", `/api/relationship-hub/conversations/${hubConversation.id}`);
    return (await response.json()).messages.find((item: { id: string }) => item.id === canonicalHubMessage.id)?.body;
  }).toBe(`Hub edited ${marker}`);
  expect((await api(page, owner, "POST", `/api/relationship-hub/conversations/${hubConversation.id}/actions`, {
    actionType: "message.edit",
    targetExternalMessageId: `native:${hubMessage.id}`,
    body: `Conflicting edit ${marker}`,
    idempotencyKey: editKey,
  })).status()).toBe(409);

  const reactionKey = `hub-react-${marker}`;
  await expectOk(await api(page, owner, "POST", `/api/relationship-hub/conversations/${hubConversation.id}/actions`, {
    actionType: "message.react",
    targetExternalMessageId: `native:${hubMessage.id}`,
    reaction: "heart",
    idempotencyKey: reactionKey,
  }));
  await expect.poll(async () => {
    const response = await api(page, owner, "GET", `/api/conversations/${direct.id}/messages`);
    return (await response.json()).find((item: { id: number }) => item.id === hubMessage.id)?.reactions?.[String(owner)];
  }).toBe("heart");
  await expectOk(await api(page, owner, "POST", `/api/relationship-hub/conversations/${hubConversation.id}/actions`, {
    actionType: "message.mark_read",
    targetExternalMessageId: `native:${hubMessage.id}`,
    idempotencyKey: `hub-read-${marker}`,
  }));
  expect([403, 404]).toContain((await api(page, third, "POST", `/api/relationship-hub/conversations/${hubConversation.id}/actions`, {
    actionType: "message.delete",
    targetExternalMessageId: `native:${hubMessage.id}`,
  })).status());
  await expectOk(await api(page, owner, "POST", `/api/relationship-hub/conversations/${hubConversation.id}/actions`, {
    actionType: "message.delete",
    targetExternalMessageId: `native:${hubMessage.id}`,
    idempotencyKey: `hub-delete-${marker}`,
  }));
  await expect.poll(async () => {
    const response = await api(page, owner, "GET", `/api/conversations/${direct.id}/messages`);
    return (await response.json()).some((item: { id: number }) => item.id === hubMessage.id);
  }).toBe(false);

  await expectOk(await api(page, owner, "DELETE", `/api/messages/${message.id}`));
  const afterDelete = await api(page, owner, "GET", `/api/conversations/${direct.id}/messages`);
  await expectOk(afterDelete);
  expect((await afterDelete.json()).some((item: { id: number }) => item.id === message.id)).toBe(false);
  await expect.poll(async () => {
    const response = await api(page, peer, "GET", `/api/relationship-hub/conversations/${peerHubConversation.id}`);
    return (await response.json()).messages.find((item: { externalMessageId?: string }) => item.externalMessageId === `native:${message.id}`)?.status;
  }).toBe("deleted");
});

test("unified inbox controls execute the native message lifecycle", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const { owner, peer } = actors(testInfo);
  const marker = `${testInfo.project.name}-${Date.now()}`;
  const directResponse = await api(page, owner, "POST", "/api/conversations", { userIds: [owner, peer], isGroup: false });
  await expectOk(directResponse);
  const direct = await directResponse.json();
  const messageResponse = await api(page, owner, "POST", "/api/messages", { conversationId: direct.id, content: `Inbox UI ${marker}` });
  await expectOk(messageResponse);
  const message = await messageResponse.json();
  await expectOk(await api(page, owner, "POST", "/api/relationship-hub/native/initialize", {}));
  const hubConversationsResponse = await api(page, owner, "GET", "/api/relationship-hub/conversations?status=all");
  await expectOk(hubConversationsResponse);
  const hubConversation = (await hubConversationsResponse.json()).find((item: { nativeConversationId?: number }) => item.nativeConversationId === direct.id);
  expect(hubConversation?.id).toBeTruthy();

  await page.goto("/messages");
  await page.getByTestId(`relationship-conversation-${hubConversation.id}`).click();
  const row = page.getByTestId(`relationship-message-native:${message.id}`);
  await expect(row.getByText(`Inbox UI ${marker}`, { exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Edit message" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit message" });
  await editDialog.getByRole("textbox").fill(`Inbox UI edited ${marker}`);
  await editDialog.getByRole("button", { name: "Save changes" }).click();
  await expect(row.getByText(`Inbox UI edited ${marker}`, { exact: true })).toBeVisible();

  await row.getByRole("button", { name: "React with a heart" }).click();
  await expect(row.getByText("❤️", { exact: true })).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: "Delete message" }).click();
  await expect(row.getByText("Message deleted", { exact: true })).toBeVisible();
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

test("recurring community offers provision gated access and compatible checkout", async ({ page }, testInfo) => {
  const { owner, peer } = actors(testInfo);
  const marker = `${testInfo.project.name}-${Date.now()}`;
  const title = `Membership ${marker}`;
  const createdResponse = await api(page, owner, "POST", "/api/products", {
    title,
    description: "A paid community qualification offer",
    price: 19,
    category: "Membership",
    imageUrl: null,
    productType: "membership",
    billingModel: "recurring",
    billingInterval: "month",
  });
  await expectOk(createdResponse);
  const created = await createdResponse.json();
  const publishedResponse = await api(page, owner, "PATCH", `/api/products/${created.id}`, {
    title,
    description: "A paid community qualification offer",
    price: 19,
    category: "Membership",
    imageUrl: null,
    productType: "membership",
    billingModel: "recurring",
    billingInterval: "month",
    payoutMode: "platform",
    status: "published",
  });
  await expectOk(publishedResponse);
  const published = await publishedResponse.json();
  expect(published.communityId).toBeTruthy();

  expect((await api(page, peer, "GET", `/api/communities/${published.communityId}/channels`)).status()).toBe(403);
  const unpaidJoin = await api(page, peer, "POST", `/api/communities/${published.communityId}/join`);
  expect(unpaidJoin.status()).toBe(402);
  expect(await unpaidJoin.json()).toMatchObject({ productId: published.id });
  const orderResponse = await api(page, peer, "POST", "/api/orders", {
    productIds: [published.id],
    idempotencyKey: `qualification-membership-${marker}`,
  });
  await expectOk(orderResponse);
  const order = await orderResponse.json();
  expect(order.items).toHaveLength(1);
  expect(order.items[0]).toMatchObject({
    productTypeSnapshot: "membership",
    billingModelSnapshot: "recurring",
    billingIntervalSnapshot: "month",
  });

  await page.goto("/marketplace");
  const search = page.getByRole("searchbox", { name: "Search marketplace" });
  await search.fill(title);
  await page.locator("main").getByRole("button", { name: "Communities" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByText("$19.00/month", { exact: true })).toBeVisible();
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
