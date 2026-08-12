import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Check, CheckCircle2, Download, LockKeyhole, Package, ShoppingCart, Star } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Product, Purchase } from "@/types";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/hooks/use-cart";
import { startStripeCheckout } from "@/lib/checkout";

type ProductReview = {
  id: string;
  rating: number;
  body: string;
  isVerifiedPurchase: boolean;
  createdAt: string;
  author: { id: number; username: string; displayName: string; profileImageUrl: string | null };
};
type ProductAsset = {
  id: string;
  kind: string;
  mimeType: string | null;
  sizeBytes: number | null;
  originalFilename: string | null;
};

function fileSize(value: number | null) {
  if (!value) return "Unknown size";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ProductDetail({ id: routeProductId }: { id?: string }) {
  const [, setLocation] = useLocation();
  const params = useParams<{ id?: string }>();
  const productId = Number(routeProductId ?? params.id);
  const isDemoMode = import.meta.env.VITE_CREATOROS_DEMO_MODE === "true";
  const { user } = useAuth();
  const { toast } = useToast();
  const { add: addToCart } = useCart();
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const queryClient = useQueryClient();
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewBody, setReviewBody] = useState("");
  const { data: product, isLoading } = useQuery<Product>({
    queryKey: ["/api/products", productId],
    enabled: Number.isInteger(productId) && productId > 0,
    queryFn: async () => {
      const response = await fetch(`/api/products/${productId}`);
      if (!response.ok) throw new Error("Failed to load product");
      return response.json();
    },
  });
  const { data: purchases = [] } = useQuery<Purchase[]>({ queryKey: ["/api/purchases"] });
  const { data: reviews = [], isLoading: reviewsLoading } = useQuery<ProductReview[]>({
    queryKey: ["/api/products", productId, "reviews"],
    enabled: Number.isInteger(productId) && productId > 0,
    queryFn: async () => (await apiRequest("GET", `/api/products/${productId}/reviews`)).json(),
  });
  const hasAccess = purchases.some((purchase) => purchase.productId === productId && purchase.status === "active");
  const isOwner = product?.userId === user?.id;
  const canAccessFiles = Boolean(isOwner || hasAccess);
  const { data: deliveryAssets = [], isLoading: deliveryAssetsLoading } = useQuery<ProductAsset[]>({
    queryKey: ["/api/products", productId, "assets"],
    enabled: Boolean(user && canAccessFiles),
    queryFn: async () => (await apiRequest("GET", `/api/products/${productId}/assets`)).json(),
  });
  const grantAccess = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/products/${productId}/demo-access`, {})).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchases"] });
      toast({ title: "Access granted", description: "This offer is now in your Purchases library." });
    },
    onError: (error) => toast({ title: "Unable to grant access", description: error.message, variant: "destructive" }),
  });
  const checkout = useMutation({
    mutationFn: async () => startStripeCheckout([productId]),
    onError: (error) => toast({ title: "Checkout unavailable", description: error.message, variant: "destructive" }),
  });
  const saveReview = useMutation({
    mutationFn: async () => (await apiRequest("PUT", `/api/products/${productId}/review`, { rating: reviewRating, body: reviewBody })).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products", productId] });
      queryClient.invalidateQueries({ queryKey: ["/api/products", productId, "reviews"] });
      setReviewBody("");
      toast({ title: "Review saved", description: "Your verified purchase review is now visible on this offer." });
    },
    onError: (error) => toast({ title: "Review was not saved", description: error.message, variant: "destructive" }),
  });
  const downloadAsset = useMutation({
    mutationFn: async (assetId: string) => (await apiRequest("GET", `/api/assets/${assetId}/access`)).json() as Promise<{ url: string }>,
    onSuccess: ({ url }) => { window.location.assign(url); },
    onError: (error: Error) => toast({ title: "Could not open file", description: error.message, variant: "destructive" }),
  });

  const addProductToCart = async () => {
    if (!product) return;
    setIsAddingToCart(true);
    try {
      const added = await addToCart(product);
      toast({ title: added ? "Added to cart" : "Already in your cart", description: added ? `${product.title} is ready when you are.` : "You can complete your order from the cart." });
    } catch (error) {
      toast({ title: "Could not add to cart", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setIsAddingToCart(false);
    }
  };

  if (isLoading) return <Skeleton className="m-4 h-[420px] bg-zinc-900" />;

  if (!product) {
    return (
      <div className="min-h-dvh bg-black p-4 pb-20 text-white">
        <Button variant="ghost" className="text-zinc-400 hover:bg-zinc-900 hover:text-white" onClick={() => setLocation("/marketplace")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to marketplace
        </Button>
        <p className="mt-8 text-zinc-500">This product is no longer available.</p>
      </div>
    );
  }

  const inclusions = product.category === "Community"
    ? ["Private community access", "Creator-led discussions", "Member-only resources"]
    : product.category === "Course"
      ? ["Full lifetime access", "Creator resources and updates", "Learn at your own pace"]
      : ["Instant access after purchase", "Use in your creator work", "Future product updates"];
  const isCourse = product.category.toLowerCase().includes("course");
  const ratingLabel = product.reviewCount > 0 ? product.rating.toFixed(1) : "New";

  return (
    <div className="min-h-[calc(100dvh-3.5rem)] bg-black pb-36 text-white">
      <header className="flex h-16 items-center gap-2 border-b border-zinc-800 px-4">
        <Button variant="ghost" size="icon" className="-ml-2 text-white hover:bg-zinc-900 hover:text-white" onClick={() => setLocation("/marketplace")} aria-label="Back to marketplace">
          <ArrowLeft className="h-6 w-6" />
        </Button>
        <span className="text-xl font-bold">CreativesOS</span>
      </header>

      {product.imageUrl ? <img src={product.imageUrl} alt={product.title} className="aspect-[16/10] w-full object-cover" /> : <div className="flex aspect-[16/10] items-center justify-center bg-zinc-900"><Package className="h-16 w-16 text-zinc-500" /></div>}

      <main className="px-5 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">{product.category}</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight">{product.title}</h1>
            <p className="mt-2 text-base text-zinc-400">by {product.user.displayName}</p>
          </div>
          <span className="flex shrink-0 items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm font-bold"><Star className="h-4 w-4 fill-amber-400 text-amber-400" />{ratingLabel}</span>
        </div>
        <p className="mt-6 whitespace-pre-wrap text-base leading-7 text-zinc-300">{product.description}</p>
        <section className="mt-8 border-t border-zinc-800 pt-7">
          <h2 className="text-xl font-bold">What&apos;s included</h2>
          <ul className="mt-5 space-y-4">
            {inclusions.map((item) => <li key={item} className="flex items-center gap-3 text-base text-zinc-300"><CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />{item}</li>)}
          </ul>
        </section>
        {canAccessFiles && <section className="mt-8 border-t border-zinc-800 pt-7"><div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-900"><LockKeyhole className="h-4 w-4 text-zinc-300" /></span><div><h2 className="text-xl font-bold">Included files</h2><p className="mt-1 text-sm text-zinc-500">Protected files are available only while your access to this offer is active.</p></div></div><div className="mt-5 space-y-2">{deliveryAssetsLoading && <p className="text-sm text-zinc-500">Loading included files…</p>}{!deliveryAssetsLoading && deliveryAssets.length === 0 && <p className="rounded-xl border border-dashed border-zinc-800 p-4 text-sm leading-6 text-zinc-500">This offer does not include downloadable files yet.</p>}{deliveryAssets.map((asset) => <article key={asset.id} className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{asset.originalFilename ?? "Protected file"}</p><p className="mt-1 text-xs text-zinc-500">{asset.mimeType ?? asset.kind} · {fileSize(asset.sizeBytes)}</p></div><Button size="sm" variant="outline" className="shrink-0 border-zinc-700 bg-black text-white hover:bg-zinc-900 hover:text-white" disabled={downloadAsset.isPending} onClick={() => downloadAsset.mutate(asset.id)}><Download className="mr-2 h-4 w-4" />Open</Button></article>)}</div></section>}
        <section className="mt-8 border-t border-zinc-800 pt-7">
          <div className="flex items-end justify-between gap-3"><div><h2 className="text-xl font-bold">Verified reviews</h2><p className="mt-1 text-sm text-zinc-500">Only people with access to this offer can leave a review.</p></div><span className="text-sm font-semibold text-zinc-400">{product.reviewCount} {product.reviewCount === 1 ? "review" : "reviews"}</span></div>
          {hasAccess && product.userId !== user?.id && <div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><p className="text-sm font-bold">Share your experience</p><div className="mt-3 flex gap-1" aria-label="Your rating">{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" aria-label={`${value} star${value === 1 ? "" : "s"}`} onClick={() => setReviewRating(value)} className="rounded p-1"><Star className={`h-5 w-5 ${value <= reviewRating ? "fill-amber-400 text-amber-400" : "text-zinc-600"}`} /></button>)}</div><Textarea value={reviewBody} onChange={(event) => setReviewBody(event.target.value)} maxLength={2000} placeholder="What should other creatives know?" className="mt-3 min-h-24 border-zinc-700 bg-black text-white placeholder:text-zinc-600" /><div className="mt-3 flex items-center justify-between gap-3"><span className="text-xs text-zinc-500">Verified purchase</span><Button size="sm" className="bg-white text-black hover:bg-zinc-200" disabled={saveReview.isPending} onClick={() => saveReview.mutate()}>{saveReview.isPending ? "Saving…" : "Publish review"}</Button></div></div>}
          <div className="mt-5 space-y-4">{reviewsLoading && <p className="text-sm text-zinc-500">Loading reviews…</p>}{!reviewsLoading && reviews.length === 0 && <p className="rounded-xl border border-dashed border-zinc-800 p-4 text-sm text-zinc-500">No verified reviews yet.</p>}{reviews.map((review) => <article key={review.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><div className="flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-800 text-xs font-bold">{review.author.profileImageUrl ? <img src={review.author.profileImageUrl} alt="" className="h-full w-full object-cover" /> : review.author.displayName.slice(0, 1)}</div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-bold">{review.author.displayName}</p><span className="flex shrink-0 items-center gap-1 text-sm font-bold"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{review.rating}</span></div><p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-400">{review.isVerifiedPurchase ? "Verified purchase" : "Community review"}</p>{review.body && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-300">{review.body}</p>}</div></div></article>)}</div>
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-14 z-40 mx-auto w-full max-w-[720px] border-x border-t border-zinc-800 bg-black p-4">
        <div className="flex items-center gap-3 rounded-2xl bg-zinc-900 p-3">
          <div className="min-w-0 flex-1 pl-1">
            <p className="text-2xl font-bold">${product.price.toFixed(2)}{product.billingModel === "recurring" ? `/${product.billingInterval === "year" ? "year" : "month"}` : ""}</p>
            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">{isDemoMode ? "Demo access available" : "Secure checkout with Stripe"}</p>
          </div>
          {product.userId === user?.id ? <div className="flex gap-2"><Button variant="secondary" onClick={() => setLocation(`/products/${product.id}/edit`)}>Edit offer</Button>{isCourse && <Button className="bg-white text-black hover:bg-zinc-200" onClick={() => setLocation(`/courses/${product.id}/manage`)}>Edit curriculum</Button>}</div> : hasAccess ? <Button className="gap-2 bg-zinc-800 text-white" onClick={() => isCourse && setLocation(`/learn/${product.id}`)} disabled={!isCourse}><Check className="h-4 w-4" /> {isCourse ? "Continue course" : "In purchases"}</Button> : <div className="flex gap-2"><Button variant="secondary" className="h-12 rounded-xl border border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800" disabled={isAddingToCart} onClick={addProductToCart}>{isAddingToCart ? "Adding..." : "Add to cart"}</Button><Button className="h-12 gap-2 rounded-xl bg-white px-5 font-bold text-black hover:bg-zinc-200" disabled={grantAccess.isPending || checkout.isPending} onClick={() => isDemoMode ? grantAccess.mutate() : checkout.mutate()}><ShoppingCart className="h-4 w-4" /> {grantAccess.isPending || checkout.isPending ? "Opening..." : isDemoMode ? "Get access" : product.billingModel === "recurring" ? "Subscribe" : "Buy now"}</Button></div>}
        </div>
      </div>
    </div>
  );
}
