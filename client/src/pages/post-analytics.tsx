import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BarChart3, Bookmark, Eye, Heart, MessageSquare, Repeat2, type LucideIcon } from "lucide-react";
import { useParams, useLocation } from "wouter";
import { Post } from "@/types";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

export default function PostAnalyticsPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
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
  const { data: analytics } = useQuery<{ views: number; likes: number; comments: number; saves: number; reposts: number; interactions: number }>({
    queryKey: ["/api/posts", postId, "analytics"],
    enabled: Number.isInteger(postId) && post?.userId === user?.id,
    queryFn: async () => {
      const response = await fetch(`/api/posts/${postId}/analytics`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load post analytics");
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
        {isLoading ? <p className="text-sm text-zinc-500">Loading performance...</p> : post?.userId !== user?.id ? <p className="text-sm text-zinc-500">Only the creator can view this post’s performance.</p> : post ? <>
          <div className="mb-7 flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-900"><BarChart3 className="h-5 w-5" /></div><div><p className="text-sm font-bold">{post.user.displayName}</p><p className="text-xs text-zinc-500">This post's recorded engagement</p></div></div>
          <div className="grid grid-cols-2 gap-3">
            <Metric icon={BarChart3} value={analytics?.interactions ?? 0} label="Interactions" emphasis />
            <Metric icon={Eye} value={analytics?.views ?? 0} label="Reach" />
            <Metric icon={Heart} value={analytics?.likes ?? 0} label="Likes" />
            <Metric icon={MessageSquare} value={analytics?.comments ?? 0} label="Comments" />
            <Metric icon={Repeat2} value={analytics?.reposts ?? 0} label="Reposts" />
            <Metric icon={Bookmark} value={analytics?.saves ?? 0} label="Saves" />
          </div>
          <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <h2 className="text-sm font-bold">Performance notes</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-500">Reach is the number of signed-in accounts that recorded a view. Interactions combine likes, comments, saves, and reposts. Retention and cross-network delivery will join this view once those providers are connected.</p>
          </section>
        </> : <p className="text-sm text-zinc-500">This post is unavailable.</p>}
      </section>
    </main>
  );
}

function Metric({ icon: Icon, value, label, emphasis = false }: { icon: LucideIcon; value: number; label: string; emphasis?: boolean }) {
  return <div className={`rounded-2xl p-5 ${emphasis ? "bg-[#1d9bf0] text-white" : "bg-zinc-900"}`}><Icon className={`h-5 w-5 ${emphasis ? "text-white" : "text-zinc-400"}`} /><p className="mt-5 text-3xl font-bold">{value}</p><p className={`mt-1 text-sm ${emphasis ? "text-white/75" : "text-zinc-500"}`}>{label}</p></div>;
}
