import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Download,
  FileUp,
  Landmark,
  LockKeyhole,
  Paperclip,
  Trash2,
} from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Product } from "@/types";

const offerTypes = [
  { value: "digital_download", label: "Digital download", category: "Digital Asset" },
  { value: "course", label: "Course", category: "Course" },
  { value: "community", label: "Community", category: "Community" },
  { value: "membership", label: "Membership", category: "Membership" },
] as const;
type Business = { id: string; name: string; isDefault: boolean };
type FormState = {
  title: string;
  description: string;
  price: string;
  category: string;
  productType: Product["productType"];
  billingModel: Product["billingModel"];
  billingInterval: "month" | "year";
  imageUrl: string;
  businessId: string;
  payoutMode: "platform" | "creator";
  status: "draft" | "published" | "archived";
};
type CreatorPaymentAccount = {
  connected: boolean;
  connectConfigured: boolean;
  status?: string;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
  platformFeeBps: number;
};
type LibraryAsset = {
  id: string;
  kind: string;
  visibility: "public" | "private";
  status: string;
  mimeType: string | null;
  sizeBytes: number | null;
  originalFilename: string | null;
};
type ProductAsset = Pick<
  LibraryAsset,
  "id" | "kind" | "mimeType" | "sizeBytes" | "originalFilename"
>;
type UploadIntent = { asset: { id: string }; upload: { uploadUrl: string } };

function uploadKind(file: File) {
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type.startsWith("image/")) return "photo";
  if (/^(application\/pdf|text\/)/i.test(file.type)) return "document";
  return "download";
}

function fileSize(value: number | null) {
  if (!value) return "Unknown size";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export default function OfferEditor() {
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();
  const productId = Number(id);
  const { user } = useAuth();
  const { toast } = useToast();
  const privateUploadInput = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<FormState>({
    title: "",
    description: "",
    price: "",
    category: "Course",
    productType: "course",
    billingModel: "one_time",
    billingInterval: "month",
    imageUrl: "",
    businessId: "",
    payoutMode: "platform",
    status: "draft",
  });

  const productQuery = useQuery<Product>({
    queryKey: ["/api/products", productId, "manage"],
    enabled: Number.isInteger(productId),
    queryFn: async () =>
      (await apiRequest("GET", `/api/products/${productId}/manage`)).json(),
  });
  const businessesQuery = useQuery<Business[]>({
    queryKey: ["/api/businesses"],
    queryFn: async () => (await apiRequest("GET", "/api/businesses")).json(),
  });
  const payoutAccountQuery = useQuery<CreatorPaymentAccount>({
    queryKey: ["/api/creator-payments/account"],
    queryFn: async () =>
      (await apiRequest("GET", "/api/creator-payments/account")).json(),
  });
  const privateAssetsQuery = useQuery<LibraryAsset[]>({
    queryKey: ["/api/assets", "private"],
    queryFn: async () =>
      (await apiRequest("GET", "/api/assets?visibility=private")).json(),
  });
  const productAssetsQuery = useQuery<ProductAsset[]>({
    queryKey: ["/api/products", productId, "assets"],
    enabled: Number.isInteger(productId),
    queryFn: async () =>
      (await apiRequest("GET", `/api/products/${productId}/assets`)).json(),
  });

  useEffect(() => {
    const product = productQuery.data;
    if (product)
      setForm({
        title: product.title,
        description: product.description,
        price: String(product.price),
        category: product.category,
        productType: product.productType ?? "digital_download",
        billingModel: product.billingModel ?? "one_time",
        billingInterval: product.billingInterval ?? "month",
        imageUrl: product.imageUrl ?? "",
        businessId: product.businessId ?? "",
        payoutMode: product.payoutMode ?? "platform",
        status: product.status ?? "draft",
      });
  }, [productQuery.data]);

  const refreshAssets = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/assets", "private"] });
    queryClient.invalidateQueries({
      queryKey: ["/api/products", productId, "assets"],
    });
  };
  const save = useMutation({
    mutationFn: async () =>
      (
        await apiRequest("PATCH", `/api/products/${productId}`, {
          ...form,
          price: Number(form.price),
          imageUrl: form.imageUrl.trim() || null,
          businessId: form.businessId || null,
          billingInterval: form.billingModel === "recurring" ? form.billingInterval : null,
        })
      ).json(),
    onSuccess: (product: Product) => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products", productId] });
      toast({
        title:
          product.status === "published" ? "Offer published" : "Draft saved",
        description:
          product.status === "published"
            ? "Your offer is now discoverable in the marketplace."
            : "This offer stays private until you publish it.",
      });
      setLocation(
        product.status === "published"
          ? `/marketplace/product/${productId}`
          : "/business",
      );
    },
    onError: (error: Error) =>
      toast({
        title: "Could not update offer",
        description: error.message,
        variant: "destructive",
      }),
  });
  const startOnboarding = useMutation({
    mutationFn: async () =>
      (
        await apiRequest("POST", "/api/creator-payments/onboarding", {})
      ).json() as Promise<{ onboardingUrl: string }>,
    onSuccess: ({ onboardingUrl }) => {
      window.location.assign(onboardingUrl);
    },
    onError: (error: Error) =>
      toast({
        title: "Could not open payout setup",
        description: error.message,
        variant: "destructive",
      }),
  });
  const attachAsset = useMutation({
    mutationFn: async (assetId: string) =>
      apiRequest("POST", `/api/products/${productId}/assets/${assetId}`, {}),
    onSuccess: () => {
      refreshAssets();
      toast({
        title: "File included",
        description: "Buyers with access can now retrieve this protected file.",
      });
    },
    onError: (error: Error) =>
      toast({
        title: "Could not include file",
        description: error.message,
        variant: "destructive",
      }),
  });
  const detachAsset = useMutation({
    mutationFn: async (assetId: string) =>
      apiRequest("DELETE", `/api/products/${productId}/assets/${assetId}`),
    onSuccess: () => {
      refreshAssets();
      toast({
        title: "File removed",
        description: "The original stays safely in your private library.",
      });
    },
    onError: (error: Error) =>
      toast({
        title: "Could not remove file",
        description: error.message,
        variant: "destructive",
      }),
  });
  const openAsset = useMutation({
    mutationFn: async (assetId: string) =>
      (
        await apiRequest("GET", `/api/assets/${assetId}/access`)
      ).json() as Promise<{ url: string }>,
    onSuccess: ({ url }) => {
      window.location.assign(url);
    },
    onError: (error: Error) =>
      toast({
        title: "Could not open file",
        description: error.message,
        variant: "destructive",
      }),
  });
  const uploadPrivateAsset = useMutation({
    mutationFn: async (file: File) => {
      const intent = (await (
        await apiRequest("POST", "/api/assets/upload-intents", {
          kind: uploadKind(file),
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          visibility: "private",
        })
      ).json()) as UploadIntent;
      try {
        const upload = await fetch(intent.upload.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!upload.ok)
          throw new Error("Private file upload was not accepted by storage");
        await apiRequest("POST", `/api/assets/${intent.asset.id}/complete`, {});
        return intent.asset.id;
      } catch (error) {
        await apiRequest("DELETE", `/api/assets/${intent.asset.id}`).catch(
          () => undefined,
        );
        throw error;
      }
    },
    onSuccess: (assetId) => {
      refreshAssets();
      attachAsset.mutate(assetId);
      if (privateUploadInput.current) privateUploadInput.current.value = "";
    },
    onError: (error: Error) =>
      toast({
        title: "Private upload failed",
        description: error.message,
        variant: "destructive",
      }),
  });

  if (productQuery.isLoading)
    return <Skeleton className="m-4 h-96 bg-zinc-900" />;
  if (!productQuery.data || productQuery.data.userId !== user?.id)
    return (
      <main className="min-h-dvh bg-black p-6 text-white">
        <p className="text-zinc-400">
          This offer is unavailable or you do not have permission to edit it.
        </p>
        <Button className="mt-4" onClick={() => setLocation("/business")}>
          Back to business
        </Button>
      </main>
    );

  const update = (key: keyof FormState, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const payoutReady = Boolean(
    payoutAccountQuery.data?.chargesEnabled &&
    payoutAccountQuery.data?.payoutsEnabled,
  );
  const connectAvailable = Boolean(payoutAccountQuery.data?.connectConfigured);
  const attachedIds = new Set(
    productAssetsQuery.data?.map((asset) => asset.id) ?? [],
  );
  const availableAssets = (privateAssetsQuery.data ?? []).filter(
    (asset) => asset.status === "ready" && !attachedIds.has(asset.id),
  );

  return (
    <main className="min-h-dvh bg-black pb-24 text-white">
      <header className="flex h-16 items-center gap-2 border-b border-zinc-800 px-4">
        <Button
          variant="ghost"
          size="icon"
          className="-ml-2 text-zinc-400 hover:bg-zinc-900 hover:text-white"
          onClick={() =>
            setLocation(
              form.status === "published"
                ? `/marketplace/product/${productId}`
                : "/business",
            )
          }
          aria-label="Back to offer"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-lg font-bold">Edit offer</h1>
          <p className="text-xs text-zinc-500">
            {form.status === "published"
              ? "Live in the marketplace."
              : "Drafts stay private until you publish them."}
          </p>
        </div>
      </header>
      <form
        className="mx-auto max-w-xl space-y-4 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold">Publishing</h2>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                Keep building privately, then make this offer available to
                buyers.
              </p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${form.status === "published" ? "bg-emerald-400/15 text-emerald-300" : form.status === "archived" ? "bg-zinc-800 text-zinc-400" : "bg-amber-400/15 text-amber-200"}`}
            >
              {form.status}
            </span>
          </div>
          <select
            aria-label="Publishing status"
            value={form.status}
            onChange={(event) => update("status", event.target.value)}
            className="mt-3 h-10 w-full rounded-md border border-zinc-700 bg-black px-3 text-sm text-white"
          >
            <option value="draft">Keep as draft</option>
            <option value="published">Publish to marketplace</option>
            <option value="archived">Archive offer</option>
          </select>
        </section>
        <div>
          <Label htmlFor="offer-title" className="text-zinc-300">Title</Label>
          <Input
            id="offer-title"
            value={form.title}
            onChange={(event) => update("title", event.target.value)}
            className="mt-2 border-zinc-700 bg-zinc-950 text-white"
            required
          />
        </div>
        <div>
          <Label htmlFor="offer-description" className="text-zinc-300">Description</Label>
          <Textarea
            id="offer-description"
            value={form.description}
            onChange={(event) => update("description", event.target.value)}
            className="mt-2 min-h-36 border-zinc-700 bg-zinc-950 text-white"
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="offer-price" className="text-zinc-300">Price (USD)</Label>
            <Input
              id="offer-price"
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={(event) => update("price", event.target.value)}
              className="mt-2 border-zinc-700 bg-zinc-950 text-white"
              required
            />
          </div>
          <div>
            <Label htmlFor="offer-type" className="text-zinc-300">Offer type</Label>
            <select
              id="offer-type"
              value={form.productType}
              onChange={(event) => {
                const offer = offerTypes.find((candidate) => candidate.value === event.target.value) ?? offerTypes[0];
                setForm((current) => ({
                  ...current,
                  productType: offer.value,
                  category: offer.category,
                  billingModel: offer.value === "membership" ? "recurring" : current.billingModel === "recurring" && offer.value !== "community" ? "one_time" : current.billingModel,
                }));
              }}
              className="mt-2 h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-white"
            >
              {offerTypes.map((offer) => (
                <option key={offer.value} value={offer.value}>{offer.label}</option>
              ))}
            </select>
          </div>
        </div>
        {(form.productType === "community" || form.productType === "membership") && <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="offer-payment-schedule" className="text-zinc-300">Payment schedule</Label>
            <select id="offer-payment-schedule" value={form.billingModel} onChange={(event) => update("billingModel", event.target.value)} className="mt-2 h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-white">
              {form.productType === "community" && <option value="one_time">One-time access</option>}
              <option value="recurring">Recurring membership</option>
            </select>
          </div>
          {form.billingModel === "recurring" && <div>
            <Label htmlFor="offer-billing-interval" className="text-zinc-300">Billing interval</Label>
            <select id="offer-billing-interval" value={form.billingInterval} onChange={(event) => update("billingInterval", event.target.value)} className="mt-2 h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-white"><option value="month">Monthly</option><option value="year">Yearly</option></select>
          </div>}
        </div>}
        <div>
          <Label htmlFor="offer-cover-url" className="text-zinc-300">Cover image URL</Label>
          <Input
            id="offer-cover-url"
            type="url"
            value={form.imageUrl}
            onChange={(event) => update("imageUrl", event.target.value)}
            placeholder="https://…"
            className="mt-2 border-zinc-700 bg-zinc-950 text-white placeholder:text-zinc-600"
          />
        </div>
        {(businessesQuery.data?.length ?? 0) > 1 && (
          <div>
            <Label htmlFor="offer-business" className="text-zinc-300">Business</Label>
            <select
              id="offer-business"
              value={form.businessId}
              onChange={(event) => update("businessId", event.target.value)}
              className="mt-2 h-10 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-white"
            >
              {businessesQuery.data?.map((business) => (
                <option key={business.id} value={business.id}>
                  {business.name}
                  {business.isDefault ? " (default)" : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          {form.productType === "course" && (
            <div className="mb-5 rounded-xl border border-zinc-800 bg-black p-3">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-900">
                  <BookOpen className="h-4 w-4 text-zinc-300" />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-bold">Course curriculum</h2>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">
                    Add modules, lessons, resources, and knowledge checks before
                    this course goes live.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-3 border-zinc-700 bg-black text-white hover:bg-zinc-900 hover:text-white"
                    onClick={() => setLocation(`/courses/${productId}/manage`)}
                  >
                    <BookOpen className="mr-1.5 h-3.5 w-3.5" />
                    Edit curriculum
                  </Button>
                </div>
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-900">
              <LockKeyhole className="h-4 w-4 text-zinc-300" />
            </span>
            <div>
              <h2 className="text-sm font-bold">Protected delivery files</h2>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                Files stay private in your library. Only buyers with an active
                entitlement receive a short-lived download link.
              </p>
            </div>
          </div>
          <input
            ref={privateUploadInput}
            type="file"
            className="sr-only"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) uploadPrivateAsset.mutate(file);
            }}
          />
          <Button
            type="button"
            variant="outline"
            className="mt-4 w-full border-zinc-700 bg-black text-white hover:bg-zinc-900 hover:text-white"
            disabled={uploadPrivateAsset.isPending}
            onClick={() => privateUploadInput.current?.click()}
          >
            <FileUp className="mr-2 h-4 w-4" />
            {uploadPrivateAsset.isPending
              ? "Uploading securely…"
              : "Upload protected file"}
          </Button>
          {productAssetsQuery.isLoading ? (
            <p className="mt-4 text-xs text-zinc-500">
              Loading included files…
            </p>
          ) : (
            <div className="mt-4 space-y-2">
              {(productAssetsQuery.data ?? []).map((asset) => (
                <div
                  key={asset.id}
                  className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-black p-3"
                >
                  <Paperclip className="h-4 w-4 text-zinc-500" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {asset.originalFilename ?? "Protected file"}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {asset.mimeType ?? asset.kind} ·{" "}
                      {fileSize(asset.sizeBytes)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-zinc-300 hover:bg-zinc-900 hover:text-white"
                    aria-label={`Open ${asset.originalFilename ?? "file"}`}
                    disabled={openAsset.isPending}
                    onClick={() => openAsset.mutate(asset.id)}
                  >
                    <Download className="mr-1.5 h-3.5 w-3.5" />
                    Open
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="text-zinc-500 hover:bg-zinc-900 hover:text-red-300"
                    aria-label={`Remove ${asset.originalFilename ?? "file"}`}
                    disabled={detachAsset.isPending}
                    onClick={() => detachAsset.mutate(asset.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              {(productAssetsQuery.data ?? []).length === 0 && (
                <p className="rounded-xl border border-dashed border-zinc-800 px-3 py-4 text-center text-xs leading-5 text-zinc-500">
                  Add download files, templates, or private resources to deliver
                  with this offer.
                </p>
              )}
            </div>
          )}{" "}
          {availableAssets.length > 0 && (
            <div className="mt-4 border-t border-zinc-800 pt-4">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                Private library
              </p>
              <div className="mt-2 space-y-2">
                {availableAssets.map((asset) => (
                  <div
                    key={asset.id}
                    className="flex items-center gap-3 rounded-xl bg-black p-3"
                  >
                    <Paperclip className="h-4 w-4 text-zinc-500" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {asset.originalFilename ?? "Private file"}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {asset.mimeType ?? asset.kind} ·{" "}
                        {fileSize(asset.sizeBytes)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="border-zinc-700 bg-zinc-950 text-white hover:bg-zinc-900 hover:text-white"
                      disabled={attachAsset.isPending}
                      onClick={() => attachAsset.mutate(asset.id)}
                    >
                      Include
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <div className="flex items-start gap-3">
            <Landmark className="mt-0.5 h-5 w-5 text-zinc-400" />
            <div>
              <h2 className="text-sm font-bold">Where the sale goes</h2>
              <p className="mt-1 text-xs leading-5 text-zinc-500">
                Platform revenue stays with CreativesOS. Creator earnings are
                routed to a Stripe Standard account you own after the platform
                fee.
              </p>
            </div>
          </div>
          <select
            aria-label="Revenue destination"
            value={form.payoutMode}
            onChange={(event) => update("payoutMode", event.target.value)}
            className="mt-3 h-10 w-full rounded-md border border-zinc-700 bg-black px-3 text-sm text-white"
          >
            <option value="platform">Platform revenue</option>
            <option value="creator">Creator payout to my Stripe account</option>
          </select>
          {form.payoutMode === "creator" && !payoutReady && (
            <div className="mt-3 rounded-xl bg-zinc-900 p-3">
              <p className="text-xs leading-5 text-zinc-400">
                {connectAvailable
                  ? "Connect the Stripe account you own before this offer can be sold as a creator payout."
                  : "Creator Stripe connections are being configured. This offer cannot be routed to a creator account yet."}
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-3 h-9 border-zinc-700 bg-black text-white hover:bg-zinc-800 hover:text-white"
                onClick={() => startOnboarding.mutate()}
                disabled={!connectAvailable || startOnboarding.isPending}
              >
                {startOnboarding.isPending
                  ? "Opening Stripe…"
                  : "Connect my Stripe account"}
              </Button>
            </div>
          )}
          {form.payoutMode === "creator" && payoutReady && (
            <p className="mt-3 text-xs font-medium text-emerald-400">
              Your independently owned Stripe account is ready.
            </p>
          )}
        </section>
        <Button
          type="submit"
          className="h-11 w-full rounded-xl bg-white font-bold text-black hover:bg-zinc-200"
          disabled={
            save.isPending ||
            !form.title.trim() ||
            !form.description.trim() ||
            !form.price
          }
        >
          {save.isPending ? "Saving…" : "Save offer"}
        </Button>
      </form>
    </main>
  );
}
