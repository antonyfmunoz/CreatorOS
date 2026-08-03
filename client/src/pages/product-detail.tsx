import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, CheckCircle2, Package, ShoppingCart, Star } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Product, Purchase } from "@/types";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function ProductDetail({ id: routeProductId }: { id?: string }) {
  const [, setLocation] = useLocation();
  const params = useParams<{ id?: string }>();
  const productId = Number(routeProductId ?? params.id);
  const isDemoMode = import.meta.env.VITE_CREATOROS_DEMO_MODE === "true";
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
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
  const hasAccess = purchases.some((purchase) => purchase.productId === productId && purchase.status === "active");
  const grantAccess = useMutation({
    mutationFn: async () => (await apiRequest("POST", `/api/products/${productId}/demo-access`, {})).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchases"] });
      toast({ title: "Access granted", description: "This offer is now in your Purchases library." });
    },
    onError: (error) => toast({ title: "Unable to grant access", description: error.message, variant: "destructive" }),
  });

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
          <span className="flex shrink-0 items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm font-bold"><Star className="h-4 w-4 fill-amber-400 text-amber-400" />5.0</span>
        </div>
        <p className="mt-6 whitespace-pre-wrap text-base leading-7 text-zinc-300">{product.description}</p>
        <section className="mt-8 border-t border-zinc-800 pt-7">
          <h2 className="text-xl font-bold">What&apos;s included</h2>
          <ul className="mt-5 space-y-4">
            {inclusions.map((item) => <li key={item} className="flex items-center gap-3 text-base text-zinc-300"><CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />{item}</li>)}
          </ul>
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-14 z-40 mx-auto w-full max-w-[720px] border-x border-t border-zinc-800 bg-black p-4">
        <div className="flex items-center gap-3 rounded-2xl bg-zinc-900 p-3">
          <div className="min-w-0 flex-1 pl-1">
            <p className="text-2xl font-bold">${product.price.toFixed(2)}</p>
            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">{isDemoMode ? "Demo access available" : "Secure checkout coming soon"}</p>
          </div>
          {product.userId === user?.id ? <Button variant="secondary" disabled>Your offer</Button> : hasAccess ? <Button className="gap-2 bg-zinc-800 text-white" disabled><Check className="h-4 w-4" /> In purchases</Button> : <Button className="h-12 gap-2 rounded-xl bg-white px-5 font-bold text-black hover:bg-zinc-200" disabled={!isDemoMode || grantAccess.isPending} onClick={() => grantAccess.mutate()}><ShoppingCart className="h-4 w-4" /> {grantAccess.isPending ? "Adding..." : isDemoMode ? "Get access" : "Checkout soon"}</Button>}
        </div>
      </div>
    </div>
  );
}
