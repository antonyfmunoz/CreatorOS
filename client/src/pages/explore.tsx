import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Post as PostType } from "@/types";
import Stories from "@/components/explore/Stories";
import Post from "@/components/explore/Post";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useMemo, useRef, useState } from "react";
import { NotificationBell } from "@/components/notifications";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocation, useSearch } from "wouter";
import { useAppStore } from "@/lib/stores";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

// Import new feed components
import { Tabs, TabType } from "@/components/feed/Tabs";
import { ContentFilterType } from "@/components/feed/FilterDropdown";
import { StoriesBar } from "@/components/feed/StoriesBar";
import { parseStoryId } from "@/lib/story-links";

const Explore = () => {
  const queryClient = useQueryClient();
  const { targetPostId, clearTargetPost } = useAppStore();
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const initialStoryId = parseStoryId(search);

  // Feed Tab State
  const [activeTab, setActiveTab] = useState<TabType>("forYou");

  // The approved Explore surface is intentionally unfiltered; discovery filters
  // live in Marketplace so the feed keeps its compact Stitch layout.
  const [contentFilter] = useState<ContentFilterType>("all");

  // Enable caching of posts to prevent reordering on refresh
  const { data: posts, isLoading } = useQuery<PostType[]>({
    queryKey: ["/api/discovery/feed", activeTab, contentFilter],
    queryFn: async () => {
      const mode = activeTab === "following" ? "following" : "recommended";
      const response = await fetch(`/api/discovery/feed?mode=${mode}&limit=50`);
      if (!response.ok) throw new Error("Failed to load the discovery feed");
      const payload = (await response.json()) as { items: PostType[] };
      return payload.items;
    },
    // Set a longer staleTime to prevent unnecessary refetching
    staleTime: 1000 * 60 * 5, // 5 minutes
    // Make sure posts are stable even on refresh
    select: (data) => {
      if (!data) return [];
      // Filter posts based on selected content type
      let filteredPosts = [...data];

      if (contentFilter === "photo") {
        filteredPosts = filteredPosts.filter((post) => post.imageUrl);
      } else if (contentFilter === "audio") {
        filteredPosts = filteredPosts.filter((post) => post.audioUrl);
      } else if (contentFilter === "video") {
        filteredPosts = filteredPosts.filter((post) => post.videoUrl);
      } else if (contentFilter === "text") {
        filteredPosts = filteredPosts.filter(
          (post) => !post.imageUrl && !post.audioUrl && !post.videoUrl,
        );
      }

      return filteredPosts;
    },
  });

  // Effect to scroll to targeted post when posts are loaded
  useEffect(() => {
    if (!isLoading && posts && targetPostId) {
      // Wait a bit longer to ensure the DOM is fully updated
      setTimeout(() => {
        const postElement = document.getElementById(`post-${targetPostId}`);
        if (postElement) {
          // Get the top navbar and tabs/stories container
          const headerElement = document.querySelector(".sticky.top-0");
          const tabsElement = document.querySelector(".feed-tabs");
          const storiesElement = document.querySelector(".stories-container");

          // Calculate the offset (header + tabs + stories + padding)
          let offset = 20; // Start with some minimal padding
          if (headerElement) {
            offset += headerElement.clientHeight;
          }
          if (tabsElement) {
            offset += tabsElement.clientHeight;
          }
          if (storiesElement) {
            offset += storiesElement.clientHeight;
          }

          // Directly position the post at the top of the feed area
          const postPosition =
            postElement.getBoundingClientRect().top + window.pageYOffset;
          window.scrollTo({
            top: postPosition - offset - 20, // Add extra padding to ensure it's visible
            behavior: "smooth",
          });

          // Add a highlight effect
          postElement.classList.add("highlighted-post");

          // Remove highlight after animation completes
          setTimeout(() => {
            postElement.classList.remove("highlighted-post");
            // Clear the target post ID after scrolling to it
            clearTargetPost();
          }, 2000);
        } else {
          // If post not found, just clear the target post ID without showing a toast
          clearTargetPost();
        }
      }, 500); // Increased delay to ensure DOM is ready
    }
  }, [isLoading, posts, targetPostId, clearTargetPost]);

  const sortedPosts = useMemo(() => {
    if (!posts) return [];
    return posts;
  }, [posts]);

  // Callback for story click in the following tab
  const handleStoryClick = (userId: number) => {
    // Use existing Stories component functionality
    const storyElement = document.querySelector(
      `.stories-container [data-user-id="${userId}"]`,
    ) as HTMLElement;
    if (storyElement) {
      storyElement.click();
    }
  };

  return (
    <div className="min-h-dvh bg-black pb-20 text-white">
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-zinc-800 bg-black px-4 py-2">
        <span className="text-xl font-bold tracking-tight text-white">
          CreativesOS
        </span>
        <div className="flex items-center space-x-3">
          <Button
            size="icon"
            variant="ghost"
            className="rounded-full text-zinc-400 hover:bg-zinc-900 hover:text-white"
            onClick={() => setLocation("/search")}
            aria-label="Search CreativesOS"
          >
            <Search className="h-5 w-5" />
          </Button>
          <NotificationBell />
        </div>
      </header>

      {/* Feed Tabs */}
      <div className="feed-tabs">
        <Tabs activeTab={activeTab} onChange={setActiveTab} />
      </div>

      {/* Stitch Explore keeps the story rail visible above both feed modes. */}
      <StoriesBar onStoryClick={handleStoryClick} />

      {/* Original Stories component for compatibility */}
      <div className="hidden">
        <Stories initialStoryId={initialStoryId} />
      </div>

      {/* Content Feed */}
      <div className="space-y-0">
        {isLoading ? (
          // Loading skeletons
          Array(3)
            .fill(0)
            .map((_, i) => (
              <div
                key={i}
                className="overflow-hidden border-b border-zinc-800 bg-black"
              >
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
          <>
            {/* Regular post listing */}
            {sortedPosts.map((post) => (
              <Post key={post.id} post={post} surface="dark" />
            ))}

            {/* Empty state */}
            {sortedPosts.length === 0 && !isLoading && (
              <div className="text-center py-10">
                <h3 className="mb-2 text-xl font-medium text-white">
                  No posts yet
                </h3>
                <p className="text-zinc-500">
                  {activeTab === "following"
                    ? "Start following creators to see posts in your feed"
                    : contentFilter !== "all"
                      ? `No ${contentFilter} content available`
                      : "We'll show posts here as they become available"}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Explore;
