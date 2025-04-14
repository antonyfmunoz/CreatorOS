import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Post as PostType } from "@/types";
import Stories from "@/components/explore/Stories";
import Post from "@/components/explore/Post";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useMemo, useRef, useState } from "react";
import { NotificationBell } from "@/components/notifications";
import { MessageButton } from "@/components/messages";
import { useAppStore } from "@/lib/stores";
import { useToast } from "@/hooks/use-toast";

// Import new feed components
import { Tabs, TabType } from "@/components/feed/Tabs";
import { FilterDropdown, ContentFilterType } from "@/components/feed/FilterDropdown";
import { VoicePostCard } from "@/components/feed/VoicePostCard";
import { FloatingActionButton } from "@/components/feed/FloatingActionButton";
import { StoriesBar } from "@/components/feed/StoriesBar";

const Explore = () => {
  const queryClient = useQueryClient();
  const { targetPostId, clearTargetPost } = useAppStore();
  const { toast } = useToast();
  
  // Feed Tab State
  const [activeTab, setActiveTab] = useState<TabType>("forYou");
  
  // Content Filter State
  const [contentFilter, setContentFilter] = useState<ContentFilterType>("all");
  
  // Enable caching of posts to prevent reordering on refresh
  const { data: posts, isLoading } = useQuery<PostType[]>({
    queryKey: ["/api/posts", activeTab, contentFilter],
    // Set a longer staleTime to prevent unnecessary refetching
    staleTime: 1000 * 60 * 5, // 5 minutes
    // Make sure posts are stable even on refresh
    select: (data) => {
      if (!data) return [];
      // Filter posts based on selected content type
      let filteredPosts = [...data];
      
      if (contentFilter === "photo") {
        filteredPosts = filteredPosts.filter(post => post.imageUrl);
      } else if (contentFilter === "audio") {
        filteredPosts = filteredPosts.filter(post => post.audioUrl);
      } else if (contentFilter === "video") {
        filteredPosts = filteredPosts.filter(post => post.videoUrl);
      } else if (contentFilter === "text") {
        filteredPosts = filteredPosts.filter(post => !post.imageUrl && !post.audioUrl && !post.videoUrl);
      }
      
      // Sort by ID to ensure consistent order
      return filteredPosts.sort((a, b) => b.id - a.id);
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
          const headerElement = document.querySelector('.sticky.top-0');
          const tabsElement = document.querySelector('.feed-tabs');
          const storiesElement = document.querySelector('.stories-container');
          
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
          console.log('Post not found in feed:', targetPostId);
          clearTargetPost();
        }
      }, 500); // Increased delay to ensure DOM is ready
    }
  }, [isLoading, posts, targetPostId, clearTargetPost]);

  // Sort posts by ID in descending order to maintain consistent position
  const sortedPosts = useMemo(() => {
    if (!posts) return [];
    return [...posts].sort((a, b) => b.id - a.id);
  }, [posts]);

  // Callback for story click in the following tab
  const handleStoryClick = (userId: number) => {
    // Use existing Stories component functionality
    const storyElement = document.querySelector(`.stories-container [data-user-id="${userId}"]`) as HTMLElement;
    if (storyElement) {
      storyElement.click();
    }
  };

  return (
    <div className="pb-20">
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 bg-white dark:bg-black px-4 py-2 flex justify-between items-center shadow-sm">
        <span className="text-xl font-semibold text-black dark:text-white">CreatorOS</span>
        <div className="flex items-center space-x-3">
          <FilterDropdown selectedFilter={contentFilter} onSelect={setContentFilter} />
          <NotificationBell />
          <MessageButton />
        </div>
      </header>

      {/* Feed Tabs */}
      <div className="feed-tabs">
        <Tabs activeTab={activeTab} onChange={setActiveTab} />
      </div>

      {/* Stories Bar - Only shown in Following tab */}
      {activeTab === "following" && (
        <StoriesBar onStoryClick={handleStoryClick} />
      )}

      {/* Original Stories component for compatibility */}
      <div className="hidden">
        <Stories />
      </div>

      {/* Content Feed */}
      <div className="space-y-6 px-4 mt-4">
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
          <>
            {/* Example Voice Post Card - we'll show this only for demonstration */}
            {contentFilter === "audio" && (
              <VoicePostCard
                user={{
                  id: 1,
                  name: "Voice Demo",
                  username: "voicedemo",
                  avatar: "https://avatars.githubusercontent.com/u/1?v=4"
                }}
                audioUrl="https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3"
                transcript="This is an example voice post with a transcript that can be toggled. The actual audio is from a free source for demonstration purposes."
                createdAt={new Date().toISOString()}
                likes={42}
                comments={7}
              />
            )}
            
            {/* Regular post listing */}
            {sortedPosts.map((post) => <Post key={post.id} post={post} />)}
            
            {/* Empty state */}
            {posts?.length === 0 && !isLoading && (
              <div className="text-center py-10">
                <h3 className="text-xl font-medium mb-2">No posts yet</h3>
                <p className="text-gray-500">
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
      
      {/* Floating Action Button */}
      <FloatingActionButton />
    </div>
  );
};

export default Explore;
