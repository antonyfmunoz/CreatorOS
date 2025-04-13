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

const FollowersPage = () => {
  const [, setLocation] = useLocation();
  const { user: currentUser } = useAuth();
  const params = useParams<{ id?: string; username?: string }>();
  const [searchQuery, setSearchQuery] = useState("");
  
  // Determine if we're looking at current user's profile
  const isOwnProfile = !params.id && !params.username;
  
  // Setup query parameters for fetching the right user's followers
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
  
  // Fetch followers for the user
  const { data: followers, isLoading } = useQuery<User[]>({
    queryKey: ['/api/users/followers', userId],
    enabled: !!userId,
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}/followers`);
      if (!res.ok) throw new Error('Failed to fetch followers');
      return res.json();
    }
  });
  
  // Filter followers based on search query
  const filteredFollowers = searchQuery && followers
    ? followers.filter(user => 
        user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (user.displayName && user.displayName.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : followers;
  
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
          <h1 className="text-lg font-semibold">Followers</h1>
        </div>
        
        {/* Search input */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search followers"
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
      
      {/* Followers list */}
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
        ) : filteredFollowers && filteredFollowers.length > 0 ? (
          filteredFollowers.map(follower => (
            <div key={follower.id} className="flex items-center justify-between py-3 border-b border-border">
              <div 
                className="flex items-center cursor-pointer"
                onClick={() => setLocation(`/user/${follower.username}`)}
              >
                <Avatar className="h-12 w-12 mr-3">
                  <AvatarImage src={follower.profileImageUrl || undefined} alt={follower.displayName || follower.username} />
                  <AvatarFallback>
                    {follower.displayName?.[0] || follower.username[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{follower.displayName || follower.username}</p>
                  <p className="text-sm text-muted-foreground">@{follower.username}</p>
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
            <h3 className="text-lg font-medium mb-1">{displayName} followers</h3>
            <p className="text-sm text-muted-foreground text-center">
              {isOwnProfile 
                ? "When people follow you, you'll see them here." 
                : `${displayName} doesn't have any followers yet.`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FollowersPage;