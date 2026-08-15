import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BadgePercent,
  ExternalLink,
  LifeBuoy,
  PackagePlus,
  Store,
} from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
type Seller = {
  id: string;
  displayName: string;
  slug: string;
  supportEmail: string;
  refundPolicy: string;
  taxResponsibility: string;
  onboardingStatus: string;
};
type Offer = {
  id: number;
  title: string;
  price: number;
  status: string;
  productType: string;
};
type Promotion = {
  id: string;
  name: string;
  code: string;
  discountType: string;
  percentageBps: number;
  fixedAmountCents: number;
  status: string;
};
type Bundle = { bundle: { id: string; slug: string }; product: Offer };
type SupportCase = {
  id: string;
  caseNumber: string;
  category: string;
  summary: string;
  status: string;
  providerActionStatus: string;
};
type Operations = {
  seller: Seller | null;
  offers: Offer[];
  promotions: Promotion[];
  bundles: Bundle[];
  cases: SupportCase[];
};
export default function MarketplaceOperationsPage() {
  const [, navigate] = useLocation();
  const operations = useQuery<Operations>({
    queryKey: ["/api/marketplace/operations"],
  });
  const [displayName, setDisplayName] = useState("");
  const [slug, setSlug] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [refundPolicy, setRefundPolicy] = useState(
    "Refund requests are reviewed within two business days. Access and delivery issues are prioritized before monetary resolution.",
  );
  const [promotionName, setPromotionName] = useState("Launch offer");
  const [promotionCode, setPromotionCode] = useState("LAUNCH20");
  const [promotionPercent, setPromotionPercent] = useState("20");
  const [bundleTitle, setBundleTitle] = useState("");
  const [bundleSlug, setBundleSlug] = useState("");
  const [bundlePrice, setBundlePrice] = useState("0");
  const [selected, setSelected] = useState<number[]>([]);
  const [message, setMessage] = useState("");
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: ["/api/marketplace/operations"],
    });
  const action = useMutation({
    mutationFn: async ({
      method = "POST",
      path,
      body,
    }: {
      method?: "POST" | "PUT";
      path: string;
      body: unknown;
    }) => (await apiRequest(method, path, body)).json(),
    onSuccess: async () => {
      setMessage("Saved.");
      await refresh();
    },
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : "Action failed"),
  });
  const published = useMemo(
    () =>
      operations.data?.offers.filter(
        (offer) =>
          offer.status === "published" && offer.productType !== "bundle",
      ) ?? [],
    [operations.data?.offers],
  );
  return (
    <main className="min-h-dvh bg-black pb-24 text-white">
      <header className="border-b border-zinc-800">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/business")}
          >
            <ArrowLeft />
          </Button>
          <Store className="text-[#1d9bf0]" />
          <div>
            <h1 className="font-black">Marketplace Operations</h1>
            <p className="text-[10px] text-zinc-500">
              Seller readiness, storefront, bundles, promotions, support, and
              refund handoff
            </p>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl space-y-5 p-4">
        {message && (
          <p role="status" className="rounded-xl bg-[#1d9bf0]/10 p-3 text-xs">
            {message}
          </p>
        )}
        {!operations.data?.seller ? (
          <section className="mx-auto max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <h2 className="font-black">Complete seller onboarding</h2>
            <p className="mt-1 text-xs text-zinc-500">
              This is an operational acknowledgement, not unpublished legal
              terms. Tax remains explicitly provider-pending until launch-region
              policy is approved.
            </p>
            <Input
              className="mt-4 border-zinc-800 bg-black"
              placeholder="Store display name"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                if (!slug)
                  setSlug(
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9]+/g, "-")
                      .replace(/^-|-$/g, ""),
                  );
              }}
            />
            <Input
              className="mt-2 border-zinc-800 bg-black"
              placeholder="store-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
            <Input
              className="mt-2 border-zinc-800 bg-black"
              placeholder="Support email"
              type="email"
              value={supportEmail}
              onChange={(e) => setSupportEmail(e.target.value)}
            />
            <textarea
              className="mt-2 min-h-28 w-full rounded-md border border-zinc-800 bg-black p-3 text-sm"
              aria-label="Refund policy"
              value={refundPolicy}
              onChange={(e) => setRefundPolicy(e.target.value)}
            />
            <Button
              className="mt-3 w-full bg-[#1d9bf0] text-black"
              disabled={
                !displayName ||
                !slug ||
                !supportEmail ||
                refundPolicy.length < 20
              }
              onClick={() =>
                action.mutate({
                  method: "PUT",
                  path: "/api/marketplace/seller-profile",
                  body: {
                    displayName,
                    slug,
                    headline: "Creator-owned products and experiences",
                    bio: "",
                    supportEmail,
                    brandColor: "#1d9bf0",
                    logoUrl: null,
                    refundPolicy,
                    fulfillmentSlaHours: 24,
                    country: null,
                    taxResponsibility: "platform_provider_pending",
                    operationalPolicyVersion: "marketplace-operations-v1",
                    acceptOperationalPolicy: true,
                  },
                })
              }
            >
              Activate seller operations
            </Button>
          </section>
        ) : (
          <>
            <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase text-[#1d9bf0]">
                    Active storefront
                  </p>
                  <h2 className="text-2xl font-black">
                    {operations.data.seller.displayName}
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Support: {operations.data.seller.supportEmail} · tax:{" "}
                    {operations.data.seller.taxResponsibility.replaceAll(
                      "_",
                      " ",
                    )}
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() =>
                    window.open(
                      `/store/${operations.data!.seller!.slug}`,
                      "_blank",
                    )
                  }
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View storefront
                </Button>
              </div>
            </section>
            <div className="grid gap-5 lg:grid-cols-2">
              <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
                <div className="flex items-center gap-2">
                  <BadgePercent className="text-[#1d9bf0]" />
                  <h2 className="font-black">Promotions</h2>
                </div>
                <Input
                  className="mt-4 border-zinc-800 bg-black"
                  aria-label="Promotion name"
                  value={promotionName}
                  onChange={(e) => setPromotionName(e.target.value)}
                />
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Input
                    className="border-zinc-800 bg-black uppercase"
                    aria-label="Promotion code"
                    value={promotionCode}
                    onChange={(e) =>
                      setPromotionCode(e.target.value.toUpperCase())
                    }
                  />
                  <Input
                    className="border-zinc-800 bg-black"
                    type="number"
                    aria-label="Promotion percent"
                    value={promotionPercent}
                    onChange={(e) => setPromotionPercent(e.target.value)}
                  />
                </div>
                <Button
                  className="mt-3 w-full"
                  onClick={() =>
                    action.mutate({
                      path: "/api/marketplace/promotions",
                      body: {
                        name: promotionName,
                        code: promotionCode,
                        discountType: "percentage",
                        percentageBps: Math.round(
                          Number(promotionPercent) * 100,
                        ),
                        fixedAmountCents: 0,
                        productIds: [],
                        minimumSubtotalCents: 0,
                        startsAt: null,
                        endsAt: null,
                        maximumRedemptions: 0,
                        maximumPerBuyer: 1,
                      },
                    })
                  }
                >
                  Create promotion
                </Button>
                {operations.data.promotions.map((promotion) => (
                  <article
                    key={promotion.id}
                    className="mt-3 rounded-xl bg-black p-3"
                  >
                    <strong className="text-sm">{promotion.name}</strong>
                    <p className="text-xs text-zinc-500">
                      {promotion.code} ·{" "}
                      {promotion.discountType === "percentage"
                        ? `${promotion.percentageBps / 100}%`
                        : `$${promotion.fixedAmountCents / 100}`}{" "}
                      · {promotion.status}
                    </p>
                  </article>
                ))}
              </section>
              <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
                <div className="flex items-center gap-2">
                  <PackagePlus className="text-[#1d9bf0]" />
                  <h2 className="font-black">Offer bundles</h2>
                </div>
                <Input
                  className="mt-4 border-zinc-800 bg-black"
                  placeholder="Bundle title"
                  value={bundleTitle}
                  onChange={(e) => {
                    setBundleTitle(e.target.value);
                    if (!bundleSlug)
                      setBundleSlug(
                        e.target.value
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, "-")
                          .replace(/^-|-$/g, ""),
                      );
                  }}
                />
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Input
                    className="border-zinc-800 bg-black"
                    placeholder="bundle-slug"
                    value={bundleSlug}
                    onChange={(e) => setBundleSlug(e.target.value)}
                  />
                  <Input
                    className="border-zinc-800 bg-black"
                    type="number"
                    step="0.01"
                    aria-label="Bundle price"
                    value={bundlePrice}
                    onChange={(e) => setBundlePrice(e.target.value)}
                  />
                </div>
                <div className="mt-3 space-y-2">
                  {published.map((offer) => (
                    <label
                      key={offer.id}
                      className="flex items-center gap-3 rounded-xl bg-black p-3 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(offer.id)}
                        onChange={(e) =>
                          setSelected((current) =>
                            e.target.checked
                              ? [...current, offer.id]
                              : current.filter((id) => id !== offer.id),
                          )
                        }
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {offer.title}
                      </span>
                      <span className="text-zinc-500">
                        ${offer.price.toFixed(2)}
                      </span>
                    </label>
                  ))}
                </div>
                <Button
                  className="mt-3 w-full"
                  disabled={!bundleTitle || !bundleSlug || selected.length < 2}
                  onClick={() =>
                    action.mutate({
                      path: "/api/marketplace/bundles",
                      body: {
                        title: bundleTitle,
                        slug: bundleSlug,
                        description: "A connected CreativesOS offer bundle.",
                        priceCents: Math.round(Number(bundlePrice) * 100),
                        imageUrl: null,
                        productIds: selected,
                      },
                    })
                  }
                >
                  Publish bundle
                </Button>
                {operations.data.bundles.map((row) => (
                  <article
                    key={row.bundle.id}
                    className="mt-3 rounded-xl bg-black p-3"
                  >
                    <strong className="text-sm">{row.product.title}</strong>
                    <p className="text-xs text-zinc-500">
                      ${row.product.price.toFixed(2)} · /{row.bundle.slug}
                    </p>
                  </article>
                ))}
              </section>
            </div>
            <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
              <div className="flex items-center gap-2">
                <LifeBuoy className="text-[#1d9bf0]" />
                <h2 className="font-black">Support and refund operations</h2>
              </div>
              {!operations.data.cases.length && (
                <p className="mt-2 text-sm text-zinc-600">No support cases.</p>
              )}
              {operations.data.cases.map((supportCase) => (
                <button
                  key={supportCase.id}
                  className="mt-2 block w-full rounded-xl bg-black p-3 text-left"
                  onClick={() => navigate(`/support/${supportCase.id}`)}
                >
                  <div className="flex justify-between">
                    <strong className="text-sm">
                      {supportCase.caseNumber}
                    </strong>
                    <span className="text-[10px] uppercase text-[#1d9bf0]">
                      {supportCase.status}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-zinc-500">
                    {supportCase.category} · {supportCase.summary} ·{" "}
                    {supportCase.providerActionStatus}
                  </p>
                </button>
              ))}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
