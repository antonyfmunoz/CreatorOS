import { useEffect, useState } from "react";
import { Package, Store } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
type Offer = {
  id: number;
  title: string;
  description: string;
  price: number;
  category: string;
  imageUrl: string | null;
  billingModel: string;
  billingInterval: string | null;
};
type Payload = {
  seller: {
    displayName: string;
    headline: string;
    bio: string;
    supportEmail: string;
    brandColor: string;
    logoUrl: string | null;
    refundPolicy: string;
  };
  offers: Offer[];
};
export default function StorefrontPage() {
  const { slug } = useParams<{ slug: string }>();
  const [, navigate] = useLocation();
  const [data, setData] = useState<Payload | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    void fetch(`/api/public/storefronts/${slug}`)
      .then(async (response) => {
        const value = await response.json();
        if (!response.ok) throw new Error(value.message);
        setData(value);
      })
      .catch((error) =>
        setMessage(
          error instanceof Error ? error.message : "Storefront unavailable",
        ),
      );
  }, [slug]);
  if (!data)
    return (
      <main className="grid min-h-dvh place-items-center bg-black text-zinc-500">
        {message || "Loading storefront…"}
      </main>
    );
  return (
    <main className="min-h-dvh bg-black p-4 text-white">
      <div className="mx-auto max-w-6xl">
        <header
          className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8 text-center"
          style={{ boxShadow: `inset 0 3px 0 ${data.seller.brandColor}` }}
        >
          {data.seller.logoUrl ? (
            <img
              className="mx-auto h-20 w-20 rounded-2xl object-cover"
              src={data.seller.logoUrl}
              alt=""
            />
          ) : (
            <Store
              className="mx-auto h-10 w-10"
              style={{ color: data.seller.brandColor }}
            />
          )}
          <p
            className="mt-4 text-xs font-black uppercase"
            style={{ color: data.seller.brandColor }}
          >
            CreativesOS storefront
          </p>
          <h1 className="mt-2 text-4xl font-black">
            {data.seller.displayName}
          </h1>
          <p className="mt-2 text-lg text-zinc-300">{data.seller.headline}</p>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-zinc-500">
            {data.seller.bio}
          </p>
        </header>
        <section className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.offers.map((offer) => (
            <article
              key={offer.id}
              className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950"
            >
              <div className="aspect-video bg-zinc-900">
                {offer.imageUrl ? (
                  <img
                    src={offer.imageUrl}
                    className="h-full w-full object-cover"
                    alt=""
                  />
                ) : (
                  <Package className="m-auto h-full w-10 text-zinc-700" />
                )}
              </div>
              <div className="p-4">
                <p className="text-[10px] font-black uppercase text-zinc-500">
                  {offer.category}
                </p>
                <h2 className="mt-1 font-black">{offer.title}</h2>
                <p className="mt-2 line-clamp-2 text-sm text-zinc-500">
                  {offer.description}
                </p>
                <div className="mt-4 flex items-center justify-between">
                  <strong>
                    ${offer.price.toFixed(2)}
                    {offer.billingModel === "recurring"
                      ? `/${offer.billingInterval}`
                      : ""}
                  </strong>
                  <Button
                    size="sm"
                    onClick={() => navigate(`/marketplace/product/${offer.id}`)}
                  >
                    View offer
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </section>
        <footer className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-950 p-5 text-xs text-zinc-500">
          <strong className="text-zinc-300">Store support</strong>
          <p className="mt-1">{data.seller.supportEmail}</p>
          <p className="mt-3">{data.seller.refundPolicy}</p>
        </footer>
      </div>
    </main>
  );
}
