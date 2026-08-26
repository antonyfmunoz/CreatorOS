import { expect, test, type APIResponse, type Page, type TestInfo } from "@playwright/test";

function actors(testInfo: TestInfo) {
  const owner = testInfo.project.name.startsWith("mobile") ? 1 : 2;
  return { owner, guest: owner === 1 ? 5 : 4, intruder: owner === 1 ? 4 : 5 };
}

async function api(page: Page, actor: number, method: string, url: string, data?: unknown) {
  return page.request.fetch(url, { method, data, headers: { "x-creativesos-demo-user": String(actor) } });
}

async function expectOk(response: APIResponse) {
  expect(response.ok(), `${response.status()} ${response.url()}: ${await response.text()}`).toBeTruthy();
}

test("expiring room invitations require claim and admission, redact secrets, and revoke only granted access", async ({ page }, testInfo) => {
  const { owner, guest, intruder } = actors(testInfo);
  const marker = `${testInfo.project.name}-${Date.now()}`;
  const communityResponse = await api(page, owner, "POST", "/api/communities", { name: `Guest room ${marker}`, description: "Private guest admission qualification", iconColor: "#8b5cf6" });
  await expectOk(communityResponse);
  const community = await communityResponse.json() as { id: number };
  const roomResponse = await api(page, owner, "POST", `/api/communities/${community.id}/rooms`, { title: `Private session ${marker}`, description: "Admission-controlled room", startsAt: new Date(Date.now() + 3_600_000).toISOString(), provider: "manual_link", joinUrl: "https://meet.example.com/private" });
  await expectOk(roomResponse);
  const room = await roomResponse.json() as { id: string };

  expect((await api(page, guest, "GET", `/api/community-rooms/${room.id}`)).status()).toBe(403);
  const inviteResponse = await api(page, owner, "POST", `/api/community-rooms/${room.id}/guest-invites`, { label: `Guest ${marker}`, expiresInHours: 1 });
  await expectOk(inviteResponse);
  const invite = await inviteResponse.json() as { id: string; inviteUrl: string };
  const token = new URL(invite.inviteUrl).pathname.split("/").pop()!;
  const listedResponse = await api(page, owner, "GET", `/api/community-rooms/${room.id}/guest-invites`);
  await expectOk(listedResponse);
  const listed = await listedResponse.json() as Array<Record<string, unknown>>;
  expect(listed.find((item) => item.id === invite.id)).not.toHaveProperty("tokenHash");
  expect((await api(page, intruder, "POST", `/api/community-room-guest-invites/${token}/accept`, {})).status()).toBe(200);
  expect((await api(page, guest, "POST", `/api/community-room-guest-invites/${token}/accept`, {})).status()).toBe(409);

  await expectOk(await api(page, owner, "POST", `/api/community-rooms/${room.id}/guest-invites/${invite.id}/revoke`, {}));
  expect((await api(page, intruder, "GET", `/api/community-rooms/${room.id}`)).status()).toBe(403);

  const secondInviteResponse = await api(page, owner, "POST", `/api/community-rooms/${room.id}/guest-invites`, { label: `Admitted guest ${marker}`, expiresInHours: 1 });
  await expectOk(secondInviteResponse);
  const secondInvite = await secondInviteResponse.json() as { id: string; inviteUrl: string };
  const secondToken = new URL(secondInvite.inviteUrl).pathname.split("/").pop()!;
  await page.setExtraHTTPHeaders({ "x-creativesos-demo-user": String(guest) });
  await page.goto(`/room-invites/${secondToken}`);
  await page.getByRole("button", { name: /accept invitation/i }).click();
  await expect(page.getByText(/waiting for the host/i)).toBeVisible();
  expect((await api(page, guest, "GET", `/api/community-rooms/${room.id}`)).status()).toBe(403);
  const admittedResponse = await api(page, owner, "POST", `/api/community-rooms/${room.id}/guest-invites/${secondInvite.id}/admit`, {});
  await expectOk(admittedResponse);
  expect(await admittedResponse.json()).toMatchObject({ status: "admitted", guestUserId: guest });
  await expectOk(await api(page, guest, "GET", `/api/community-rooms/${room.id}`));
  await page.reload();
  await page.getByRole("button", { name: /accept invitation/i }).click();
  await page.getByRole("button", { name: /open room/i }).click();
  await expect(page).toHaveURL(new RegExp(`/communities/${community.id}/rooms/${room.id}$`));

  const boundEmail = guest === 5 ? "learner@example.invalid" : "buyer@example.invalid";
  const boundInviteResponse = await api(page, owner, "POST", `/api/community-rooms/${room.id}/guest-invites`, { label: `Bound guest ${marker}`, email: boundEmail, expiresInHours: 1 });
  await expectOk(boundInviteResponse);
  const boundInvite = await boundInviteResponse.json() as { id: string; inviteUrl: string };
  const boundToken = new URL(boundInvite.inviteUrl).pathname.split("/").pop()!;
  expect((await api(page, intruder, "POST", `/api/community-room-guest-invites/${boundToken}/accept`, {})).status()).toBe(403);
  await expectOk(await api(page, guest, "POST", `/api/community-room-guest-invites/${boundToken}/accept`, {}));
  await expectOk(await api(page, owner, "POST", `/api/community-rooms/${room.id}/guest-invites/${boundInvite.id}/admit`, {}));

  const decision = await api(page, guest, "POST", `/api/community-rooms/${room.id}/notes`, { kind: "decision", content: `Ship the governed room ${marker}` });
  await expectOk(decision);
  expect(await decision.json()).toMatchObject({ kind: "decision" });
  const summary = await api(page, owner, "POST", `/api/community-rooms/${room.id}/notes`, { kind: "summary", content: `Guest admitted and decision captured ${marker}` });
  await expectOk(summary);
  expect(await summary.json()).toMatchObject({ kind: "summary" });

  expect((await api(page, guest, "GET", `/api/community-rooms/${room.id}/events`)).status()).toBe(403);
  const eventsResponse = await api(page, owner, "GET", `/api/community-rooms/${room.id}/events`);
  await expectOk(eventsResponse);
  const eventTypes = (await eventsResponse.json() as Array<{ eventType: string }>).map((event) => event.eventType);
  expect(eventTypes).toEqual(expect.arrayContaining(["community.room.scheduled", "community.room.guest_invited", "community.room.guest_accepted", "community.room.guest_admitted", "community.room.guest_revoked", "community.room.decision_recorded", "community.room.summary_recorded"]));

  await expectOk(await api(page, owner, "POST", `/api/community-rooms/${room.id}/guest-invites/${secondInvite.id}/revoke`, {}));
  await expectOk(await api(page, guest, "GET", `/api/community-rooms/${room.id}`));
  await expectOk(await api(page, owner, "POST", `/api/community-rooms/${room.id}/guest-invites/${boundInvite.id}/revoke`, {}));
  expect((await api(page, guest, "GET", `/api/community-rooms/${room.id}`)).status()).toBe(403);
});
