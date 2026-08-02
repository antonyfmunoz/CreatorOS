import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Search, ShoppingCart } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notifications";
import { Product, Purchase } from "@/types";

type Surface = "marketplace" | "purchases";
type Category = "All" | "Courses" | "Communities" | "Digital Assets";

const categories: Category[] = ["All", "Courses", "Communities", "Digital Assets"];

function productKind(product: Product): Exclude<Category, "All"> {
  const category = product.category.toLowerCase();
  if (category.includes("course")) return "Courses";
  if (category.includes("community") || category.includes("membership")) return "Communities";
  return "Digital Assets";
}

function ProductGrid({ products, emptyMessage }: { products: Product[]; emptyMessage: string }) {
  if (products.length === 0) {
    return <p className="col-span-2 py-12 text-center text-sm text-zinc-500">{emptyMessage}</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-6">
      {products.map((product) => (
        <Link key={product.id} href={`/marketplace/product/${product.id}`} className="group min-w-0">
          <div className="relative aspect-square overflow-hidden rounded-xl bg-zinc-100">
            {product.imageUrl ? (
              <img src={product.imageUrl} alt={product.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-zinc-950 via-zinc-800 to-zinc-600" />
            )}
            <span className="absolute right-2 top-2 rounded-md bg-white/90 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-black backdrop-blur">
              {productKind(product).slice(0, -1)}
            </span>
          </div>
          <h2 className="mt-2 truncate text-sm font-bold text-black">{product.title}</h2>
          <p className="truncate text-[11px] text-zinc-500">by {product.user.displayName}</p>
        </Link>
      ))}
    </div>
  );
}

export default function Marketplace() {
  const [surface, setSurface] = useState<Surface>("marketplace");
  const [category, setCategory] = useState<Category>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { data: products = [], isLoading: isLoadingProducts } = useQuery<Product[]>({ queryKey: ["/api/products"] });
  const { data: purchases = [], isLoading: isLoadingPurchases } = useQuery<Purchase[]>({ queryKey: ["/api/purchases"] });

  const visibleProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return products.filter((product) => {
      const matchesCategory = category === "All" || productKind(product) === category;
      const matchesQuery = !query || [product.title, product.description, product.category, product.user.displayName]
        .some((value) => value.toLowerCase().includes(query));
      return matchesCategory && matchesQuery;
    });
  }, [category, products, searchQuery]);

  const purchasedProducts = purchases.map((purchase) => purchase.product);
  const isLoading = surface === "marketplace" ? isLoadingProducts : isLoadingPurchases;

  return (
    <main className="min-h-[calc(100dvh-3.5rem)] bg-white pb-20 text-black">
      <header className="sticky top-0 z-30 bg-white">
        <div className="flex h-14 items-center justify-between px-4">
          <h1 className="text-xl font-bold tracking-tight">CreatorOS</h1>
          <div className="flex items-center">
            <Button size="icon" variant="ghost" className="rounded-full" onClick={() => searchInputRef.current?.focus()} aria-label="Search marketplace">
              <Search className="h-6 w-6" />
            </Button>
            <NotificationBell />
            <Button size="icon" variant="ghost" className="rounded-full" onClick={() => setSurface("purchases")} aria-label="Open purchases">
              <ShoppingCart className="h-6 w-6" />
            </Button>
          </div>
        </div>
        <div className="flex border-b border-zinc-100">
          {(["marketplace", "purchases"] as const).map((tab) => (
            <button
              key={tab}
              className={`relative flex-1 py-3 text-sm font-bold capitalize ${surface === tab ? "text-black" : "text-zinc-400"}`}
              onClick={() => setSurface(tab)}
            >
              {tab}
              {surface === tab && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-black" />}
            </button>
          ))}
        </div>
      </header>

      {surface === "marketplace" && (
        <>
          <div className="border-b border-zinc-50 px-4 py-3">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <Input ref={searchInputRef} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search creators, offers, or topics" className="h-10 rounded-full border-0 bg-zinc-100 pl-9 shadow-none" />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {categories.map((item) => (
                <button key={item} onClick={() => setCategory(item)} className={`shrink-0 rounded-full px-5 py-1.5 text-xs font-bold ${category === item ? "bg-black text-white" : "bg-zinc-100 text-black"}`}>
                  {item}
                </button>
              ))}
            </div>
          </div>
          <section className="p-4">
            {isLoading ? <p className="py-12 text-center text-sm text-zinc-500">Loading marketplace…</p> : <ProductGrid products={visibleProducts} emptyMessage="No offers match those filters yet." />}
          </section>
        </>
      )}

      {surface === "purchases" && (
        <section className="p-4">
          <h2 className="mb-4 text-base font-bold">Your purchases</h2>
          {isLoading ? <p className="py-12 text-center text-sm text-zinc-500">Loading purchases…</p> : <ProductGrid products={purchasedProducts} emptyMessage="Your purchased courses, communities, and digital assets will appear here." />}
        </section>
      )}
    </main>
  );
}
