import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Package } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Product } from "@/types";

export default function ProductDetail() {
  const [, setLocation] = useLocation();
  const { id } = useParams<{ id: string }>();
  const productId = Number(id);
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

  if (isLoading) {
    return <Skeleton className="m-4 h-[420px]" />;
  }

  if (!product) {
    return (
      <div className="p-4 pb-20">
        <Button variant="ghost" onClick={() => setLocation("/marketplace")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to marketplace
        </Button>
        <p className="mt-8 text-muted-foreground">This product is no longer available.</p>
      </div>
    );
  }

  return (
    <div className="p-4 pb-24">
      <Button variant="ghost" className="mb-4" onClick={() => setLocation("/marketplace")}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Marketplace
      </Button>
      <Card className="overflow-hidden">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.title} className="aspect-square w-full object-cover" />
        ) : (
          <div className="flex aspect-square items-center justify-center bg-muted">
            <Package className="h-16 w-16 text-muted-foreground" />
          </div>
        )}
        <CardContent className="space-y-4 p-5">
          <div>
            <p className="text-sm text-muted-foreground">{product.category}</p>
            <h1 className="text-2xl font-bold">{product.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">Created by {product.user.displayName}</p>
          </div>
          <p className="whitespace-pre-wrap">{product.description}</p>
          <p className="text-2xl font-bold">${product.price.toFixed(2)}</p>
        </CardContent>
      </Card>
    </div>
  );
}
