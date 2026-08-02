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
          {recentSearches.length > 0 && (
            <div>
              <div className="mb-3 flex items-center justify-between"><h1 className="text-sm font-bold text-white">Recent searches</h1><button className="text-xs font-bold text-[#1d9bf0]" onClick={clearRecentSearches}>Clear all</button></div>
              <div className="space-y-1">
                {recentSearches.map((item) => <div key={item} className="flex items-center rounded-xl px-2 py-2 hover:bg-zinc-950"><button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setQuery(item)}><SearchIcon className="h-4 w-4 text-zinc-500" /><span className="truncate text-sm text-white">{item}</span></button><button className="rounded-full p-1 text-zinc-500 hover:bg-zinc-900 hover:text-white" aria-label={`Remove ${item} from recent searches`} onClick={() => { const next = recentSearches.filter((value) => value !== item); setRecentSearches(next); localStorage.setItem("creatoros-recent-searches", JSON.stringify(next)); }}><X className="h-4 w-4" /></button></div>)}
              </div>
            </div>
          )}
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
