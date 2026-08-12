type PaymentNotificationInput = {
  orderId: string;
  buyer: { id: number; displayName: string; profileImageUrl: string | null };
  items: Array<{ title: string; sellerId: number | undefined }>;
};

type PaymentNotification = {
  userId: number;
  type: "purchase";
  message: string;
  read: false;
  linkTo: string;
  relatedUserId: number | null;
  relatedUserImage: string | null;
  sourceType: "order_paid_buyer" | "order_paid_seller";
  sourceId: string;
};

const summarizeTitles = (titles: string[]) => titles.length > 1
  ? `${titles[0]} and ${titles.length - 1} more`
  : titles[0];

export function buildPaymentNotifications(input: PaymentNotificationInput): PaymentNotification[] {
  if (!input.items.length) return [];

  const notifications: PaymentNotification[] = [{
    userId: input.buyer.id,
    type: "purchase",
    message: `Payment confirmed for ${summarizeTitles(input.items.map((item) => item.title))}.`,
    read: false,
    linkTo: `/orders?view=purchases&order=${encodeURIComponent(input.orderId)}`,
    relatedUserId: null,
    relatedUserImage: null,
    sourceType: "order_paid_buyer",
    sourceId: input.orderId,
  }];

  const titlesBySeller = new Map<number, string[]>();
  for (const item of input.items) {
    if (item.sellerId === undefined || item.sellerId === input.buyer.id) continue;
    const titles = titlesBySeller.get(item.sellerId) ?? [];
    titles.push(item.title);
    titlesBySeller.set(item.sellerId, titles);
  }

  for (const [sellerId, titles] of Array.from(titlesBySeller.entries())) {
    notifications.push({
      userId: sellerId,
      type: "purchase",
      message: `${input.buyer.displayName} purchased ${summarizeTitles(titles)}.`,
      read: false,
      linkTo: `/orders?view=sales&order=${encodeURIComponent(input.orderId)}`,
      relatedUserId: input.buyer.id,
      relatedUserImage: input.buyer.profileImageUrl,
      sourceType: "order_paid_seller",
      sourceId: input.orderId,
    });
  }

  return notifications;
}
