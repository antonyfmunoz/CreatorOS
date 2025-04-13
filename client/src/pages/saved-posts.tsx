import { useQuery } from "@tanstack/react-query";
import { Post as PostType } from "@shared/schema";
import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { User as UserIcon, ArrowLeft, ImageIcon, BookmarkIcon } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";

const SavedPostsPage = () => {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [selectedTab, setSelectedTab] = useState("posts");
  
  // Fetch saved posts for the user
  const { data: savedPosts, isLoading } = useQuery<(PostType & { user: any })[]>({
    queryKey: [`/api/users/${user?.id}/saved-posts`],
    enabled: !!user,
  });
  
  // Handle going back to profile
  const handleBackToProfile = () => {
    setLocation("/profile");
  };
  
  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh]">
        <Avatar className="w-20 h-20 mb-4">
          <AvatarFallback>
            <UserIcon className="h-10 w-10" />
          </AvatarFallback>
        </Avatar>
        <h1 className="text-xl font-bold mb-2">Sign in required</h1>
        <p className="text-gray-500 mb-6">Please sign in to view your saved posts</p>
        <Button onClick={() => setLocation("/auth")}>Sign In</Button>
      </div>
    );
  }
  
  return (
    <div className="pb-20">
      {/* Instagram-style header */}
      <div className="flex items-center justify-between px-4 py-3 border-b sticky top-0 bg-background z-10">
        <Button variant="ghost" size="icon" onClick={handleBackToProfile} className="rounded-full mr-2">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold flex-1 text-center">Saved</h1>
        <div className="w-9" /> {/* Spacer for centering */}
      </div>
      
      <div className="p-4">
        <Tabs defaultValue="posts" onValueChange={setSelectedTab} value={selectedTab}>
          <TabsList className="w-full mb-6 grid grid-cols-1">
            <TabsTrigger value="posts">Posts</TabsTrigger>
          </TabsList>
          
          <TabsContent value="posts">
            {isLoading ? (
              <div className="grid grid-cols-3 gap-1">
                {Array(9).fill(0).map((_, i) => (
                  <Skeleton key={i} className="aspect-square w-full" />
                ))}
              </div>
            ) : savedPosts && savedPosts.length > 0 ? (
              <div className="grid grid-cols-3 gap-[2px]">
                {savedPosts.map((post) => (
                  <div 
                    key={post.id} 
                    className="aspect-square relative cursor-pointer"
                    onClick={() => setLocation(`/post/${post.id}`)}
                  >
                    {post.imageUrl ? (
                      <img 
                        src={post.imageUrl} 
                        alt={`Post by ${post.user.displayName}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                        <ImageIcon className="w-8 h-8 text-gray-400" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
                  <ImageIcon className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium mb-1">No saved posts yet</h3>
                <p className="text-gray-500 max-w-xs">
                  When you save posts, they'll appear here.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default SavedPostsPage;