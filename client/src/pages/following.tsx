import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { User } from "@shared/schema";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, Search, UserIcon, MessageSquare, XCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";

const FollowingPage = () => {
  const [, setLocation] = useLocation();
  const { user: currentUser } = useAuth();
  const params = useParams<{ id?: string; username?: string }>();
  const [searchQuery, setSearchQuery] = useState("");
  
  // Determine if we're looking at current user's profile
  const isOwnProfile = !params.id && !params.username;
  
  // Setup query parameters for fetching the right user's following
  let userId: number | undefined = currentUser?.id;
  let displayName = currentUser?.displayName || "Your";
  
  if (params.id) {
    userId = parseInt(params.id);
  } else if (params.username && !isOwnProfile) {
    // We need to fetch the user first to get their ID
    const { data: user } = useQuery<User>({
      queryKey: ['/api/users/by-username', params.username],
      queryFn: async () => {
        const res = await fetch(`/api/users?username=${params.username}`);
        if (!res.ok) throw new Error('Failed to fetch user');
        
        const users = await res.json();
        const user = users.find((u: User) => u.username === params.username);
        if (!user) throw new Error('User not found');
        
        return user;
      }
    });
    
    if (user) {
      userId = user.id;
      displayName = user.displayName || user.username;
    }
  }
  
  // Fetch following for the user
  const { data: following, isLoading } = useQuery<User[]>({
    queryKey: ['/api/users/following', userId],
    enabled: !!userId,
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}/following`);
      if (!res.ok) throw new Error('Failed to fetch following');
      return res.json();
    }
  });
  
  // Filter following based on search query
  const filteredFollowing = searchQuery && following
    ? following.filter(user => 
        user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (user.displayName && user.displayName.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : following;
  
  const handleBackClick = () => {
    if (isOwnProfile) {
      setLocation("/profile");
    } else if (params.username) {
      setLocation(`/user/${params.username}`);
    } else if (params.id) {
      setLocation(`/profile/${params.id}`);
    } else {
      setLocation("/");
    }
  };
  
  return (
    <div className="pb-20">
      {/* Header */}
      <div className="sticky top-0 bg-background z-10 border-b border-border">
        <div className="flex items-center px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            className="mr-2"
            onClick={handleBackClick}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">Following</h1>
        </div>
        
        {/* Search input */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search following"
              className="pl-8"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <XCircle
                className="absolute right-2 top-2.5 h-4 w-4 text-muted-foreground cursor-pointer"
                onClick={() => setSearchQuery("")}
              />
            )}
          </div>
        </div>
      </div>
      
      {/* Following list */}
      <div className="px-4 py-2">
        {isLoading ? (
          // Loading skeletons
          Array(5).fill(0).map((_, i) => (
            <div key={i} className="flex items-center justify-between py-3 border-b border-border">
              <div className="flex items-center">
                <Skeleton className="h-12 w-12 rounded-full mr-3" />
                <div>
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
              <Skeleton className="h-9 w-24" />
            </div>
          ))
        ) : filteredFollowing && filteredFollowing.length > 0 ? (
          filteredFollowing.map(followedUser => (
            <div key={followedUser.id} className="flex items-center justify-between py-3 border-b border-border">
              <div 
                className="flex items-center cursor-pointer"
                onClick={() => setLocation(`/user/${followedUser.username}`)}
              >
                <Avatar className="h-12 w-12 mr-3">
                  <AvatarImage src={followedUser.profileImageUrl || undefined} alt={followedUser.displayName || followedUser.username} />
                  <AvatarFallback>
                    {followedUser.displayName?.[0] || followedUser.username[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{followedUser.displayName || followedUser.username}</p>
                  <p className="text-sm text-muted-foreground">@{followedUser.username}</p>
                </div>
              </div>
              <Button size="sm" variant="outline" className="rounded-full">
                <MessageSquare className="h-4 w-4 mr-2" />
                Message
              </Button>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="bg-muted rounded-full p-5 mb-4">
              <UserIcon className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-1">{displayName} following</h3>
            <p className="text-sm text-muted-foreground text-center">
              {isOwnProfile 
                ? "When you follow people, you'll see them here." 
                : `${displayName} isn't following anyone yet.`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FollowingPage;