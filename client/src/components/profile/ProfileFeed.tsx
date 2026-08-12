import { useQuery } from "@tanstack/react-query";
import { MessageSquare } from "lucide-react";
import { Post as PostType } from "@/types";
import Post from "@/components/explore/Post";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface ProfileFeedProps {
  userId: number;
  username: string;
}

// The public profile intentionally uses the same complete interaction row as
// Explore. This keeps likes, comments, reposts, analytics, and sharing
// consistent instead of presenting a second, partly-dead version of a post.
export default function ProfileFeed({ userId, username }: ProfileFeedProps) {
  const { data: posts, isLoading, error } = useQuery<PostType[]>({
    queryKey: ["/api/users/posts", userId],
    queryFn: async () => {
      const response = await fetch(`/api/users/${userId}/posts`);
      if (!response.ok) throw new Error("Failed to fetch posts");
      return response.json();
    },
  });

  if (isLoading) {
    return <ProfileFeedSkeleton />;
  }

  if (error) {
    return (
      <div className="mt-8 text-center">
        <p className="text-red-400">Could not load posts.</p>
        <Button variant="outline" className="mt-4 border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800 hover:text-white" onClick={() => window.location.reload()}>Try again</Button>
      </div>
    );
  }

  if (!posts?.length) {
    return (
      <div className="py-12 text-center text-white">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900"><MessageSquare className="h-6 w-6 text-zinc-500" /></div>
        <h3 className="text-lg font-medium">No posts yet</h3>
        <p className="mt-1 text-sm text-zinc-500">When @{username.toLowerCase()} shares posts, they will appear here.</p>
      </div>
    );
  }

  return <div className="mt-1 divide-y divide-zinc-800">{posts.map((post) => <Post key={post.id} post={post} surface="dark" />)}</div>;
}

function ProfileFeedSkeleton() {
  return (
    <div className="mt-4 space-y-4">
      {[1, 2].map((item) => (
        <Card key={item} className="overflow-hidden rounded-none border-x-0 border-t-0 border-zinc-800 bg-black text-white shadow-none">
          <CardContent className="p-4"><div className="mb-3 flex items-center"><Skeleton className="mr-3 h-10 w-10 rounded-full bg-zinc-800" /><div className="flex-1"><Skeleton className="mb-2 h-4 w-24 bg-zinc-800" /><Skeleton className="h-3 w-16 bg-zinc-800" /></div></div><Skeleton className="mb-4 h-20 w-full bg-zinc-800" /><div className="flex justify-between"><Skeleton className="h-6 w-16 bg-zinc-800" /><Skeleton className="h-6 w-16 bg-zinc-800" /><Skeleton className="h-6 w-16 bg-zinc-800" /></div></CardContent>
        </Card>
      ))}
    </div>
  );
}
