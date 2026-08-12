import { describe, expect, it } from "vitest";
import { buildPaymentNotifications } from "../server/payment-notifications";

describe("payment notifications", () => {
  it("builds one buyer notification and groups items by seller", () => {
    const result = buildPaymentNotifications({
      orderId: "order/one",
      buyer: { id: 7, displayName: "Buyer", profileImageUrl: "https://example.com/buyer.jpg" },
      items: [
        { title: "Course", sellerId: 9 },
        { title: "Templates", sellerId: 9 },
        { title: "Consulting", sellerId: 12 },
      ],
    });

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ userId: 7, sourceType: "order_paid_buyer", linkTo: "/orders?view=purchases&order=order%2Fone" });
    expect(result[1]).toMatchObject({ userId: 9, message: "Buyer purchased Course and 1 more.", sourceType: "order_paid_seller" });
    expect(result[2]).toMatchObject({ userId: 12, message: "Buyer purchased Consulting.", relatedUserId: 7 });
  });

  it("does not send a duplicate seller alert to a buyer purchasing their own offer", () => {
    const result = buildPaymentNotifications({
      orderId: "order-two",
      buyer: { id: 7, displayName: "Buyer", profileImageUrl: null },
      items: [{ title: "Own offer", sellerId: 7 }],
    });

    expect(result).toHaveLength(1);
    expect(result[0].sourceType).toBe("order_paid_buyer");
  });
});
