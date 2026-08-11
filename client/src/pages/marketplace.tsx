import { useDeferredValue, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Bookmark, Search, ShoppingCart, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { HorizontalRail } from "@/components/ui/horizontal-rail";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notifications";
import { Community, Product, Purchase } from "@/types";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useCart } from "@/hooks/use-cart";

type Surface = "marketplace" | "purchases" | "saved";
type Category = "All" | "Courses" | "Communities" | "Digital Assets";
type Sort = "newest" | "price_low" | "price_high" | "top_rated";
type MarketplaceCatalog = {
  items: Product[];
  page: number;
  pageSize: number;
  total: number;
};

const categories: Category[] = [
  "All",
  "Courses",
  "Communities",
  "Digital Assets",
];

function productKind(product: Product): Exclude<Category, "All"> {
  const category = product.category.toLowerCase();
  if (category.includes("course")) return "Courses";
  if (category.includes("community") || category.includes("membership"))
    return "Communities";
  return "Digital Assets";
}

function ProductGrid({
  products,
  emptyMessage,
  savedProductIds = [],
  savingProductId,
  onSave,
}: {
  products: Product[];
  emptyMessage: string;
  savedProductIds?: number[];
  savingProductId?: number | null;
  onSave?: (productId: number, isSaved: boolean) => void;
}) {
  if (products.length === 0) {
    return (
      <p className="col-span-2 py-12 text-center text-sm text-zinc-500">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-6">
      {products.map((product) => {
        const isSaved = savedProductIds.includes(product.id);
        const isSaving = savingProductId === product.id;
        return (
          <article key={product.id} className="group relative min-w-0">
            <Link
              href={`/marketplace/product/${product.id}`}
              className="block rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1d9bf0]"
            >
              <div className="relative aspect-square overflow-hidden rounded-xl bg-zinc-100">
                {product.imageUrl ? (
                  <img
                    src={product.imageUrl}
                    alt={product.title}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-zinc-950 via-zinc-800 to-zinc-600" />
                )}
                <span className="absolute right-2 top-2 rounded-md bg-white/90 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-black backdrop-blur">
                  {productKind(product).slice(0, -1)}
                </span>
              </div>
              <h2 className="mt-2 truncate text-sm font-bold text-white">
                {product.title}
              </h2>
              <p className="truncate text-[11px] text-zinc-500">
                by {product.user.displayName}
              </p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-white">
                  ${product.price.toFixed(2)}
                </span>
                {product.reviewCount > 0 && (
                  <span className="text-[11px] text-zinc-500">
                    ★ {product.rating.toFixed(1)}
                  </span>
                )}
              </div>
            </Link>
            {onSave && (
              <button
                type="button"
                aria-label={
                  isSaved
                    ? `Remove ${product.title} from saved offers`
                    : `Save ${product.title}`
                }
                aria-pressed={isSaved}
                disabled={isSaving}
                onClick={() => onSave(product.id, isSaved)}
                className={`absolute left-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full border backdrop-blur transition-colors disabled:opacity-60 ${isSaved ? "border-[#1d9bf0] bg-[#1d9bf0] text-white" : "border-white/20 bg-black/60 text-white hover:bg-black/80"}`}
              >
                <Bookmark
                  className={`h-4 w-4 ${isSaved ? "fill-current" : ""}`}
                />
              </button>
            )}
          </article>
        );
      })}
    </div>
  );
}

function CommunityGrid({
  communities,
  emptyMessage,
}: {
  communities: Community[];
  emptyMessage: string;
}) {
  if (communities.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-zinc-500">{emptyMessage}</p>
    );
  }

  return (
    <div className="space-y-3">
      {communities.map((community) => (
        <Link
          key={community.id}
          href={`/communities/${community.id}`}
          className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4 transition-colors hover:bg-zinc-900"
        >
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${community.iconColor}`}
          >
            <Users className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-bold text-white">
              {community.name}
            </h2>
            <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-zinc-500">
              {community.description}
            </p>
          </div>
          <span className="shrink-0 text-xs font-bold text-white">View</span>
        </Link>
      ))}
    </div>
  );
}

export default function Marketplace() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { items: cartItems } = useCart();
  const queryClient = useQueryClient();
  const [surface, setSurface] = useState<Surface>("marketplace");
  const [category, setCategory] = useState<Category>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [page, setPage] = useState(1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const deferredSearch = useDeferredValue(searchQuery);
  const catalogCategory =
    category === "Courses"
      ? "courses"
      : category === "Digital Assets"
        ? "digital_assets"
        : "all";
  const catalogUrl = useMemo(() => {
    const params = new URLSearchParams({
      category: catalogCategory,
      sort,
      page: String(page),
      pageSize: "24",
    });
    if (deferredSearch.trim()) params.set("search", deferredSearch.trim());
    return `/api/marketplace/products?${params.toString()}`;
  }, [catalogCategory, deferredSearch, page, sort]);
  const { data: catalog, isLoading: isLoadingProducts } =
    useQuery<MarketplaceCatalog>({
      queryKey: [
        "/api/marketplace/products",
        catalogCategory,
        deferredSearch,
        sort,
        page,
      ],
      queryFn: async () => {
        const response = await fetch(catalogUrl);
        if (!response.ok) throw new Error("Failed to load marketplace");
        return response.json();
      },
    });
  const products = catalog?.items ?? [];
  const { data: purchases = [], isLoading: isLoadingPurchases } = useQuery<
    Purchase[]
  >({ queryKey: ["/api/purchases"] });
  const { data: savedProducts = [], isLoading: isLoadingSavedProducts } =
    useQuery<Product[]>({
      queryKey: ["/api/marketplace/saved-products"],
      enabled: Boolean(user),
      queryFn: async () =>
        (await apiRequest("GET", "/api/marketplace/saved-products")).json(),
    });
  const saveMutation = useMutation({
    mutationFn: async ({
      productId,
      isSaved,
    }: {
      productId: number;
      isSaved: boolean;
    }) => {
      await apiRequest(
        isSaved ? "DELETE" : "PUT",
        `/api/marketplace/products/${productId}/save`,
      );
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["/api/marketplace/saved-products"],
      }),
  });
  const { data: communities = [], isLoading: isLoadingCommunities } = useQuery<
    Community[]
  >({ queryKey: ["/api/communities"] });

  const purchasedProducts = purchases.map((purchase) => purchase.product);
  const savedProductIds = savedProducts.map((product) => product.id);
  const isLoading =
    surface === "marketplace"
      ? isLoadingProducts
      : surface === "purchases"
        ? isLoadingPurchases
        : isLoadingSavedProducts;
  const saveProduct = (productId: number, isSaved: boolean) => {
    if (!user) {
      setLocation("/auth/login");
      return;
    }
    saveMutation.mutate({ productId, isSaved });
  };
  const visibleCommunities = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return communities.filter(
      (community) =>
        !query ||
        [community.name, community.description].some((value) =>
          value.toLowerCase().includes(query),
        ),
    );
  }, [communities, searchQuery]);

  return (
    <main className="min-h-[calc(100dvh-3.5rem)] bg-black pb-20 text-white">
      <header className="sticky top-0 z-30 border-b border-zinc-800 bg-black">
        <div className="flex h-14 items-center justify-between px-4">
          <h1 className="text-xl font-bold tracking-tight">CreativesOS</h1>
          <div className="flex items-center">
            <Button
              size="icon"
              variant="ghost"
              className="rounded-full text-zinc-400 hover:bg-zinc-900 hover:text-white"
              onClick={() => searchInputRef.current?.focus()}
              aria-label="Search marketplace"
            >
              <Search className="h-6 w-6" />
            </Button>
            <NotificationBell />
            <Button
              size="icon"
              variant="ghost"
              className="relative rounded-full text-zinc-400 hover:bg-zinc-900 hover:text-white"
              onClick={() => setLocation("/cart")}
              aria-label="Open cart"
            >
              <ShoppingCart className="h-6 w-6" />
              {cartItems.length > 0 && (
                <span className="absolute right-0.5 top-0.5 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-[#1d9bf0] px-1 text-[9px] font-bold leading-none text-white">
                  {cartItems.length > 99 ? "99+" : cartItems.length}
                </span>
              )}
            </Button>
          </div>
        </div>
        <div className="flex border-b border-zinc-800">
          {(["marketplace", "purchases", "saved"] as const).map((tab) => (
            <button
              key={tab}
              className={`relative flex-1 py-3 text-sm font-bold capitalize ${surface === tab ? "text-white" : "text-zinc-500"}`}
              onClick={() => setSurface(tab)}
            >
              {tab === "saved" ? "Saved" : tab}
              {surface === tab && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#1d9bf0]" />
              )}
            </button>
          ))}
        </div>
      </header>

      {surface === "marketplace" && (
        <>
          <div className="border-b border-zinc-800 px-4 py-3">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <Input
                ref={searchInputRef}
                type="search"
                aria-label="Search marketplace"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="Search creators, offers, or topics"
                className="h-10 rounded-full border-0 bg-zinc-900 pl-9 text-white shadow-none placeholder:text-zinc-500"
              />
            </div>
            <HorizontalRail className="pb-1">
              <div className="flex w-max gap-2 pr-4">
                {categories.map((item) => (
                  <button
                    key={item}
                    onClick={() => {
                      setCategory(item);
                      setPage(1);
                    }}
                    className={`shrink-0 rounded-full px-5 py-1.5 text-xs font-bold ${category === item ? "bg-[#1d9bf0] text-white" : "bg-zinc-900 text-zinc-300"}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </HorizontalRail>
          </div>
          <section className="p-4">
            {category === "Communities" ? (
              isLoadingCommunities ? (
                <p className="py-12 text-center text-sm text-zinc-500">
                  Loading communities…
                </p>
              ) : (
                <CommunityGrid
                  communities={visibleCommunities}
                  emptyMessage="No communities match those filters yet."
                />
              )
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <p className="text-xs text-zinc-500">
                    {catalog ? `${catalog.total} offers` : ""}
                  </p>
                  <select
                    aria-label="Sort marketplace offers"
                    value={sort}
                    onChange={(event) => {
                      setSort(event.target.value as Sort);
                      setPage(1);
                    }}
                    className="h-8 rounded-full border border-zinc-800 bg-zinc-950 px-3 text-xs font-semibold text-zinc-300"
                  >
                    <option value="newest">Newest</option>
                    <option value="top_rated">Top rated</option>
                    <option value="price_low">Price: low to high</option>
                    <option value="price_high">Price: high to low</option>
                  </select>
                </div>
                {isLoading ? (
                  <p className="py-12 text-center text-sm text-zinc-500">
                    Loading marketplace…
                  </p>
                ) : (
                  <>
                    <ProductGrid
                      products={products}
                      savedProductIds={savedProductIds}
                      savingProductId={
                        saveMutation.isPending
                          ? saveMutation.variables?.productId
                          : null
                      }
                      onSave={saveProduct}
                      emptyMessage="No offers match those filters yet."
                    />
                    {catalog && page * catalog.pageSize < catalog.total && (
                      <Button
                        variant="outline"
                        className="mt-7 w-full border-zinc-700 bg-black text-white hover:bg-zinc-900"
                        onClick={() => setPage((current) => current + 1)}
                      >
                        Load more offers
                      </Button>
                    )}
                  </>
                )}
              </>
            )}
          </section>
        </>
      )}

      {surface === "purchases" && (
        <section className="p-4">
          <h2 className="mb-4 text-base font-bold text-white">
            Your purchases
          </h2>
          {isLoading ? (
            <p className="py-12 text-center text-sm text-zinc-500">
              Loading purchases…
            </p>
          ) : (
            <ProductGrid
              products={purchasedProducts}
              savedProductIds={savedProductIds}
              savingProductId={
                saveMutation.isPending
                  ? saveMutation.variables?.productId
                  : null
              }
              onSave={saveProduct}
              emptyMessage="Your purchased courses, communities, and digital assets will appear here."
            />
          )}
        </section>
      )}
      {surface === "saved" && (
        <section className="p-4">
          <h2 className="mb-4 text-base font-bold text-white">Saved offers</h2>
          {isLoading ? (
            <p className="py-12 text-center text-sm text-zinc-500">
              Loading saved offers...
            </p>
          ) : (
            <ProductGrid
              products={savedProducts}
              savedProductIds={savedProductIds}
              savingProductId={
                saveMutation.isPending
                  ? saveMutation.variables?.productId
                  : null
              }
              onSave={saveProduct}
              emptyMessage="Save offers to build a personal shortlist."
            />
          )}
        </section>
      )}
    </main>
  );
}
