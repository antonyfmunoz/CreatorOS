import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Product } from "@/types";
import ProductCard from "./ProductCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const categories = ["All", "Courses", "eBooks", "Templates", "Software", "Coaching"];

const categoryApiValues: Record<string, string> = {
  Courses: "Course",
  eBooks: "eBook",
  Templates: "Template",
  Software: "Software",
  Coaching: "Coaching",
};

const ProductList = ({ title, section, searchQuery = "" }: { title: string; section: "featured" | "bestsellers" | "recommended"; searchQuery?: string }) => {
  const [activeCategory, setActiveCategory] = useState("All");
  
  const { data: products, isLoading } = useQuery<Product[]>({
    queryKey: ['/api/products', activeCategory !== "All" ? activeCategory : null],
    queryFn: async () => {
      const categoryValue = categoryApiValues[activeCategory];
      const category = categoryValue ? `?category=${encodeURIComponent(categoryValue)}` : "";
      const response = await fetch(`/api/products${category}`);
      if (!response.ok) {
        throw new Error("Failed to load products");
      }
      return response.json();
    },
  });

  // Filter products based on section
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const matchingProducts = products?.filter(product => {
    if (normalizedSearch && ![product.title, product.description, product.category, product.user?.displayName]
      .filter(Boolean)
      .some(value => value!.toLowerCase().includes(normalizedSearch))) {
      return false;
    }
    return true;
  });

  const filteredProducts = matchingProducts?.slice().sort((a, b) => {
    if (section === "featured") return (b.rating ?? 0) - (a.rating ?? 0);
    if (section === "bestsellers") return (b.reviewCount ?? 0) - (a.reviewCount ?? 0);
    return 0;
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
        
        <div className="horizontal-rail mb-6">
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
          {filteredProducts?.length === 0 && <p className="col-span-2 text-sm text-muted-foreground">No products found.</p>}
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
        {filteredProducts?.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
        {filteredProducts?.length === 0 && <p className="col-span-2 text-sm text-muted-foreground">No products found.</p>}
      </div>
    </div>
  );
};

export default ProductList;
