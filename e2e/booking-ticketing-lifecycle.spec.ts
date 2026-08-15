import {
  expect,
  test,
  type APIResponse,
  type Page,
  type TestInfo,
} from "@playwright/test";

function actors(testInfo: TestInfo) {
  const owner = testInfo.project.name.startsWith("mobile") ? 1 : 2;
  return {
    owner,
    peer: owner === 1 ? 2 : 1,
    buyer: 4,
    learner: 5,
    payer: 3,
  };
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

test("appointments enforce timezone availability, capacity, waitlist promotion, and operator control", async ({
  page,
}, testInfo) => {
  const { owner, buyer, learner } = actors(testInfo);
  const marker = `${testInfo.project.name}-${Date.now()}`.toLowerCase();
  expect(
    (
      await api(page, owner, "POST", "/api/booking/calendars", {
        name: "Invalid timezone",
        timezone: "LosAngeles-ish",
      })
    ).status(),
  ).toBe(400);
  const calendarResponse = await api(
    page,
    owner,
    "POST",
    "/api/booking/calendars",
    { name: `Creator calendar ${marker}`, timezone: "America/Los_Angeles" },
  );
  await ok(calendarResponse);
  const calendar = await calendarResponse.json();
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek += 1)
    await ok(
      await api(
        page,
        owner,
        "POST",
        `/api/booking/calendars/${calendar.id}/rules`,
        { dayOfWeek, startMinute: 0, endMinute: 1440 },
      ),
    );
  const typeResponse = await api(
    page,
    owner,
    "POST",
    "/api/booking/appointment-types",
    {
      calendarId: calendar.id,
      name: `Strategy session ${marker}`,
      slug: `strategy-${marker}`,
      description: "A qualified appointment lifecycle.",
      durationMinutes: 30,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
      capacity: 1,
      locationMode: "manual_link",
      location: "https://example.com/room",
      priceCents: 0,
      currency: "usd",
      minimumNoticeMinutes: 0,
      bookingHorizonDays: 30,
      cancellationNoticeMinutes: 0,
      reminderMinutes: [1],
    },
  );
  await ok(typeResponse);
  const appointment = await typeResponse.json();
  const from = new Date(Date.now() + 20 * 60_000).toISOString();
  const to = new Date(Date.now() + 2 * 86_400_000).toISOString();
  const slotsResponse = await api(
    page,
    buyer,
    "GET",
    `/api/public/booking/${appointment.slug}/slots?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
  await ok(slotsResponse);
  const slots = await slotsResponse.json();
  expect(slots.length).toBeGreaterThan(0);
  const startsAt = slots[0].startsAt;
  const reservationResponse = await api(
    page,
    buyer,
    "POST",
    `/api/booking/${appointment.slug}/reservations`,
    {
      startsAt,
      name: `Buyer ${marker}`,
      email: `buyer-${marker}@example.com`,
      timezone: "America/New_York",
    },
  );
  await ok(reservationResponse);
  const reservation = await reservationResponse.json();
  expect(reservation.status).toBe("confirmed");
  const waitlistResponse = await api(
    page,
    learner,
    "POST",
    `/api/booking/${appointment.slug}/reservations`,
    {
      startsAt,
      name: `Learner ${marker}`,
      email: `learner-${marker}@example.com`,
      timezone: "UTC",
    },
  );
  expect(waitlistResponse.status()).toBe(202);
  expect((await waitlistResponse.json()).status).toBe("waitlisted");
  await ok(
    await api(
      page,
      owner,
      "DELETE",
      `/api/booking/operator/reservations/${reservation.id}`,
    ),
  );
  const learnerSchedule = await api(page, learner, "GET", "/api/booking/me");
  await ok(learnerSchedule);
  expect((await learnerSchedule.json()).reservations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ startsAt, status: "confirmed" }),
    ]),
  );

  await page.goto("/business/booking");
  await expect(
    page.getByRole("heading", { name: "Booking & Event Operations" }),
  ).toBeVisible();
  await expect(page.getByText(appointment.name, { exact: true })).toBeVisible();
  await page.goto(`/book/${appointment.slug}`);
  await expect(
    page.getByRole("heading", { name: appointment.name }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Choose a time" }),
  ).toBeVisible();
});

test("paid-event operations enforce inventory, buyer limits, payment state, attendance, replay, and automation", async ({
  page,
}, testInfo) => {
  const { owner, peer, buyer, learner, payer } = actors(testInfo);
  const marker = `${testInfo.project.name}-${Date.now()}`;
  const communityResponse = await api(page, owner, "POST", "/api/communities", {
    name: `Event community ${marker}`,
    description: "Qualified paid-event community",
    iconColor: "#1d9bf0",
  });
  await ok(communityResponse);
  const community = await communityResponse.json();
  const channelsResponse = await api(
    page,
    owner,
    "GET",
    `/api/communities/${community.id}/channels`,
  );
  await ok(channelsResponse);
  const channel = (await channelsResponse.json())[0];
  const eventResponse = await api(page, owner, "POST", "/api/events", {
    name: `Creator summit ${marker}`,
    dateTime: new Date(Date.now() + 2 * 60 * 60_000).toISOString(),
    communityId: community.id,
    channelId: channel.id,
    location: "CreativesOS community room",
    description: "A complete ticket-to-replay lifecycle.",
    coverUrl: null,
  });
  await ok(eventResponse);
  const event = await eventResponse.json();
  await ok(
    await api(
      page,
      owner,
      "POST",
      `/api/event-operations/events/${event.id}/settings`,
      {
        timezone: "America/Los_Angeles",
        capacity: 2,
        waitlistEnabled: true,
        cancellationNoticeMinutes: 0,
      },
    ),
  );
  const freeTypeResponse = await api(
    page,
    owner,
    "POST",
    `/api/event-operations/events/${event.id}/ticket-types`,
    {
      name: "Community access",
      description: "Free qualified access",
      priceCents: 0,
      currency: "usd",
      capacity: 1,
      salesStartAt: null,
      salesEndAt: null,
      maxPerBuyer: 1,
      replayAccessDays: 30,
    },
  );
  await ok(freeTypeResponse);
  const freeType = await freeTypeResponse.json();
  const paidTypeResponse = await api(
    page,
    owner,
    "POST",
    `/api/event-operations/events/${event.id}/ticket-types`,
    {
      name: "Premium access",
      description: "Paid qualified access",
      priceCents: 2500,
      currency: "usd",
      capacity: 1,
      salesStartAt: null,
      salesEndAt: null,
      maxPerBuyer: 1,
      replayAccessDays: 7,
    },
  );
  await ok(paidTypeResponse);
  const paidType = await paidTypeResponse.json();
  const freeClaim = await api(
    page,
    buyer,
    "POST",
    `/api/event-operations/ticket-types/${freeType.id}/claim`,
    {
      name: `Buyer ${marker}`,
      email: `buyer-${marker}@example.com`,
      quantity: 1,
    },
  );
  await ok(freeClaim);
  const freeTicket = await freeClaim.json();
  expect(freeTicket.status).toBe("confirmed");
  expect(
    (
      await api(
        page,
        buyer,
        "POST",
        `/api/event-operations/ticket-types/${freeType.id}/claim`,
        { name: "Repeat", email: `buyer-${marker}@example.com`, quantity: 1 },
      )
    ).status(),
  ).toBe(409);
  const freeWaitlist = await api(
    page,
    learner,
    "POST",
    `/api/event-operations/ticket-types/${freeType.id}/claim`,
    {
      name: `Learner ${marker}`,
      email: `learner-${marker}@example.com`,
      quantity: 1,
    },
  );
  expect(freeWaitlist.status()).toBe(202);
  const paidClaim = await api(
    page,
    payer,
    "POST",
    `/api/event-operations/ticket-types/${paidType.id}/claim`,
    {
      name: `Payer ${marker}`,
      email: `payer-${marker}@example.com`,
      quantity: 1,
    },
  );
  await ok(paidClaim);
  const paidTicket = await paidClaim.json();
  expect(paidTicket).toMatchObject({
    status: "payment_required",
    paymentStatus: "required",
  });
  const paidWaitlist = await api(
    page,
    peer,
    "POST",
    `/api/event-operations/ticket-types/${paidType.id}/claim`,
    {
      name: `Peer ${marker}`,
      email: `peer-${marker}@example.com`,
      quantity: 1,
    },
  );
  expect(paidWaitlist.status()).toBe(202);

  await ok(
    await api(
      page,
      buyer,
      "DELETE",
      `/api/event-operations/tickets/${freeTicket.id}`,
    ),
  );
  await ok(
    await api(
      page,
      payer,
      "DELETE",
      `/api/event-operations/tickets/${paidTicket.id}`,
    ),
  );
  let operationsResponse = await api(
    page,
    owner,
    "GET",
    `/api/event-operations/events/${event.id}`,
  );
  await ok(operationsResponse);
  let operations = await operationsResponse.json();
  const promotedFree = operations.tickets.find(
    (ticket: { holderUserId: number }) => ticket.holderUserId === learner,
  );
  const promotedPaid = operations.tickets.find(
    (ticket: { holderUserId: number }) => ticket.holderUserId === peer,
  );
  expect(promotedFree.status).toBe("confirmed");
  expect(promotedPaid).toMatchObject({
    status: "payment_required",
    paymentStatus: "required",
  });
  const seriesResponse = await api(
    page,
    owner,
    "POST",
    `/api/event-operations/events/${event.id}/series`,
    {
      timezone: "America/Los_Angeles",
      frequency: "weekly",
      intervalCount: 1,
      occurrenceCount: 4,
    },
  );
  await ok(seriesResponse);
  expect((await seriesResponse.json()).occurrences).toHaveLength(4);
  const roomResponse = await api(
    page,
    owner,
    "POST",
    `/api/event-operations/events/${event.id}/room`,
    {
      recordingEnabled: true,
      transcriptionEnabled: true,
      aiAssistanceEnabled: true,
    },
  );
  await ok(roomResponse);
  expect(await roomResponse.json()).toMatchObject({
    recordingEnabled: true,
    transcriptionEnabled: true,
    aiAssistanceEnabled: true,
  });
  await ok(
    await api(
      page,
      owner,
      "POST",
      `/api/event-operations/tickets/${promotedFree.id}/check-in`,
      {},
    ),
  );
  const assetsResponse = await api(page, owner, "GET", "/api/assets");
  await ok(assetsResponse);
  const replayAsset = (await assetsResponse.json()).find(
    (asset: { status: string }) => asset.status === "ready",
  );
  expect(replayAsset).toBeTruthy();
  const replayResponse = await api(
    page,
    owner,
    "POST",
    `/api/event-operations/events/${event.id}/replay`,
    { assetId: replayAsset.id },
  );
  await ok(replayResponse);
  expect((await replayResponse.json()).granted).toBe(1);
  const learnerAccess = await api(page, learner, "GET", "/api/booking/me");
  await ok(learnerAccess);
  const replay = (await learnerAccess.json()).replays.find(
    (item: { eventId: string }) => item.eventId === event.id,
  );
  expect(replay).toBeTruthy();
  expect(replay.assetId).toBe(replayAsset.id);
  expect(new Date(replay.expiresAt).getTime()).toBeGreaterThan(Date.now());
  const dispatch = await api(
    page,
    owner,
    "POST",
    "/api/event-operations/dispatch-due",
    {},
  );
  await ok(dispatch);
  expect((await dispatch.json()).processed).toBeGreaterThan(0);

  operationsResponse = await api(
    page,
    owner,
    "GET",
    `/api/event-operations/events/${event.id}`,
  );
  operations = await operationsResponse.json();
  expect(operations.settings.roomId).toBeTruthy();
  expect(operations.settings.replayAssetId).toBe(replayAsset.id);
  await page.goto(`/business/booking/events/${event.id}`);
  await expect(page.getByRole("heading", { name: event.name })).toBeVisible();
  await expect(
    page.getByText("Community access", { exact: true }),
  ).toBeVisible();
  await page.goto(`/events/${event.id}/tickets`);
  await expect(page.getByRole("heading", { name: event.name })).toBeVisible();
  await expect(page.getByText("Premium access", { exact: true })).toBeVisible();
});
