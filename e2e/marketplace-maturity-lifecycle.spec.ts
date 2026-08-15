import {
  expect,
  test,
  type APIResponse,
  type Page,
  type TestInfo,
} from "@playwright/test";

function actors(testInfo: TestInfo) {
  const seller = testInfo.project.name.startsWith("mobile") ? 1 : 2;
  const buyer = testInfo.project.name.startsWith("mobile") ? 4 : 5;
  return { seller, buyer, outsider: buyer === 4 ? 5 : 4 };
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

test("seller storefront, bundle, promotion, entitlement, and accountable support close one commercial lifecycle", async ({
  page,
}, testInfo) => {
  const { seller, buyer, outsider } = actors(testInfo);
  const marker = `${testInfo.project.name}-${Date.now()}`.toLowerCase();
  const profileResponse = await api(
    page,
    seller,
    "PUT",
    "/api/marketplace/seller-profile",
    {
      displayName: `Seller ${marker}`,
      slug: `seller-${marker}`,
      headline: "Connected creator products and experiences",
      bio: "A qualified storefront with accountable support.",
      supportEmail: `support-${marker}@example.com`,
      brandColor: "#1d9bf0",
      logoUrl: null,
      refundPolicy:
        "Refund requests receive a documented review within two business days.",
      fulfillmentSlaHours: 24,
      country: "US",
      taxResponsibility: "platform_provider_pending",
      operationalPolicyVersion: "marketplace-operations-v1",
      acceptOperationalPolicy: true,
    },
  );
  await ok(profileResponse);
  const sellerProfile = await profileResponse.json();
  const operationsResponse = await api(
    page,
    seller,
    "GET",
    "/api/marketplace/operations",
  );
  await ok(operationsResponse);
  const operations = await operationsResponse.json();
  const offers = operations.offers.filter(
    (offer: { status: string; productType: string; payoutMode: string }) =>
      offer.status === "published" &&
      offer.productType !== "bundle" &&
      offer.payoutMode === "platform",
  );
  expect(offers.length).toBeGreaterThanOrEqual(2);
  const promotionResponse = await api(
    page,
    seller,
    "POST",
    "/api/marketplace/promotions",
    {
      name: `Launch ${marker}`,
      code: `SAVE${Date.now()}`,
      discountType: "percentage",
      percentageBps: 2000,
      fixedAmountCents: 0,
      trialDays: 0,
      productIds: [],
      minimumSubtotalCents: 0,
      startsAt: null,
      endsAt: null,
      maximumRedemptions: 10,
      maximumPerBuyer: 1,
    },
  );
  await ok(promotionResponse);
  const promotion = await promotionResponse.json();
  const bundleResponse = await api(
    page,
    seller,
    "POST",
    "/api/marketplace/bundles",
    {
      title: `Creator system ${marker}`,
      slug: `creator-system-${marker}`,
      description: "Two connected offers delivered through one settlement.",
      priceCents: 5000,
      imageUrl: null,
      productIds: offers.slice(0, 2).map((offer: { id: number }) => offer.id),
    },
  );
  await ok(bundleResponse);
  const bundle = await bundleResponse.json();
  const orderResponse = await api(page, buyer, "POST", "/api/orders", {
    productIds: [bundle.product.id],
    idempotencyKey: `bundle-order-${marker}`,
    promotionCode: promotion.code,
  });
  await ok(orderResponse);
  const order = await orderResponse.json();
  expect(order).toMatchObject({
    subtotalAmount: 50,
    discountAmount: 10,
    totalAmount: 40,
    promotionCode: promotion.code,
  });
  const buyerLimit = await api(page, buyer, "POST", "/api/orders", {
    productIds: [offers[0].id],
    idempotencyKey: `promotion-limit-${marker}`,
    promotionCode: promotion.code,
  });
  expect(buyerLimit.status()).toBe(409);
  expect((await buyerLimit.json()).message).toMatch(/buyer limit/i);
  await ok(
    await api(
      page,
      buyer,
      "POST",
      `/api/qualification/orders/${order.id}/settle`,
      { providerReference: `bundle-qualified-${marker}` },
    ),
  );
  const purchasesResponse = await api(page, buyer, "GET", "/api/purchases");
  await ok(purchasesResponse);
  const purchaseIds = (await purchasesResponse.json()).map(
    (purchase: { productId: number }) => purchase.productId,
  );
  expect(purchaseIds).toEqual(
    expect.arrayContaining([bundle.product.id, offers[0].id, offers[1].id]),
  );
  const supportResponse = await api(
    page,
    buyer,
    "POST",
    "/api/marketplace/support-cases",
    {
      orderId: order.id,
      productId: bundle.product.id,
      category: "refund",
      summary: "Please review a partial refund request with the seller.",
      requestedRefundCents: 1000,
    },
  );
  await ok(supportResponse);
  const supportCase = await supportResponse.json();
  expect(
    (
      await api(
        page,
        outsider,
        "GET",
        `/api/marketplace/support-cases/${supportCase.id}`,
      )
    ).status(),
  ).toBe(404);
  await ok(
    await api(
      page,
      seller,
      "POST",
      `/api/marketplace/support-cases/${supportCase.id}/messages`,
      {
        body: "The seller reviewed the commercial record and approved the request.",
      },
    ),
  );
  const approvedResponse = await api(
    page,
    seller,
    "PATCH",
    `/api/marketplace/support-cases/${supportCase.id}`,
    {
      status: "refund_required",
      approvedRefundCents: 1000,
      resolutionNote: "Approved for provider processing.",
    },
  );
  await ok(approvedResponse);
  expect(await approvedResponse.json()).toMatchObject({
    status: "refund_required",
    approvedRefundCents: 1000,
    providerActionStatus: "provider_pending",
  });

  await page.goto("/business/marketplace");
  await expect(
    page.getByRole("heading", { name: "Marketplace Operations" }),
  ).toBeVisible();
  await expect(
    page.getByText(sellerProfile.displayName, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(bundle.product.title, { exact: true }),
  ).toBeVisible();
  await page.goto(`/store/${sellerProfile.slug}`);
  await expect(
    page.getByRole("heading", { name: sellerProfile.displayName }),
  ).toBeVisible();
  await expect(
    page.getByText(bundle.product.title, { exact: true }),
  ).toBeVisible();
  await page.goto(`/support/${supportCase.id}`);
  await expect(
    page.getByText(supportCase.caseNumber, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/provider pending/i)).toBeVisible();
});
