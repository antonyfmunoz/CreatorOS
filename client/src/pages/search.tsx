import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Search as SearchIcon, X } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Product, User } from "@/types";

export default function SearchPage() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const [dismissedCreatorIds, setDismissedCreatorIds] = useState<number[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("creatoros-recent-searches") ?? "[]");
    } catch {
      return [];
    }
  });
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: products = [] } = useQuery<Product[]>({ queryKey: ["/api/products"] });
  const normalizedQuery = query.trim().toLowerCase();
  const rememberSearch = (value: string) => {
    const normalized = value.trim();
    if (!normalized) return;
    const next = [normalized, ...recentSearches.filter((item) => item.toLowerCase() !== normalized.toLowerCase())].slice(0, 5);
    setRecentSearches(next);
    localStorage.setItem("creatoros-recent-searches", JSON.stringify(next));
  };
  const clearRecentSearches = () => {
    setRecentSearches([]);
    localStorage.removeItem("creatoros-recent-searches");
  };

  const matches = useMemo(() => ({
    users: users.filter((user) => !normalizedQuery || [user.username, user.displayName, user.bio ?? ""].some((value) => value.toLowerCase().includes(normalizedQuery))).slice(0, 8),
    products: products.filter((product) => !normalizedQuery || [product.title, product.description, product.category, product.user.displayName].some((value) => value.toLowerCase().includes(normalizedQuery))).slice(0, 8),
  }), [normalizedQuery, products, users]);
  const recentCreators = users.filter((user) => !dismissedCreatorIds.includes(user.id)).slice(0, 2);
  const recentProducts = products.slice(0, 3);
  const trendingProducts = products.slice(3, 7);

  return (
    <main className="min-h-dvh bg-black text-white">
      <header className="sticky top-0 z-20 flex h-14 items-center border-b border-zinc-800 bg-black px-4">
        <Button variant="ghost" size="icon" className="-ml-2 mr-1 rounded-full text-zinc-400 hover:bg-zinc-900 hover:text-white" onClick={() => setLocation('/')} aria-label="Back to explore">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onBlur={() => rememberSearch(query)} placeholder="Search creators, drops, or tags" className="h-10 rounded-full border-0 bg-zinc-900 pl-9 text-white shadow-none placeholder:text-zinc-500" />
        </div>
      </header>

      {!normalizedQuery ? (
        <section className="space-y-8 px-4 py-7">
          <div>
            <div className="mb-3 flex items-center justify-between"><h1 className="text-2xl font-bold text-white">Recent Searches</h1><button className="text-sm font-bold text-white" onClick={() => { clearRecentSearches(); setDismissedCreatorIds(users.map((user) => user.id)); }}>Clear all</button></div>
            <div className="space-y-3">
              {recentCreators.map((user) => <div key={user.id} className="flex items-center gap-3"><Link href={`/profile/${user.id}`} className="flex min-w-0 flex-1 items-center gap-3"><Avatar className="h-12 w-12"><AvatarImage src={user.profileImageUrl || undefined} /><AvatarFallback>{user.displayName.charAt(0)}</AvatarFallback></Avatar><span className="truncate text-lg font-medium">{user.displayName}</span></Link><button className="rounded-full p-2 text-white hover:bg-zinc-900" aria-label={`Remove ${user.displayName} from recent searches`} onClick={() => setDismissedCreatorIds((ids) => [...ids, user.id])}><X className="h-6 w-6" /></button></div>)}
              {recentCreators.length === 0 && <p className="text-sm text-zinc-500">No recent creators.</p>}
            </div>
          </div>

          <div>
            <h2 className="mb-4 text-2xl font-bold text-white">Recent Product Searches</h2>
            <div className="flex gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {recentProducts.map((product) => <Link key={product.id} href={`/marketplace/product/${product.id}`} className="w-40 shrink-0"><div className="aspect-square overflow-hidden rounded-2xl bg-zinc-900">{product.imageUrl && <img src={product.imageUrl} alt={product.title} className="h-full w-full object-cover" />}</div><p className="mt-2 truncate text-base font-medium">{product.title}</p></Link>)}
            </div>
          </div>

          <div>
            <h2 className="mb-4 text-2xl font-bold text-white">Trending Products</h2>
            <div className="space-y-4">
              {trendingProducts.map((product, index) => <Link key={product.id} href={`/marketplace/product/${product.id}`} className="flex items-center gap-4"><div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-zinc-900">{product.imageUrl && <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />}</div><div className="min-w-0 flex-1"><p className="truncate text-lg font-medium">{product.title}</p><p className="truncate text-sm text-zinc-500">by {product.user.displayName}</p></div><div className="text-right"><p className="text-xl font-bold">${product.price.toFixed(0)}</p><p className="text-xs uppercase tracking-wider text-zinc-500">{index === 0 ? "Hot" : index === 1 ? "Trending" : "New"}</p></div></Link>)}
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-bold text-white">Trending topics</h2>
            <div className="space-y-1">
              {["creators", "digital art", "passive income", "web development"].map((topic, index) => <button key={topic} className="block w-full rounded-xl px-2 py-3 text-left hover:bg-zinc-950" onClick={() => setQuery(topic)}><span className="block text-xs text-zinc-500">Trending · {index + 2}k posts</span><span className="mt-0.5 block text-sm font-bold text-white">#{topic.replace(" ", "")}</span></button>)}
            </div>
          </div>
        </section>
      ) : (
        <div className="divide-y divide-zinc-800">
          <section className="px-4 py-5">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-zinc-500">Creators</h2>
            <div className="space-y-3">
              {matches.users.map((user) => (
                <Link key={user.id} href={`/profile/${user.id}`} className="flex items-center gap-3" onClick={() => rememberSearch(query)}>
                  <Avatar className="h-11 w-11"><AvatarImage src={user.profileImageUrl || undefined} /><AvatarFallback>{user.displayName.charAt(0)}</AvatarFallback></Avatar>
                  <div className="min-w-0"><p className="truncate text-sm font-bold text-white">{user.displayName}</p><p className="truncate text-xs text-zinc-500">@{user.username}</p></div>
                </Link>
              ))}
              {matches.users.length === 0 && <p className="text-sm text-zinc-500">No creators found.</p>}
            </div>
          </section>
          <section className="px-4 py-5">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-zinc-500">Offers</h2>
            <div className="grid grid-cols-2 gap-4">
              {matches.products.map((product) => (
                <Link key={product.id} href={`/marketplace/product/${product.id}`} className="min-w-0" onClick={() => rememberSearch(query)}>
                  <div className="aspect-square overflow-hidden rounded-xl bg-zinc-900">{product.imageUrl && <img src={product.imageUrl} alt={product.title} className="h-full w-full object-cover" />}</div>
                  <p className="mt-2 truncate text-sm font-bold text-white">{product.title}</p><p className="truncate text-xs text-zinc-500">by {product.user.displayName}</p>
                </Link>
              ))}
              {matches.products.length === 0 && <p className="col-span-2 text-sm text-zinc-500">No offers found.</p>}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
