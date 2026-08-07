import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileQuestion } from "lucide-react";
import { useLocation, useParams } from "wouter";
import Post from "@/components/explore/Post";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Post as PostType } from "@/types";

export default function PostDetailPage() {
  const [, setLocation] = useLocation();
  const params = useParams<{ id: string }>();
  const postId = Number(params.id);
  const post = useQuery<PostType>({
    queryKey: ["/api/posts", postId],
    enabled: Number.isInteger(postId) && postId > 0,
    queryFn: async () => {
      const response = await fetch(`/api/posts/${postId}`);
      if (response.status === 404) throw new Error("Post not found");
      if (!response.ok) throw new Error("Post could not be loaded");
      return response.json();
    },
    retry: false,
  });

  return (
    <main className="min-h-dvh bg-black pb-20 text-white">
      <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-zinc-800 bg-black px-4">
        <Button variant="ghost" size="icon" className="-ml-2 rounded-full text-zinc-300 hover:bg-zinc-900 hover:text-white" aria-label="Back to feed" onClick={() => setLocation("/")}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="text-lg font-bold">Post</h1>
      </header>

      {post.isLoading ? <section className="space-y-3 p-4" aria-label="Loading post"><div className="flex gap-3"><Skeleton className="h-11 w-11 rounded-full bg-zinc-900" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-36 bg-zinc-900" /><Skeleton className="h-3 w-24 bg-zinc-900" /></div></div><Skeleton className="h-20 w-full bg-zinc-900" /><Skeleton className="aspect-video w-full bg-zinc-900" /></section> : post.isError || !post.data ? <section className="mx-auto flex min-h-[55dvh] max-w-sm flex-col items-center justify-center px-6 text-center"><span className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-900"><FileQuestion className="h-7 w-7 text-zinc-400" /></span><h2 className="mt-5 text-xl font-bold">Post unavailable</h2><p className="mt-2 text-sm leading-6 text-zinc-500">This post may have been removed, or the shared link is no longer valid.</p><Button className="mt-6 rounded-xl bg-white text-black hover:bg-zinc-200" onClick={() => setLocation("/")}>Return to feed</Button></section> : <Post post={post.data} surface="dark" onDeleted={() => setLocation("/profile")} />}
    </main>
  );
}
