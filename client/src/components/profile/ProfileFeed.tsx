import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Post as PostType } from "@/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { 
  Heart, MessageSquare, Share2, Image as ImageIcon, 
  Music, Video 
} from "lucide-react";
import { useLocation } from "wouter";

interface ProfileFeedProps {
  userId: number;
  username: string;
}

const ProfileFeed = ({ userId, username }: ProfileFeedProps) => {
  const [activeTab, setActiveTab] = useState("all");
  const [, setLocation] = useLocation();

  // Fetch user posts with filtering
  const { data: posts, isLoading, error } = useQuery<PostType[]>({
    queryKey: ["/api/users/posts", userId, activeTab],
    queryFn: async () => {
      let url = `/api/users/${userId}/posts`;
      if (activeTab !== "all") {
        url += `?type=${activeTab}`;
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch posts");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="mt-4 space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="mb-4 overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center mb-3">
                <Skeleton className="w-10 h-10 rounded-full mr-3" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
              <Skeleton className="h-20 w-full mb-4" />
              <div className="flex justify-between">
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-6 w-16" />
                <Skeleton className="h-6 w-16" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-8 text-center">
        <p className="text-destructive">Error loading posts: {error.message}</p>
        <Button 
          variant="outline" 
          className="mt-4"
          onClick={() => window.location.reload()}
        >
          Try Again
        </Button>
      </div>
    );
  }

  const noPosts = !posts || posts.length === 0;

  return (
    <div className="mt-2">
      <Tabs
        defaultValue="all"
        value={activeTab}
        onValueChange={setActiveTab}
        className="w-full"
      >
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="text">Text</TabsTrigger>
          <TabsTrigger value="photo">Photos</TabsTrigger>
          <TabsTrigger value="audio">Audio</TabsTrigger>
          <TabsTrigger value="video">Video</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-0">
          {renderPosts(posts, noPosts, username)}
        </TabsContent>
        
        <TabsContent value="text" className="mt-0">
          {renderPosts(
            posts?.filter(post => !post.imageUrl),
            noPosts || !posts?.some(post => !post.imageUrl),
            username,
            "text"
          )}
        </TabsContent>
        
        <TabsContent value="photo" className="mt-0">
          {renderPosts(
            posts?.filter(post => post.imageUrl),
            noPosts || !posts?.some(post => post.imageUrl),
            username,
            "photo"
          )}
        </TabsContent>
        
        <TabsContent value="audio" className="mt-0">
          {renderPosts(
            posts?.filter(post => post.audioUrl),
            true, // Currently no audio posts supported
            username,
            "audio"
          )}
        </TabsContent>
        
        <TabsContent value="video" className="mt-0">
          {renderPosts(
            posts?.filter(post => post.videoUrl),
            true, // Currently no video posts supported
            username,
            "video"
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

function renderPosts(
  posts: PostType[] | undefined,
  noPosts: boolean,
  username: string,
  type?: string
) {
  if (noPosts) {
    return (
      <div className="py-12 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
          {type === "photo" ? (
            <ImageIcon className="h-6 w-6 text-muted-foreground" />
          ) : type === "audio" ? (
            <Music className="h-6 w-6 text-muted-foreground" />
          ) : type === "video" ? (
            <Video className="h-6 w-6 text-muted-foreground" />
          ) : (
            <MessageSquare className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
        <h3 className="text-lg font-medium">No posts yet</h3>
        <p className="text-muted-foreground text-sm mt-1">
          {type === "photo"
            ? `@${username} hasn't shared any photos`
            : type === "text"
            ? `@${username} hasn't written any text posts`
            : type === "audio"
            ? `@${username} hasn't shared any audio posts`
            : type === "video"
            ? `@${username} hasn't shared any video posts`
            : `When @${username} shares posts, you'll see them here`}
        </p>
      </div>
    );
  }

  return (
    <div className="mt-0 space-y-0 divide-y">
      {posts?.map((post) => (
        <PostItem key={post.id} post={post} />
      ))}
    </div>
  );
}

const PostItem = ({ post }: { post: PostType }) => {
  const [, setLocation] = useLocation();
  const formattedDate = formatDistanceToNow(new Date(post.createdAt), { addSuffix: true });

  return (
    <div className="py-3 px-4">
      <div className="flex mb-2">
        <Avatar 
          className="w-10 h-10 mr-3 cursor-pointer"
          onClick={() => setLocation(`/profile/${post.user.id}`)}
        >
          <AvatarImage src={post.user.profileImageUrl || undefined} alt={post.user.displayName} />
          <AvatarFallback>{post.user.displayName.charAt(0)}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <div className="flex items-center">
            <p 
              className="font-bold text-sm cursor-pointer hover:underline"
              onClick={() => setLocation(`/profile/${post.user.id}`)}
            >
              {post.user.displayName}
            </p>
            <p className="text-gray-500 text-sm ml-1">@{post.user.username} · {formattedDate}</p>
          </div>
          <p className="mt-1 text-sm">{post.content}</p>
          
          {post.imageUrl && (
            <div className="mt-2">
              <img 
                src={post.imageUrl} 
                alt="Post content" 
                className="w-full h-auto rounded-lg border border-border" 
              />
            </div>
          )}
          
          {post.audioUrl && (
            <div className="mt-2">
              <audio 
                controls 
                className="w-full rounded-lg border border-border bg-muted p-1"
              >
                <source src={post.audioUrl} />
                Your browser does not support the audio element.
              </audio>
            </div>
          )}
          
          {post.videoUrl && (
            <div className="mt-2">
              <video 
                controls 
                className="w-full h-auto rounded-lg border border-border" 
              >
                <source src={post.videoUrl} />
                Your browser does not support the video element.
              </video>
            </div>
          )}
          
          <div className="flex items-center mt-3 text-gray-500 text-sm space-x-6">
            <button className="flex items-center hover:text-blue-500">
              <MessageSquare className="h-4 w-4 mr-1" />
              <span>{post.comments}</span>
            </button>
            <button className="flex items-center hover:text-red-500">
              <Heart className="h-4 w-4 mr-1" />
              <span>{post.likes}</span>
            </button>
            <button className="flex items-center hover:text-green-500">
              <Share2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileFeed;