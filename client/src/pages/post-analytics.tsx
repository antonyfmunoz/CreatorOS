import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BarChart3, Heart, MessageSquare } from "lucide-react";
import { useParams, useLocation } from "wouter";
import { Post } from "@/types";
import { Button } from "@/components/ui/button";

export default function PostAnalyticsPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const postId = Number(id);
  const { data: post, isLoading } = useQuery<Post>({
    queryKey: ["/api/posts", postId],
    enabled: Number.isInteger(postId),
    queryFn: async () => {
      const response = await fetch(`/api/posts/${postId}`);
      if (!response.ok) throw new Error("Failed to load post performance");
      return response.json();
    },
  });
  const { data: commentData } = useQuery<{ count: number }>({
    queryKey: ["/api/posts", postId, "comment-count"],
    enabled: Number.isInteger(postId),
    queryFn: async () => {
      const response = await fetch(`/api/posts/${postId}/comment-count`);
      if (!response.ok) throw new Error("Failed to load comments");
      return response.json();
    },
  });

  return (
    <main className="min-h-dvh bg-black text-white">
      <header className="flex h-14 items-center border-b border-zinc-900 px-4">
        <Button variant="ghost" size="icon" className="-ml-2 mr-1 text-white hover:bg-zinc-900 hover:text-white" onClick={() => setLocation("/")} aria-label="Back to explore"><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="text-lg font-bold">Post performance</h1>
      </header>
      <section className="px-4 py-7">
        {isLoading ? <p className="text-sm text-zinc-500">Loading performance...</p> : post ? <>
          <div className="mb-7 flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-900"><BarChart3 className="h-5 w-5" /></div><div><p className="text-sm font-bold">{post.user.displayName}</p><p className="text-xs text-zinc-500">This post's recorded engagement</p></div></div>
          <div className="grid grid-cols-2 gap-3">
            <Metric icon={Heart} value={post.likes} label="Likes" />
            <Metric icon={MessageSquare} value={commentData?.count ?? 0} label="Comments" />
          </div>
          <p className="mt-6 text-sm leading-6 text-zinc-500">Reach and audience-retention metrics will be added with distribution analytics. The numbers above are live CreatorOS engagement records.</p>
        </> : <p className="text-sm text-zinc-500">This post is unavailable.</p>}
      </section>
    </main>
  );
}

function Metric({ icon: Icon, value, label }: { icon: typeof Heart; value: number; label: string }) {
  return <div className="rounded-2xl bg-zinc-900 p-5"><Icon className="h-5 w-5 text-zinc-400" /><p className="mt-5 text-3xl font-bold">{value}</p><p className="mt-1 text-sm text-zinc-500">{label}</p></div>;
}
