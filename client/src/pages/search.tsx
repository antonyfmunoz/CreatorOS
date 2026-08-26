import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Search as SearchIcon, X } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { HorizontalRail } from "@/components/ui/horizontal-rail";
import { Post, Product, User } from "@/types";

type SearchResults = { users: User[]; products: Product[]; posts: Post[] };
type SearchDiscovery = { suggestedCreators: User[]; recentProducts: Product[]; trendingProducts: Product[]; trendingTopics: Array<{ topic: string; postCount: number }> };

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
  const { data: discovery } = useQuery<SearchDiscovery>({ queryKey: ["/api/search/discovery"] });
  const normalizedQuery = query.trim().toLowerCase();
  const { data: searchResults, isFetching: isSearching, isError: searchFailed } = useQuery<SearchResults>({
    queryKey: ["/api/search", normalizedQuery],
    enabled: Boolean(normalizedQuery),
    queryFn: async () => {
      const response = await fetch(`/api/search?query=${encodeURIComponent(normalizedQuery)}`);
      if (!response.ok) throw new Error("Search is temporarily unavailable");
      return response.json();
    },
  });
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

  const matches = searchResults ?? { users: [], products: [], posts: [] };
  const recentCreators = (discovery?.suggestedCreators ?? []).filter((user) => !dismissedCreatorIds.includes(user.id));
  const recentProducts = discovery?.recentProducts ?? [];
  const trendingProducts = discovery?.trendingProducts ?? [];
  const trendingTopics = discovery?.trendingTopics ?? [];

  return (
    <main className="min-h-dvh bg-black text-white">
      <header className="sticky top-0 z-20 flex h-14 items-center border-b border-zinc-800 bg-black px-4">
        <Button variant="ghost" size="icon" className="-ml-2 mr-1 rounded-full text-zinc-400 hover:bg-zinc-900 hover:text-white" onClick={() => setLocation('/')} aria-label="Back to explore">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input type="search" aria-label="Search creators, offers, or tags" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onBlur={() => rememberSearch(query)} placeholder="Search creators, drops, or tags" className="h-10 rounded-full border-0 bg-zinc-900 pl-9 pr-10 text-white shadow-none placeholder:text-zinc-500" />
          {query && <button type="button" aria-label="Clear search" onMouseDown={(event) => event.preventDefault()} onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-zinc-500 hover:bg-zinc-800 hover:text-white"><X className="h-4 w-4" /></button>}
        </div>
      </header>

      {!normalizedQuery ? (
        <section className="space-y-8 px-4 py-7">
          <div>
            <div className="mb-3 flex items-center justify-between"><h1 className="text-2xl font-bold text-white">Recent searches</h1>{recentSearches.length > 0 && <button className="text-sm font-bold text-white" onClick={clearRecentSearches}>Clear all</button>}</div>
            {recentSearches.length > 0 ? <div className="mb-6 flex flex-wrap gap-2">{recentSearches.map((item) => <button key={item} className="rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-600 hover:text-white" onClick={() => setQuery(item)}>{item}</button>)}</div> : <p className="mb-6 text-sm text-zinc-500">Your searches will stay here on this device.</p>}
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-zinc-500">Suggested creators</h2>
            <div className="space-y-3">
              {recentCreators.map((user) => <div key={user.id} className="flex items-center gap-3"><Link href={`/profile/${user.id}`} className="flex min-w-0 flex-1 items-center gap-3"><Avatar className="h-12 w-12"><AvatarImage src={user.profileImageUrl || undefined} /><AvatarFallback>{user.displayName.charAt(0)}</AvatarFallback></Avatar><span className="truncate text-lg font-medium">{user.displayName}</span></Link><button className="rounded-full p-2 text-white hover:bg-zinc-900" aria-label={`Remove ${user.displayName} from recent searches`} onClick={() => setDismissedCreatorIds((ids) => [...ids, user.id])}><X className="h-6 w-6" /></button></div>)}
              {recentCreators.length === 0 && <p className="text-sm text-zinc-500">No recent creators.</p>}
            </div>
          </div>

          <div>
            <h2 className="mb-4 text-2xl font-bold text-white">New offers</h2>
            <HorizontalRail className="gap-3">
              {recentProducts.map((product) => <Link key={product.id} href={`/marketplace/product/${product.id}`} className="w-40 shrink-0"><div className="aspect-square overflow-hidden rounded-2xl bg-zinc-900">{product.imageUrl && <img src={product.imageUrl} alt={product.title} className="h-full w-full object-cover" />}</div><p className="mt-2 truncate text-base font-medium">{product.title}</p></Link>)}
            </HorizontalRail>
          </div>

          <div>
            <h2 className="mb-4 text-2xl font-bold text-white">Trending Products</h2>
            <div className="space-y-4">
              {trendingProducts.map((product) => <Link key={product.id} href={`/marketplace/product/${product.id}`} className="flex items-center gap-4"><div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-zinc-900">{product.imageUrl && <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />}</div><div className="min-w-0 flex-1"><p className="truncate text-lg font-medium">{product.title}</p><p className="truncate text-sm text-zinc-500">by {product.user.displayName}</p></div><div className="text-right"><p className="text-xl font-bold">${product.price.toFixed(0)}</p><p className="text-xs uppercase tracking-wider text-zinc-500">{product.reviewCount > 0 ? `${product.rating.toFixed(1)} · ${product.reviewCount} reviews` : "New"}</p></div></Link>)}
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-bold text-white">Trending topics</h2>
            <div className="space-y-1">
              {trendingTopics.map(({ topic, postCount }) => <button key={topic} className="block w-full rounded-xl px-2 py-3 text-left hover:bg-zinc-950" onClick={() => setQuery(`#${topic}`)}><span className="block text-xs text-zinc-500">{postCount} {postCount === 1 ? "post" : "posts"}</span><span className="mt-0.5 block text-sm font-bold text-white">#{topic}</span></button>)}
              {trendingTopics.length === 0 && <p className="rounded-xl border border-dashed border-zinc-800 px-4 py-5 text-sm leading-6 text-zinc-500">Topics will rank here as creatives publish posts with hashtags.</p>}
            </div>
          </div>
        </section>
      ) : (
        <div>
          {isSearching && <div role="status" className="border-b border-zinc-800 px-4 py-3 text-sm text-zinc-500">Searching CreativesOS…</div>}
          {searchFailed && <div role="alert" className="border-b border-red-950 bg-red-950/30 px-4 py-3 text-sm text-red-300">Search is temporarily unavailable. Try again in a moment.</div>}
        <div className={`divide-y divide-zinc-800 ${isSearching ? "opacity-60" : ""}`}>
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
          <section className="px-4 py-5">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-zinc-500">Posts</h2>
            <div className="space-y-3">
              {matches.posts.map((post) => <article key={post.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><Link href={`/profile/${post.user.id}`} className="flex items-center gap-2"><Avatar className="h-8 w-8"><AvatarImage src={post.user.profileImageUrl || undefined} /><AvatarFallback>{post.user.displayName.charAt(0)}</AvatarFallback></Avatar><span className="text-sm font-bold">{post.user.displayName}</span><span className="text-xs text-zinc-600">@{post.user.username}</span></Link><Link href={`/post/${post.id}`} onClick={() => rememberSearch(query)} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d9bf0]"><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-300">{post.content}</p>{post.imageUrl && <img src={post.imageUrl} alt="" className="mt-3 max-h-72 w-full rounded-xl object-cover" />}</Link></article>)}
              {matches.posts.length === 0 && <p className="text-sm text-zinc-500">No posts found.</p>}
            </div>
          </section>
        </div>
        </div>
      )}
    </main>
  );
}
