import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Post as PostType } from "@/types";
import Stories from "@/components/explore/Stories";
import Post from "@/components/explore/Post";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useMemo, useRef } from "react";
import { NotificationBell } from "@/components/notifications";
import { MessageButton } from "@/components/messages";
import { useAppStore } from "@/lib/stores";
import { useToast } from "@/hooks/use-toast";

const Explore = () => {
  const queryClient = useQueryClient();
  const { targetPostId, clearTargetPost } = useAppStore();
  const { toast } = useToast();
  
  // Enable caching of posts to prevent reordering on refresh
  const { data: posts, isLoading } = useQuery<PostType[]>({
    queryKey: ["/api/posts"],
    // Set a longer staleTime to prevent unnecessary refetching
    staleTime: 1000 * 60 * 5, // 5 minutes
    // Make sure posts are stable even on refresh
    select: (data) => {
      if (!data) return [];
      // Create a copy and sort by ID to ensure consistent order
      return [...data].sort((a, b) => b.id - a.id);
    },
  });
  
  // Effect to scroll to targeted post when posts are loaded
  useEffect(() => {
    if (!isLoading && posts && targetPostId) {
      // Wait a bit longer to ensure the DOM is fully updated
      setTimeout(() => {
        const postElement = document.getElementById(`post-${targetPostId}`);
        if (postElement) {
          // Get the top navbar and stories container
          const navbarElement = document.querySelector('.flex.justify-between.items-center.mb-6');
          const storiesElement = document.querySelector('.stories-container');
          
          // Calculate the offset (navbar + stories + some padding)
          let offset = 20; // Start with some minimal padding
          if (navbarElement) {
            offset += navbarElement.clientHeight;
          }
          if (storiesElement) {
            offset += storiesElement.clientHeight;
          }
          
          // Directly position the post at the top of the feed area
          const postPosition = postElement.getBoundingClientRect().top + window.pageYOffset;
          window.scrollTo({
            top: postPosition - offset - 20, // Add extra padding to ensure it's visible
            behavior: 'smooth'
          });
          
          // Add a highlight effect
          postElement.classList.add('highlighted-post');
          
          // Log positioned values for debugging
          console.log('Post positioned with offset:', offset, 'final position:', postPosition - offset);
          
          // Remove highlight after animation completes
          setTimeout(() => {
            postElement.classList.remove('highlighted-post');
            // Clear the target post ID after scrolling to it
            clearTargetPost();
          }, 2000);
        } else {
          // If post not found, just clear the target post ID without showing a toast
          // This removes the toast notification when a post can't be found
          console.log('Post not found in feed:', targetPostId);
          clearTargetPost();
        }
      }, 500); // Increased delay to ensure DOM is ready
    }
  }, [isLoading, posts, targetPostId, clearTargetPost]);

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
          <NotificationBell />
          <MessageButton />
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
