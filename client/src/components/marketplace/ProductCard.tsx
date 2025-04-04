import { Card, CardContent } from "@/components/ui/card";
import { Star } from "lucide-react";
import { Product } from "@/types";
import { Link } from "wouter";

interface ProductCardProps {
  product: Product;
  variant?: "grid" | "row";
  className?: string;
}

const ProductCard = ({ product, variant = "grid", className = "" }: ProductCardProps) => {
  if (variant === "row") {
    return (
      <Card className={`overflow-hidden flex ${className}`}>
        <img
          src={product.imageUrl}
          alt={product.title}
          className="w-24 h-24 object-cover"
        />
        <CardContent className="p-3 flex-1">
          <h3 className="font-medium text-sm">{product.title}</h3>
          <p className="text-xs text-gray-500 mb-2">By {product.user.displayName}</p>
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm">${product.price.toFixed(2)}</span>
            <div className="flex items-center text-xs text-yellow-500">
              <Star className="h-4 w-4 fill-yellow-500" />
              <span className="ml-1">{product.rating.toFixed(1)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Link href={`/marketplace/product/${product.id}`}>
      <Card className={`overflow-hidden cursor-pointer ${className}`}>
        <img
          src={product.imageUrl}
          alt={product.title}
          className="w-full h-32 object-cover"
        />
        <CardContent className="p-3">
          <h3 className="font-medium text-sm">{product.title}</h3>
          <p className="text-xs text-gray-500 mb-2">By {product.user.displayName}</p>
          <div className="flex items-center justify-between">
            <span className="font-bold text-sm">${product.price.toFixed(2)}</span>
            <div className="flex items-center text-xs text-yellow-500">
              <Star className="h-4 w-4 fill-yellow-500" />
              <span className="ml-1">{product.rating.toFixed(1)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
};

export default ProductCard;
