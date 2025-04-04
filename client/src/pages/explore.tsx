import { useQuery } from "@tanstack/react-query";
import { Post as PostType } from "@/types";
import { Bell, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import Stories from "@/components/explore/Stories";
import Post from "@/components/explore/Post";
import { Skeleton } from "@/components/ui/skeleton";
import { useMemo } from "react";

const Explore = () => {
  const { data: posts, isLoading } = useQuery<PostType[]>({
    queryKey: ["/api/posts"],
  });

  // Sort posts by ID in descending order to maintain consistent position
  // This ensures posts don't jump around when comments are added/removed
  const sortedPosts = useMemo(() => {
    if (!posts) return [];
    // Create a copy of the posts array to avoid modifying the original
    return [...posts].sort((a, b) => b.id - a.id);
  }, [posts]);

  return (
    <div className="px-4 pt-4 pb-20">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">CreatorOS</h1>
        <div className="flex space-x-3">
          <Button size="icon" variant="outline" className="bg-gray-100 rounded-full">
            <Bell className="h-5 w-5" />
          </Button>
          <Button size="icon" variant="outline" className="bg-gray-100 rounded-full">
            <MessageSquare className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Stories */}
      <Stories />

      {/* Content Feed */}
      <div className="space-y-6">
        {isLoading ? (
          // Loading skeletons
          Array(3)
            .fill(0)
            .map((_, i) => (
              <div key={i} className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="p-4">
                  <div className="flex items-center mb-3">
                    <Skeleton className="w-10 h-10 rounded-full mr-3" />
                    <div>
                      <Skeleton className="h-4 w-24 mb-2" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                  </div>
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-2/3 mb-4" />
                  <Skeleton className="w-full h-64 mb-4" />
                  <div className="flex items-center justify-between">
                    <div className="flex space-x-4">
                      <Skeleton className="h-8 w-16" />
                      <Skeleton className="h-8 w-16" />
                    </div>
                    <Skeleton className="h-8 w-16" />
                  </div>
                </div>
              </div>
            ))
        ) : (
          sortedPosts.map((post) => <Post key={post.id} post={post} />)
        )}

        {posts?.length === 0 && !isLoading && (
          <div className="text-center py-10">
            <h3 className="text-xl font-medium mb-2">No posts yet</h3>
            <p className="text-gray-500">Start following creators to see posts in your feed</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Explore;
