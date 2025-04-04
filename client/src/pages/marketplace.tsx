import { ShoppingCart, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import ProductList from "@/components/marketplace/ProductList";
import { Input } from "@/components/ui/input";
import { useState } from "react";

const Marketplace = () => {
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // Implement search functionality in a real app
    console.log("Searching for:", searchQuery);
  };

  return (
    <div className="px-4 pt-4 pb-20">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Marketplace</h1>
        <div className="flex space-x-3">
          <Button size="icon" variant="outline" className="bg-gray-100 rounded-full">
            <ShoppingCart className="h-5 w-5" />
          </Button>
          <Button size="icon" variant="outline" className="bg-gray-100 rounded-full">
            <Search className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            type="text"
            placeholder="Search products, creators, etc."
            className="pl-9 bg-gray-100 border-0"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </form>

      {/* Featured Products */}
      <ProductList title="Featured Products" section="featured" />

      {/* Best Sellers */}
      <ProductList title="Best Sellers" section="bestsellers" />

      {/* Recommended Products */}
      <ProductList title="Recommended For You" section="recommended" />
    </div>
  );
};

export default Marketplace;
