import { createHmac, randomUUID } from "node:crypto";
import { expect, test, type APIResponse, type Page, type TestInfo } from "@playwright/test";

function actors(testInfo: TestInfo) {
  const owner = testInfo.project.name.startsWith("mobile") ? 1 : 2;
  return { owner, peer: owner === 1 ? 2 : 1, student: owner === 1 ? 5 : 4, admin: 3 };
}

async function api(page: Page, actor: number, method: string, url: string, data?: unknown) {
  return page.request.fetch(url, { method, data, headers: { "x-creativesos-demo-user": String(actor) } });
}

async function expectOk(response: APIResponse) {
  expect(response.ok(), `${response.status()} ${response.url()}: ${await response.text()}`).toBeTruthy();
}

test("course creator and entitled learner complete a qualified learning lifecycle", async ({ page }, testInfo) => {
  const { owner, student, admin } = actors(testInfo);
  const products = await api(page, owner, "GET", "/api/marketplace/products?category=all&sort=newest&page=1&pageSize=24");
  await expectOk(products);
  const course = (await products.json()).items.find((product: { userId: number; category: string }) => product.userId === owner && product.category === "Course");
  expect(course).toBeTruthy();
  const marker = `${testInfo.project.name}-${Date.now()}`;

  const communityResponse = await api(page, owner, "POST", "/api/communities", {
    name: `Course community ${marker}`,
    description: "Entitlement-gated learning community",
    iconColor: "#1d9bf0",
  });
  await expectOk(communityResponse);
  const community = await communityResponse.json();
  expect((await api(page, student, "GET", `/api/communities/${community.id}/channels`)).status()).toBe(403);
  const linkedCommunity = await api(page, owner, "PUT", `/api/courses/${course.id}/community`, { communityId: community.id });
  await expectOk(linkedCommunity);
  expect((await linkedCommunity.json()).enrolledMembers).toBeGreaterThan(0);
  const learnerMembership = await api(page, student, "GET", `/api/communities/${community.id}/membership`);
  await expectOk(learnerMembership);
  expect(await learnerMembership.json()).toMatchObject({ isMember: true, membership: { userId: student, role: "member", status: "active" } });
  const learnerChannels = await api(page, student, "GET", `/api/communities/${community.id}/channels`);
  await expectOk(learnerChannels);
  expect(await learnerChannels.json()).toEqual(expect.arrayContaining([expect.objectContaining({ name: "general" })]));

  const moduleResponse = await api(page, owner, "POST", `/api/courses/${course.id}/modules`, { title: `Operations ${marker}`, description: "Provider-independent curriculum" });
  await expectOk(moduleResponse);
  const module = await moduleResponse.json();
  const lessonResponse = await api(page, owner, "POST", `/api/courses/${course.id}/modules/${module.id}/lessons`, {
    title: `Evidence lesson ${marker}`,
    body: "Complete the workflow and preserve the evidence.",
    durationSeconds: 300,
    availableAfterDays: 0,
    isPublished: true,
  });
  await expectOk(lessonResponse);
  const lesson = await lessonResponse.json();
  const assessmentResponse = await api(page, owner, "PUT", `/api/courses/${course.id}/lessons/${lesson.id}/assessment`, {
    passingScorePercent: 100,
    questions: [{ prompt: "What must be preserved?", choices: ["Evidence", "Assumptions"], answerIndex: 0 }],
  });
  await expectOk(assessmentResponse);
  const assessment = await assessmentResponse.json();

  expect((await api(page, admin, "GET", `/api/courses/${course.id}/curriculum`)).status()).toBe(403);
  const curriculumResponse = await api(page, student, "GET", `/api/courses/${course.id}/curriculum`);
  await expectOk(curriculumResponse);
  const curriculum = await curriculumResponse.json();
  const learnerLesson = curriculum.modules.flatMap((item: { lessons: unknown[] }) => item.lessons).find((item: { id: string }) => item.id === lesson.id);
  expect(learnerLesson.assessment.questions[0]).not.toHaveProperty("answerIndex");
  const questionId = assessment.questions[0].id;
  const wrong = await api(page, student, "POST", `/api/courses/${course.id}/lessons/${lesson.id}/assessment/attempts`, { answers: { [questionId]: 1 } });
  await expectOk(wrong);
  expect((await wrong.json()).passed).toBe(false);
  const right = await api(page, student, "POST", `/api/courses/${course.id}/lessons/${lesson.id}/assessment/attempts`, { answers: { [questionId]: 0 } });
  await expectOk(right);
  expect((await right.json()).passed).toBe(true);
  await expectOk(await api(page, student, "POST", `/api/courses/${course.id}/progress`, { lessonId: lesson.id }));
  const progress = await api(page, student, "GET", `/api/courses/${course.id}/progress`);
  await expectOk(progress);
  expect((await progress.json()).some((item: { lessonId: string }) => item.lessonId === lesson.id)).toBeTruthy();
});

test("business workspace persists campaigns, drafts, contacts and documents with tenant denial", async ({ page }, testInfo) => {
  const { owner, peer, admin } = actors(testInfo);
  const businessesResponse = await api(page, owner, "GET", "/api/businesses");
  await expectOk(businessesResponse);
  const business = (await businessesResponse.json()).find(
    (item: { isDefault: boolean }) => item.isDefault,
  );
  expect(business).toBeTruthy();
  const marker = `${testInfo.project.name}-${Date.now()}`;
  const draftResponse = await api(page, owner, "POST", "/api/content-drafts", { businessId: business.id, kind: "post", content: `Draft ${marker}`, audience: "public" });
  await expectOk(draftResponse);
  const draft = await draftResponse.json();
  expect((await api(page, peer, "GET", `/api/content-drafts/${draft.id}`)).status()).toBe(404);
  await expectOk(await api(page, owner, "PATCH", `/api/content-drafts/${draft.id}`, { content: `Updated draft ${marker}` }));

  const campaignResponse = await api(page, owner, "POST", "/api/campaigns", { businessId: business.id, name: `Launch ${marker}`, objective: "conversion", channel: "owned", description: "Qualified campaign", budgetCents: 5000 });
  await expectOk(campaignResponse);
  const campaign = await campaignResponse.json();
  expect((await api(page, peer, "GET", `/api/campaigns/${campaign.id}`)).status()).toBe(403);
  await expectOk(await api(page, owner, "POST", `/api/campaigns/${campaign.id}/deliverables`, { title: "Launch post", channel: "CreativesOS" }));
  await expectOk(await api(page, owner, "POST", `/api/campaigns/${campaign.id}/metrics`, { impressions: 100, engagements: 10, clicks: 4, conversions: 1, source: "qualification" }));
  await expectOk(await api(page, owner, "PATCH", `/api/campaigns/${campaign.id}`, { status: "active" }));
  const detail = await api(page, owner, "GET", `/api/campaigns/${campaign.id}`);
  await expectOk(detail);
  expect(await detail.json()).toMatchObject({ status: "active", deliverables: [{ title: "Launch post" }], metrics: [{ impressions: 100 }] });
  if (owner === 1) await expectOk(await api(page, admin, "GET", `/api/businesses/${business.id}`));

  const contactResponse = await api(page, owner, "POST", "/api/contacts", { contactName: `Client ${marker}`, purchaseInfo: "Discovery call" });
  await expectOk(contactResponse);
  const contact = await contactResponse.json();
  expect((await api(page, peer, "PATCH", `/api/contacts/${contact.id}`, { contactName: "Intruder", purchaseInfo: "None" })).status()).toBe(403);
  await expectOk(await api(page, owner, "PATCH", `/api/contacts/${contact.id}`, { contactName: `Qualified client ${marker}`, purchaseInfo: "Active" }));

  const documentResponse = await api(page, owner, "POST", "/api/documents", { title: `Brief ${marker}`, content: "First revision" });
  await expectOk(documentResponse);
  const document = await documentResponse.json();
  expect((await api(page, peer, "GET", `/api/documents/${document.id}`)).status()).toBe(403);
  await expectOk(await api(page, owner, "PUT", `/api/documents/${document.id}`, { title: `Brief ${marker}`, content: "Approved revision" }));
});

test("distribution queue publishes natively, remains idempotent, and supports cancel and retry", async ({ page }, testInfo) => {
  const { owner, peer } = actors(testInfo);
  const marker = `${testInfo.project.name}-${Date.now()}`;
  const create = await api(page, owner, "POST", "/api/distribution-jobs", {
    content: `Qualified scheduled post ${marker}`,
    format: "Text",
    platforms: ["CreativesOS"],
    scheduledFor: new Date(Date.now() + 60_000).toISOString(),
  });
  await expectOk(create);
  const job = await create.json();
  expect(job.status).toBe("scheduled");
  expect((await api(page, peer, "POST", `/api/distribution-jobs/${job.id}/cancel`)).status()).toBe(404);
  const canceled = await api(page, owner, "POST", `/api/distribution-jobs/${job.id}/cancel`);
  await expectOk(canceled);
  expect((await canceled.json()).status).toBe("canceled");
  const retried = await api(page, owner, "POST", `/api/distribution-jobs/${job.id}/retry`);
  await expectOk(retried);
  expect((await retried.json()).status).toBe("published");
  expect((await api(page, owner, "POST", `/api/distribution-jobs/${job.id}/retry`)).status()).toBe(409);
  const posts = await api(page, owner, "GET", `/api/users/${owner}/posts`);
  await expectOk(posts);
  expect((await posts.json()).filter((post: { content: string }) => post.content === `Qualified scheduled post ${marker}`)).toHaveLength(1);
  const jobs = await api(page, owner, "GET", "/api/distribution-jobs");
  await expectOk(jobs);
  const persisted = (await jobs.json()).find((item: { id: string }) => item.id === job.id);
  expect(persisted.deliveries).toEqual(expect.arrayContaining([expect.objectContaining({ provider: "creativesos", status: "published" })]));

  const mixedMarker = `Qualified mixed delivery ${marker}`;
  const mixedResponse = await api(page, owner, "POST", "/api/distribution-jobs", {
    content: mixedMarker,
    format: "Text",
    platforms: ["CreativesOS", "Instagram"],
    scheduledFor: new Date().toISOString(),
  });
  await expectOk(mixedResponse);
  const mixed = await mixedResponse.json();
  expect(mixed.status).toBe("needs_connection");
  await expectOk(await api(page, owner, "POST", `/api/distribution-jobs/${mixed.id}/cancel`));
  const mixedRetry = await api(page, owner, "POST", `/api/distribution-jobs/${mixed.id}/retry`);
  await expectOk(mixedRetry);
  expect((await mixedRetry.json()).status).toBe("needs_connection");
  const postsAfterRetry = await api(page, owner, "GET", `/api/users/${owner}/posts`);
  await expectOk(postsAfterRetry);
  expect((await postsAfterRetry.json()).filter((post: { content: string }) => post.content === mixedMarker)).toHaveLength(1);
  const mixedJobs = await api(page, owner, "GET", "/api/distribution-jobs");
  await expectOk(mixedJobs);
  const mixedPersisted = (await mixedJobs.json()).find((item: { id: string }) => item.id === mixed.id);
  expect(mixedPersisted.deliveries).toEqual(expect.arrayContaining([
    expect.objectContaining({ provider: "creativesos", status: "published", attemptCount: 1 }),
    expect.objectContaining({ provider: "instagram", status: "waiting_for_connection" }),
  ]));
});

test("reports are isolated from creators and reviewable only by administrators", async ({ page }, testInfo) => {
  const { owner, peer, admin } = actors(testInfo);
  const postResponse = await api(page, owner, "POST", "/api/posts", { content: `Moderation target ${Date.now()}`, mediaType: "text" });
  await expectOk(postResponse);
  const post = await postResponse.json();
  expect((await api(page, owner, "POST", `/api/posts/${post.id}/report`, { reason: "spam" })).status()).toBe(400);
  const reportResponse = await api(page, peer, "POST", `/api/posts/${post.id}/report`, { reason: "spam", details: "Qualification report" });
  await expectOk(reportResponse);
  const report = await reportResponse.json();
  expect((await api(page, owner, "GET", "/api/moderation/reports?status=open")).status()).toBe(403);
  const queue = await api(page, admin, "GET", "/api/moderation/reports?status=open");
  await expectOk(queue);
  expect((await queue.json()).some((item: { id: string }) => item.id === report.id)).toBeTruthy();
  const resolved = await api(page, admin, "PATCH", `/api/moderation/reports/${report.id}`, { status: "resolved" });
  await expectOk(resolved);
  expect((await resolved.json()).reviewerUserId).toBe(admin);
});

test("privacy export and reversible deletion scheduling are account-scoped", async ({ page }, testInfo) => {
  const { student, peer } = actors(testInfo);
  const summary = await api(page, student, "GET", "/api/privacy/summary");
  await expectOk(summary);
  const privacy = await summary.json();
  expect(privacy.blockers).toEqual([]);
  const exported = await api(page, student, "GET", "/api/privacy/export");
  await expectOk(exported);
  const payload = await exported.json();
  expect(payload.schemaVersion).toBe("creativesos.account-export.v1");
  expect(payload.account.id).toBe(student);
  expect(payload).toMatchObject({
    creatorStudio: {
      cutStudioAudioTemplates: expect.any(Array),
      broadcastStudioVersions: expect.any(Array),
      foundationInstruments: expect.any(Array),
      foundationInstrumentRevisions: expect.any(Array),
      designProjects: expect.any(Array),
      designVersions: expect.any(Array),
      designEvents: expect.any(Array),
    },
    planning: {
      workItems: expect.any(Array),
      events: expect.any(Array),
      dependencies: expect.any(Array),
      approvals: expect.any(Array),
    },
    providerActivations: { runs: expect.any(Array), evidence: expect.any(Array) },
  });
  expect(payload).toHaveProperty("privacyRequestId");
  expect((await api(page, student, "POST", "/api/privacy/deletion-requests", { confirmation: "wrong" })).status()).toBe(400);
  const scheduled = await api(page, student, "POST", "/api/privacy/deletion-requests", { confirmation: privacy.confirmation });
  await expectOk(scheduled);
  const request = await scheduled.json();
  expect(request.status).toBe("scheduled");
  expect((await api(page, peer, "DELETE", `/api/privacy/deletion-requests/${request.id}`)).status()).toBe(404);
  const canceled = await api(page, student, "DELETE", `/api/privacy/deletion-requests/${request.id}`);
  await expectOk(canceled);
  expect((await canceled.json()).status).toBe("canceled");
});

test("projection-side UMH ingress enforces signatures, replay protection and local approval", async ({ page }, testInfo) => {
  const { owner, peer } = actors(testInfo);
  const businesses = await api(page, owner, "GET", "/api/businesses");
  await expectOk(businesses);
  const business = (await businesses.json()).find(
    (item: { isDefault: boolean }) => item.isDefault,
  );
  expect(business).toBeTruthy();
  const sendCommand = async (envelope: Record<string, unknown>, nonce = randomUUID(), valid = true) => {
    const body = JSON.stringify(envelope);
    const timestamp = new Date().toISOString();
    const signature = createHmac("sha256", valid ? "qualification-only-umh-command-secret" : "invalid-secret")
      .update(`${timestamp}.${nonce}.`).update(body).digest("hex");
    return page.request.fetch("/api/umh/commands", { method: "POST", data: body, headers: { "content-type": "application/json", "x-umh-timestamp": timestamp, "x-umh-nonce": nonce, "x-umh-signature": signature } });
  };
  const base = {
    schemaVersion: "umh.command.v1",
    commandId: randomUUID(),
    commandType: "creativesos.content_draft.create.v1",
    idempotencyKey: `qualification-draft-${randomUUID()}`,
    traceId: `trace-${randomUUID()}`,
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 120_000).toISOString(),
    businessId: business.id,
    delegatedUserId: owner,
    payload: { content: "UMH-qualified private draft", audience: "private" },
  };
  expect((await sendCommand(base, randomUUID(), false)).status()).toBe(401);
  const accepted = await sendCommand(base);
  await expectOk(accepted);
  expect((await accepted.json()).status).toBe("completed");
  const replay = await sendCommand(base);
  await expectOk(replay);
  expect((await replay.json()).replayed).toBe(true);

  const taskCreate = { ...base, commandId: randomUUID(), idempotencyKey: `qualification-task-create-${randomUUID()}`, commandType: "creativesos.task.create.v1", payload: { title: `UMH task ${Date.now()}`, kind: "content", status: "idea" } };
  const taskCreatedResponse = await sendCommand(taskCreate);
  await expectOk(taskCreatedResponse);
  const taskCreated = await taskCreatedResponse.json() as { status: string; payload: { workItemId: string; version: number } };
  expect(taskCreated.status).toBe("completed");
  const taskRevise = { ...base, commandId: randomUUID(), idempotencyKey: `qualification-task-revise-${randomUUID()}`, commandType: "creativesos.task.revise.v1", payload: { workItemId: taskCreated.payload.workItemId, title: `UMH task revised ${Date.now()}`, version: taskCreated.payload.version } };
  const taskRevisedResponse = await sendCommand(taskRevise);
  await expectOk(taskRevisedResponse);
  const taskRevised = await taskRevisedResponse.json() as { status: string; payload: { workItemId: string; version: number } };
  expect(taskRevised.status).toBe("completed");
  const taskTransition = { ...base, commandId: randomUUID(), idempotencyKey: `qualification-task-transition-${randomUUID()}`, commandType: "creativesos.task.transition.v1", payload: { workItemId: taskCreated.payload.workItemId, status: "brief", version: taskRevised.payload.version } };
  const taskTransitionedResponse = await sendCommand(taskTransition);
  await expectOk(taskTransitionedResponse);
  expect((await taskTransitionedResponse.json()).status).toBe("completed");
  const taskDetail = await api(page, owner, "GET", `/api/planning/items/${taskCreated.payload.workItemId}`);
  await expectOk(taskDetail);
  expect((await taskDetail.json()).events.map((event: { eventType: string }) => event.eventType)).toEqual(expect.arrayContaining(["task.created", "task.revised", "task.status_changed"]));

  const roomCommunityResponse = await api(page, owner, "POST", "/api/communities", { name: `UMH room ${Date.now()}`, description: "Projection-controlled room", iconColor: "#8b5cf6" });
  await expectOk(roomCommunityResponse);
  const roomCommunity = await roomCommunityResponse.json() as { id: number };
  const roomSchedule = { ...base, commandId: randomUUID(), idempotencyKey: `qualification-room-schedule-${randomUUID()}`, commandType: "creativesos.room.schedule.v1", payload: { communityId: roomCommunity.id, title: `UMH room ${Date.now()}`, description: "Signed projection lifecycle", startsAt: new Date(Date.now() + 60_000).toISOString(), provider: "manual_link", joinUrl: "https://meet.example.com/umh" } };
  const roomScheduledResponse = await sendCommand(roomSchedule);
  await expectOk(roomScheduledResponse);
  const roomScheduled = await roomScheduledResponse.json() as { status: string; payload: { roomId: string; status: string } };
  expect(roomScheduled).toMatchObject({ status: "completed", payload: { status: "scheduled" } });
  const roomLive = { ...base, commandId: randomUUID(), idempotencyKey: `qualification-room-live-${randomUUID()}`, commandType: "creativesos.room.transition.v1", payload: { roomId: roomScheduled.payload.roomId, status: "live" } };
  const roomLiveResponse = await sendCommand(roomLive);
  await expectOk(roomLiveResponse);
  expect(await roomLiveResponse.json()).toMatchObject({ status: "completed", payload: { roomId: roomScheduled.payload.roomId, status: "live" } });
  const roomEnded = { ...base, commandId: randomUUID(), idempotencyKey: `qualification-room-ended-${randomUUID()}`, commandType: "creativesos.room.transition.v1", payload: { roomId: roomScheduled.payload.roomId, status: "ended" } };
  const roomEndedResponse = await sendCommand(roomEnded);
  await expectOk(roomEndedResponse);
  expect(await roomEndedResponse.json()).toMatchObject({ status: "completed", payload: { roomId: roomScheduled.payload.roomId, status: "ended" } });
  const roomEvents = await api(page, owner, "GET", `/api/community-rooms/${roomScheduled.payload.roomId}/events`);
  await expectOk(roomEvents);
  expect((await roomEvents.json() as Array<{ eventType: string }>).map((event) => event.eventType)).toEqual(expect.arrayContaining(["community.room.scheduled", "community.room.live", "community.room.ended"]));

  const publish = { ...base, commandId: randomUUID(), idempotencyKey: `qualification-publish-${randomUUID()}`, commandType: "creativesos.post.publish.v1", payload: { content: `Approved UMH post ${Date.now()}`, mediaType: "text" } };
  const proposed = await sendCommand(publish);
  await expectOk(proposed);
  expect((await proposed.json()).status).toBe("awaiting_approval");
  expect((await api(page, peer, "POST", `/api/umh/approvals/${publish.commandId}`, { decision: "approved" })).status()).toBe(403);
  const approval = await api(page, owner, "POST", `/api/umh/approvals/${publish.commandId}`, { decision: "approved" });
  await expectOk(approval);
  expect((await approval.json()).status).toBe("completed");
  expect((await api(page, owner, "POST", `/api/umh/approvals/${publish.commandId}`, { decision: "approved" })).status()).toBe(409);
});
