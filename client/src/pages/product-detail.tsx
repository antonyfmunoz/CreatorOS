import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, Package, ShoppingCart } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Product } from "@/types";
import { Purchase } from "@/types";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function ProductDetail() {
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();
  const productId = Number(id);
  const isDemoMode = import.meta.env.VITE_CREATOROS_DEMO_MODE === "true";
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: product, isLoading } = useQuery<Product>({
    queryKey: ["/api/products", productId],
    enabled: Number.isInteger(productId) && productId > 0,
    queryFn: async () => {
      const response = await fetch(`/api/products/${productId}`);
      if (!response.ok) {
        throw new Error("Failed to load product");
      }
      return response.json();
    },
  });
  const { data: purchases = [] } = useQuery<Purchase[]>({ queryKey: ["/api/purchases"] });
  const hasAccess = purchases.some((purchase) => purchase.productId === productId && purchase.status === "active");
  const grantAccess = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/products/${productId}/demo-access`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchases"] });
      toast({ title: "Access granted", description: "This offer is now in your Purchases library." });
    },
    onError: (error) => {
      toast({ title: "Unable to grant access", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return <Skeleton className="m-4 h-[420px] bg-zinc-900" />;
  }

  if (!product) {
    return (
      <div className="min-h-dvh bg-black p-4 pb-20 text-white">
        <Button variant="ghost" className="text-zinc-400 hover:bg-zinc-900 hover:text-white" onClick={() => setLocation("/marketplace")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to marketplace
        </Button>
        <p className="mt-8 text-muted-foreground">This product is no longer available.</p>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100dvh-3.5rem)] bg-black p-4 pb-28 text-white">
      <Button variant="ghost" className="mb-4 text-zinc-400 hover:bg-zinc-900 hover:text-white" onClick={() => setLocation("/marketplace")}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Marketplace
      </Button>
      <Card className="overflow-hidden border-zinc-800 bg-zinc-950 text-white shadow-none">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.title} className="aspect-square w-full object-cover" />
        ) : (
          <div className="flex aspect-square items-center justify-center bg-zinc-900">
            <Package className="h-16 w-16 text-muted-foreground" />
          </div>
        )}
        <CardContent className="space-y-4 p-5 text-white">
          <div>
            <p className="text-sm text-muted-foreground">{product.category}</p>
            <h1 className="text-2xl font-bold">{product.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Created by {product.user.displayName}</p>
          </div>
          <p className="whitespace-pre-wrap">{product.description}</p>
          <p className="text-2xl font-bold">${product.price.toFixed(2)}</p>
        </CardContent>
      </Card>
      <div className="fixed inset-x-0 bottom-14 z-40 border-t border-zinc-800 bg-black p-4">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-lg font-bold">${product.price.toFixed(2)}</p>
            <p className="text-xs text-zinc-500">{isDemoMode ? "Demo checkout grants local access" : "Secure checkout is coming next"}</p>
          </div>
          {product.userId === user?.id ? (
            <Button variant="secondary" disabled>Your offer</Button>
          ) : hasAccess ? (
            <Button className="gap-2 bg-zinc-800 text-white" disabled><Check className="h-4 w-4" /> In purchases</Button>
          ) : (
            <Button className="gap-2 bg-[#1d9bf0] text-white hover:bg-[#1d9bf0]/90" disabled={!isDemoMode || grantAccess.isPending} onClick={() => grantAccess.mutate()}>
              <ShoppingCart className="h-4 w-4" /> {grantAccess.isPending ? "Adding…" : isDemoMode ? "Get demo access" : "Checkout soon"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
