import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Search as SearchIcon } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Product, User } from "@/types";

export default function SearchPage() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState("");
  const { data: users = [] } = useQuery<User[]>({ queryKey: ["/api/users"] });
  const { data: products = [] } = useQuery<Product[]>({ queryKey: ["/api/products"] });
  const normalizedQuery = query.trim().toLowerCase();

  const matches = useMemo(() => ({
    users: users.filter((user) => !normalizedQuery || [user.username, user.displayName, user.bio ?? ""].some((value) => value.toLowerCase().includes(normalizedQuery))).slice(0, 8),
    products: products.filter((product) => !normalizedQuery || [product.title, product.description, product.category, product.user.displayName].some((value) => value.toLowerCase().includes(normalizedQuery))).slice(0, 8),
  }), [normalizedQuery, products, users]);

  return (
    <main className="min-h-[calc(100dvh-3.5rem)] bg-white pb-20 text-black">
      <header className="sticky top-0 z-20 flex h-14 items-center border-b border-zinc-100 bg-white px-4">
        <Button variant="ghost" size="icon" className="-ml-2 mr-1 rounded-full" onClick={() => setLocation('/')} aria-label="Back to explore">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="relative flex-1">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search creators, drops, or tags" className="h-10 rounded-full border-0 bg-zinc-100 pl-9 shadow-none" />
        </div>
      </header>

      {!normalizedQuery ? (
        <section className="px-4 py-8">
          <h1 className="text-lg font-bold">Discover CreatorOS</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-500">Search creators and their courses, communities, and digital assets.</p>
        </section>
      ) : (
        <div className="divide-y divide-zinc-100">
          <section className="px-4 py-5">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-zinc-500">Creators</h2>
            <div className="space-y-3">
              {matches.users.map((user) => (
                <Link key={user.id} href={`/profile/${user.id}`} className="flex items-center gap-3">
                  <Avatar className="h-11 w-11"><AvatarImage src={user.profileImageUrl || undefined} /><AvatarFallback>{user.displayName.charAt(0)}</AvatarFallback></Avatar>
                  <div className="min-w-0"><p className="truncate text-sm font-bold">{user.displayName}</p><p className="truncate text-xs text-zinc-500">@{user.username}</p></div>
                </Link>
              ))}
              {matches.users.length === 0 && <p className="text-sm text-zinc-500">No creators found.</p>}
            </div>
          </section>
          <section className="px-4 py-5">
            <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-zinc-500">Offers</h2>
            <div className="grid grid-cols-2 gap-4">
              {matches.products.map((product) => (
                <Link key={product.id} href={`/marketplace/product/${product.id}`} className="min-w-0">
                  <div className="aspect-square overflow-hidden rounded-xl bg-zinc-100">{product.imageUrl && <img src={product.imageUrl} alt={product.title} className="h-full w-full object-cover" />}</div>
                  <p className="mt-2 truncate text-sm font-bold">{product.title}</p><p className="truncate text-xs text-zinc-500">by {product.user.displayName}</p>
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
