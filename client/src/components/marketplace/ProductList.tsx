import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Product } from "@/types";
import ProductCard from "./ProductCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const categories = ["All", "Courses", "eBooks", "Templates", "Software", "Coaching"];

const ProductList = ({ title, section }: { title: string; section: "featured" | "bestsellers" | "recommended" }) => {
  const [activeCategory, setActiveCategory] = useState("All");
  
  const { data: products, isLoading } = useQuery<Product[]>({
    queryKey: ['/api/products', activeCategory !== "All" ? activeCategory : null],
  });

  // Filter products based on section
  const filteredProducts = products?.filter(product => {
    if (section === "featured") {
      return product.rating >= 4.5;
    } else if (section === "bestsellers") {
      return product.reviewCount > 10;
    } else {
      return true; // Recommended - show all remaining
    }
  });

  if (isLoading) {
    return (
      <div>
        <h2 className="text-xl font-semibold mb-4">{title}</h2>
        {section === "featured" && (
          <div className="grid grid-cols-2 gap-4 mb-8">
            {Array(2).fill(0).map((_, i) => (
              <div key={i} className="bg-white rounded-xl shadow-sm overflow-hidden">
                <Skeleton className="w-full h-32" />
                <div className="p-3">
                  <Skeleton className="w-2/3 h-4 mb-2" />
                  <Skeleton className="w-1/2 h-3 mb-2" />
                  <div className="flex justify-between">
                    <Skeleton className="w-1/4 h-4" />
                    <Skeleton className="w-1/4 h-4" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {section === "bestsellers" && (
          <div className="space-y-4 mb-8">
            {Array(3).fill(0).map((_, i) => (
              <div key={i} className="bg-white rounded-xl shadow-sm overflow-hidden flex">
                <Skeleton className="w-24 h-24" />
                <div className="p-3 flex-1">
                  <Skeleton className="w-2/3 h-4 mb-2" />
                  <Skeleton className="w-1/2 h-3 mb-2" />
                  <div className="flex justify-between">
                    <Skeleton className="w-1/4 h-4" />
                    <Skeleton className="w-1/4 h-4" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {section === "recommended" && (
          <div className="grid grid-cols-2 gap-4">
            {Array(2).fill(0).map((_, i) => (
              <div key={i} className="bg-white rounded-xl shadow-sm overflow-hidden">
                <Skeleton className="w-full h-32" />
                <div className="p-3">
                  <Skeleton className="w-2/3 h-4 mb-2" />
                  <Skeleton className="w-1/2 h-3 mb-2" />
                  <div className="flex justify-between">
                    <Skeleton className="w-1/4 h-4" />
                    <Skeleton className="w-1/4 h-4" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (section === "featured" && categories.length > 0) {
    return (
      <div>
        <h2 className="text-xl font-semibold mb-4">{title}</h2>
        
        <div className="overflow-x-auto scrollbar-hide mb-6">
          <div className="flex space-x-4">
            {categories.map((category) => (
              <Button
                key={category}
                variant={activeCategory === category ? "default" : "outline"}
                className="px-4 py-2 rounded-full text-sm font-medium"
                onClick={() => setActiveCategory(category)}
              >
                {category}
              </Button>
            ))}
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4 mb-8">
          {filteredProducts?.slice(0, 4).map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    );
  }
  
  if (section === "bestsellers") {
    return (
      <div>
        <h2 className="text-xl font-semibold mb-4">{title}</h2>
        <div className="space-y-4 mb-8">
          {filteredProducts?.slice(0, 3).map((product) => (
            <ProductCard key={product.id} product={product} variant="row" />
          ))}
        </div>
      </div>
    );
  }
  
  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">{title}</h2>
      <div className="grid grid-cols-2 gap-4">
        {filteredProducts?.slice(0, 2).map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
};

export default ProductList;
