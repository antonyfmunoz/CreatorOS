export const mvpProductTypes = [
  "digital_download",
  "course",
  "community",
  "membership",
  "bundle",
] as const;

export const productBillingModels = ["one_time", "recurring"] as const;
export const productBillingIntervals = ["month", "year"] as const;

export type MvpProductType = (typeof mvpProductTypes)[number];
export type ProductBillingModel = (typeof productBillingModels)[number];
export type ProductBillingInterval = (typeof productBillingIntervals)[number];

export const productTypeLabels: Record<MvpProductType, string> = {
  digital_download: "Digital download",
  course: "Course",
  community: "Community",
  membership: "Membership",
  bundle: "Bundle",
};

export function productTypeFromLegacyCategory(
  category: unknown,
): MvpProductType {
  if (typeof category !== "string") return "digital_download";
  const normalized = category.trim().toLowerCase();
  if (normalized.includes("course")) return "course";
  if (normalized.includes("community")) return "community";
  if (normalized.includes("membership")) return "membership";
  return "digital_download";
}

export function normalizeProductCommercialTerms(input: {
  productType?: unknown;
  billingModel?: unknown;
  billingInterval?: unknown;
  category?: unknown;
}) {
  const productType = mvpProductTypes.includes(
    input.productType as MvpProductType,
  )
    ? (input.productType as MvpProductType)
    : productTypeFromLegacyCategory(input.category);
  const billingModel = productBillingModels.includes(
    input.billingModel as ProductBillingModel,
  )
    ? (input.billingModel as ProductBillingModel)
    : "one_time";
  const billingInterval =
    billingModel === "recurring"
      ? productBillingIntervals.includes(
          input.billingInterval as ProductBillingInterval,
        )
        ? (input.billingInterval as ProductBillingInterval)
        : "month"
      : null;

  if (
    billingModel === "recurring" &&
    productType !== "membership" &&
    productType !== "community"
  ) {
    throw new Error(
      "Recurring billing is available for memberships and communities",
    );
  }

  return { productType, billingModel, billingInterval };
}

export function checkoutBillingTerms(
  items: Array<{
    billingModel: string;
    billingInterval: string | null;
  }>,
) {
  if (!items.length) throw new Error("Checkout requires at least one offer");
  const billingModel =
    items[0].billingModel === "recurring" ? "recurring" : "one_time";
  const billingInterval =
    billingModel === "recurring" ? items[0].billingInterval : null;
  const incompatible = items.some(
    (item) =>
      (item.billingModel === "recurring" ? "recurring" : "one_time") !==
        billingModel ||
      (billingModel === "recurring" &&
        item.billingInterval !== billingInterval),
  );
  if (incompatible) {
    throw new Error("Checkout items must use the same billing schedule");
  }
  return { billingModel, billingInterval } as const;
}
