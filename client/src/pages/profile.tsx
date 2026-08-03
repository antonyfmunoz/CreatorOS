import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/lib/stores";
import { 
  Settings, LogOut, LogIn, User as UserIcon, GridIcon, 
  BarChart3Icon, BookmarkIcon, UserPlus, UserMinus,
  FileText, DollarSign, UsersIcon, ShoppingBag, ArrowLeft,
  CalendarDays, LayoutDashboard, Menu, MessageSquare, Share2
} from "lucide-react";
import { NotificationBell } from "@/components/notifications";
import { MessageButton } from "@/components/messages";
import ProfileFeed from "@/components/profile/ProfileFeed";
import Post from "@/components/explore/Post";
import { Button } from "@/components/ui/button";
import { HorizontalRail } from "@/components/ui/horizontal-rail";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import EditProfilePage from "@/components/profile/EditProfilePage";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Post as PostType, Product } from "@/types";
import { User } from "@shared/schema";
import { Link, useParams, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const Profile = () => {
  const isDemoMode = import.meta.env.VITE_CREATOROS_DEMO_MODE === "true";
  const [, setLocation] = useLocation();
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [profileView, setProfileView] = useState<"posts" | "reposts" | "likes" | "tagged" | "offers" | "playlists">("posts");
  const { user: currentUser, isLoading: isAuthLoading, signOut } = useAuth();
  const params = useParams<{ id?: string; username?: string }>();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  // Determine if we're looking at the current user's profile
  const isOwnProfile = !params.id && !params.username;
  
  let queryKey: any[] = ['/api/users'];
  let profileUser = currentUser;
  
  // Handle different routing patterns:
  // 1. /profile/:id - numeric ID-based route
  // 2. /user/:username - username-based route (Instagram style)
  // 3. /profile (no params) - current user profile
  if (params.id) {
    // ID-based route
    const userId = parseInt(params.id);
    queryKey = ['/api/users', userId];
    profileUser = null; // Will be fetched
  } else if (params.username) {
    // Username-based route (Instagram style)
    queryKey = ['/api/users/by-username', params.username];
    profileUser = null; // Will be fetched
  } else if (!currentUser && !isAuthLoading) {
    // Not logged in and viewing own profile - redirect to auth
    setLocation("/auth");
    return null;
  }
  
  // Only fetch profile if it's not the current user
  const { data: fetchedUser, isLoading: isLoadingUser } = useQuery<User>({
    queryKey: queryKey,
    enabled: !isOwnProfile, // Only run query if not viewing own profile
    queryFn: async () => {
      let url = '/api/users';
      
      if (params.id) {
        url = `/api/users/${params.id}`;
      } else if (params.username) {
        // Fetch by username
        const res = await fetch(`/api/users?username=${params.username}`);
        if (!res.ok) throw new Error('Failed to fetch user');
        const users = await res.json();
        // Find the user with matching username
        const user = users.find((u: User) => u.username === params.username);
        if (!user) throw new Error('User not found');
        return user;
      }
      
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch user');
      return res.json();
    }
  });
  
  // Use either the fetched user or current user based on route
  const user = isOwnProfile ? currentUser : fetchedUser;
  const isViewingCurrentUser = Boolean(user && currentUser && user.id === currentUser.id);

  // A public-profile route is a fresh destination. Reset the local content
  // tab so opening it does not carry the previous profile tab into the route.
  useEffect(() => {
    setProfileView("posts");
  }, [params.id, params.username]);
  
  const { data: products, isLoading: isLoadingProducts } = useQuery<Product[]>({
    queryKey: ['/api/products'],
  });
  const profileProducts = products?.filter((product) => product.userId === user?.id) ?? [];
  const { data: allPosts = [], isLoading: isLoadingAllPosts } = useQuery<PostType[]>({
    queryKey: ["/api/posts"],
  });
  const likedPostIds = useMemo(() => {
    try {
      return new Set<number>(JSON.parse(localStorage.getItem("likedPosts") ?? "[]"));
    } catch {
      return new Set<number>();
    }
  }, [profileView]);
  const reposts = allPosts.filter((post) => post.userId === user?.id && post.content.startsWith("Reposted "));
  const taggedPosts = allPosts.filter((post) => post.taggedUsers?.some((taggedUser) => taggedUser.id === user?.id));
  const likedPosts = allPosts.filter((post) => likedPostIds.has(post.id));
  
  // Fetch follower/following counts
  const { data: followerCount, isLoading: isLoadingFollowers } = useQuery<number>({
    queryKey: ['/api/users/followers/count', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const res = await fetch(`/api/users/${user?.id}/followers/count`);
      if (!res.ok) return 0;
      return res.json();
    }
  });
  
  const { data: followingCount, isLoading: isLoadingFollowing } = useQuery<number>({
    queryKey: ['/api/users/following/count', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const res = await fetch(`/api/users/${user?.id}/following/count`);
      if (!res.ok) return 0;
      return res.json();
    }
  });
  
  // Fetch post count
  const { data: postCount, isLoading: isLoadingPostCount } = useQuery<{ count: number }>({
    queryKey: ['/api/users/post-count', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const res = await fetch(`/api/users/${user?.id}/post-count`);
      if (!res.ok) return { count: 0 };
      return res.json();
    }
  });
  
  // Check if the logged-in user is following this profile
  const { data: isFollowing, isLoading: isLoadingFollowStatus } = useQuery<boolean>({
    queryKey: ['/api/users/is-following', currentUser?.id, user?.id],
    enabled: !!currentUser && !!user && !isViewingCurrentUser,
    queryFn: async () => {
      const res = await fetch(`/api/users/${currentUser?.id}/is-following/${user?.id}`);
      if (!res.ok) return false;
      const data = await res.json();
      return data.isFollowing;
    }
  });
  
  // Follow user mutation
  const followMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser || !user) return;
      return apiRequest('POST', `/api/users/${user.id}/follow`, {});
    },
    onSuccess: () => {
      // Invalidate follower count and follow status
      queryClient.invalidateQueries({ queryKey: ['/api/users/followers/count', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/users/is-following', currentUser?.id, user?.id] });
      
      toast({
        title: "Success!",
        description: `You're now following ${user?.displayName || user?.username}`,
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to follow",
        description: error.message,
        variant: "destructive"
      });
    }
  });
  
  // Unfollow user mutation
  const unfollowMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser || !user) return;
      return apiRequest('POST', `/api/users/${user.id}/unfollow`, {});
    },
    onSuccess: () => {
      // Invalidate follower count and follow status
      queryClient.invalidateQueries({ queryKey: ['/api/users/followers/count', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['/api/users/is-following', currentUser?.id, user?.id] });
      
      toast({
        title: "Success!",
        description: `You've unfollowed ${user?.displayName || user?.username}`,
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to unfollow",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Calculate stats for user
  const stats = {
    followers: isLoadingFollowers ? "..." : (followerCount || 0).toString(),
    following: isLoadingFollowing ? "..." : (followingCount || 0).toString(),
    revenue: products ? `$${(profileProducts.reduce((sum, product) => sum + product.price, 0)).toFixed(2)}` : "$0.00",
    posts: isLoadingPostCount ? "..." : (postCount?.count || 0).toString(),
  };
  
  const handleLogout = () => {
    if (isDemoMode) {
      setLocation("/");
      return;
    }
    void signOut({ redirectUrl: "/auth" });
  };
  
  const handleLogin = () => {
    setLocation("/auth");
  };

  const handleShareProfile = async () => {
    if (!user) return;
    const profileUrl = `${window.location.origin}/user/${user.username}`;
    try {
      await navigator.clipboard.writeText(profileUrl);
      toast({ title: "Profile link copied", description: "Share it with your audience." });
    } catch {
      toast({ title: "Profile link", description: profileUrl });
    }
  };

  const joinedLabel = user?.createdAt
    ? `Joined ${new Date(user.createdAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}`
    : "Joined CreatorOS";
  
  if (isAuthLoading || (isLoadingUser && !isOwnProfile)) {
    return (
      <div className="px-4 pt-4 pb-20">
        <div className="flex items-center mb-6">
          <Skeleton className="w-16 h-16 rounded-full mr-4" />
          <div>
            <Skeleton className="h-6 w-32 mb-2" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="ml-auto h-10 w-10 rounded-full" />
        </div>
        
        <div className="grid grid-cols-3 gap-4 mb-6">
          {Array(3).fill(0).map((_, i) => (
            <div key={i} className="bg-white rounded-xl shadow-sm p-4 text-center">
              <Skeleton className="h-6 w-16 mx-auto mb-1" />
              <Skeleton className="h-4 w-12 mx-auto" />
            </div>
          ))}
        </div>
        
        <Skeleton className="h-[200px] w-full mb-6" />
        <Skeleton className="h-[200px] w-full mb-6" />
        <Skeleton className="h-[200px] w-full mb-6" />
        <Skeleton className="h-[200px] w-full" />
      </div>
    );
  }
  
  // Handle case where we are not logged in
  if (!currentUser && !user) {
    return (
      <div className="px-4 pt-4 pb-20 flex flex-col items-center justify-center min-h-[70vh]">
        <div className="text-center mb-6">
          <Avatar className="w-20 h-20 mx-auto mb-4">
            <AvatarFallback>
              <UserIcon className="h-10 w-10" />
            </AvatarFallback>
          </Avatar>
          <h1 className="text-2xl font-bold mb-2">Sign In Required</h1>
          <p className="text-gray-500 mb-8">Please sign in to view your profile</p>
          <Button onClick={handleLogin} className="mx-auto">
            <LogIn className="mr-2 h-4 w-4" /> Sign In
          </Button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-[calc(100dvh-3.5rem)] bg-black pb-20 text-white">
      {/* Sticky Header for viewing other users' profiles (similar to explore) */}
      {!isViewingCurrentUser && (
        <header className="sticky top-0 z-50 flex items-center justify-between border-b border-zinc-800 bg-black px-4 py-2">
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="icon" 
              className="p-1 text-white hover:bg-zinc-900 hover:text-white" 
              onClick={() => setLocation("/")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <span className="text-lg font-semibold text-white lowercase">{user?.username}</span>
          </div>
          <div className="flex items-center space-x-3">
            <NotificationBell />
            <MessageButton />
          </div>
        </header>
      )}
      
      {/* Instagram-style username header - only for own profile */}
      {isViewingCurrentUser && (
        <div className="flex h-16 items-center justify-between border-b border-zinc-800 px-4">
          <h1 className="text-2xl font-bold lowercase tracking-tight">{user?.username}</h1>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="text-white hover:bg-zinc-900 hover:text-white" onClick={() => setLocation("/messages")} aria-label="Open messages">
              <MessageSquare className="h-6 w-6" />
            </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="text-white hover:bg-zinc-900 hover:text-white" aria-label="Open profile menu">
                <Menu className="h-7 w-7" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setIsEditProfileOpen(true)}>
                <Settings className="mr-2 h-4 w-4" /> Edit Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLocation("/saved-posts")}>
                <BookmarkIcon className="mr-2 h-4 w-4" /> Saved
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setLocation("/revenue")}>
                <DollarSign className="mr-2 h-4 w-4" /> Revenue
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLocation("/contacts")}>
                <UsersIcon className="mr-2 h-4 w-4" /> Contacts
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLocation("/create-product")}>
                <ShoppingBag className="mr-2 h-4 w-4" /> Create Product
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLocation("/documents")}>
                <FileText className="mr-2 h-4 w-4" /> Documents
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-red-500">
                <LogOut className="mr-2 h-4 w-4" /> Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </div>
      )}
      
      {/* Profile Info Section */}
      <div className="px-4 pb-2 pt-5">
        {/* Avatar and Stats Row */}
        <div className="mb-5 flex items-start gap-5">
          {/* Avatar */}
          <div className="relative shrink-0">
            <Avatar className="h-20 w-20 border border-zinc-700">
              <AvatarImage src={user?.profileImageUrl || undefined} alt={user?.displayName || "User"} />
              <AvatarFallback>
                {user?.displayName?.charAt(0) || "U"}
              </AvatarFallback>
            </Avatar>
            {isViewingCurrentUser && <span className="absolute bottom-0 right-0 h-6 w-6 rounded-full border-[3px] border-black bg-emerald-500" aria-label="Online" />}
          </div>
          
          <div className="min-w-0 flex-1">
            <p className="truncate text-xl font-bold leading-6">{user?.displayName}</p>
            <div className="mt-3 flex max-w-[240px] gap-8">
            <div 
              className="cursor-pointer rounded-md text-left hover:bg-zinc-900"
              onClick={() => {
                if (params.username) {
                  setLocation(`/user/${params.username}/followers`);
                } else if (params.id) {
                  setLocation(`/followers/${params.id}`);
                } else {
                  setLocation("/followers");
                }
              }}
            >
              <div className="text-xl font-bold leading-5">{stats.followers}</div>
              <div className="mt-1 text-sm text-zinc-500">followers</div>
            </div>
            <div 
              className="cursor-pointer rounded-md text-left hover:bg-zinc-900"
              onClick={() => {
                if (params.username) {
                  setLocation(`/user/${params.username}/following`);
                } else if (params.id) {
                  setLocation(`/following/${params.id}`);
                } else {
                  setLocation("/following");
                }
              }}
            >
              <div className="text-xl font-bold leading-5">{stats.following}</div>
              <div className="mt-1 text-sm text-zinc-500">following</div>
            </div>
            </div>
          </div>
        </div>
        
        {/* Name and Bio */}
        <div className="mb-4">
          <div className="text-lg font-medium leading-6">{user?.bio || "Creator OS user"}</div>
          <div className="mt-2 flex items-center gap-2 text-sm text-zinc-500"><CalendarDays className="h-4 w-4" />{joinedLabel}</div>
        </div>
        
        {/* Edit Profile Button or Follow/Unfollow Button */}
        {isViewingCurrentUser ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" size="sm" className="h-11 rounded-xl border-zinc-700 bg-zinc-900 text-base font-bold text-white hover:bg-zinc-800" onClick={() => setIsEditProfileOpen(true)}>Edit profile</Button>
              <Button variant="outline" size="sm" className="h-11 rounded-xl border-zinc-700 bg-zinc-900 text-base font-bold text-white hover:bg-zinc-800" onClick={handleShareProfile}><Share2 className="mr-2 h-4 w-4" />Share profile</Button>
            </div>
            <button onClick={() => setLocation("/revenue")} className="mt-4 flex w-full items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-3 text-left transition-colors hover:bg-zinc-800">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-800 text-zinc-300"><LayoutDashboard className="h-6 w-6" /></span>
              <span className="flex-1 text-lg font-bold">Business dashboard</span>
              <span className="text-2xl text-zinc-500">›</span>
            </button>
          </>
        ) : currentUser ? (
          isLoadingFollowStatus ? (
            <Button variant="outline" size="sm" className="h-10 w-full rounded-lg border-zinc-800 bg-zinc-900 text-sm font-bold text-white hover:bg-zinc-800" disabled>
              <span className="animate-pulse">Loading...</span>
            </Button>
          ) : isFollowing ? (
            <Button 
              variant="outline" 
              size="sm" 
              className="h-10 w-full rounded-lg border-zinc-800 bg-zinc-900 text-sm font-bold text-white hover:bg-zinc-800"
              onClick={() => unfollowMutation.mutate()}
              disabled={unfollowMutation.isPending}
            >
              <UserMinus className="mr-1 h-3.5 w-3.5" />
              {unfollowMutation.isPending ? "Unfollowing..." : "Unfollow"}
            </Button>
          ) : (
            <Button 
              variant="default" 
              size="sm" 
              className="h-10 w-full rounded-lg bg-white text-sm font-bold text-black hover:bg-zinc-200"
              onClick={() => followMutation.mutate()}
              disabled={followMutation.isPending}
            >
              <UserPlus className="mr-1 h-3.5 w-3.5" />
              {followMutation.isPending ? "Following..." : "Follow"}
            </Button>
          )
        ) : (
          <Button 
            variant="default" 
            size="sm" 
            className="h-10 w-full rounded-lg bg-white text-sm font-bold text-black hover:bg-zinc-200"
            onClick={handleLogin}
          >
            <LogIn className="mr-1 h-3.5 w-3.5" /> Sign in to follow
          </Button>
        )}
      </div>
      
      <HorizontalRail className="mt-4 border-y border-zinc-800" role="navigation" aria-label="Profile content">
        {([
          ["posts", "Posts"],
          ["reposts", "Reposts"],
          ["likes", "Likes"],
          ["tagged", "Tagged"],
          ["offers", "Offers"],
          ["playlists", "Playlists"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            className={`relative shrink-0 basis-1/3 snap-start px-3 py-3 text-sm font-bold ${profileView === value ? "text-white" : "text-zinc-500"}`}
            onClick={() => setProfileView(value)}
          >
            {label}
            {profileView === value && <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-white" />}
          </button>
        ))}
      </HorizontalRail>

      {profileView === "posts" && user && (
        <ProfileFeed userId={user.id} username={user.username} />
      )}

      {profileView === "reposts" && (
        <ProfilePostList
          isLoading={isLoadingAllPosts}
          posts={reposts}
          emptyTitle="No reposts yet"
          emptyDescription="Reposts from this creator will appear here."
        />
      )}

      {profileView === "likes" && (
        isViewingCurrentUser ? (
          <ProfilePostList
            isLoading={isLoadingAllPosts}
            posts={likedPosts}
            emptyTitle="No liked posts yet"
            emptyDescription="Posts you like will appear here on this device."
          />
        ) : (
          <ProfileTabEmpty title="Likes are private" description="This creator's likes are only visible from their own profile." />
        )
      )}

      {profileView === "tagged" && (
        <ProfilePostList
          isLoading={isLoadingAllPosts}
          posts={taggedPosts}
          emptyTitle="No tagged posts yet"
          emptyDescription="Posts that tag this creator will appear here."
        />
      )}

      {profileView === "offers" && (
        <section className="grid grid-cols-2 gap-4 p-4">
          {profileProducts.map((product) => (
            <Link key={product.id} href={`/marketplace/product/${product.id}`} className="min-w-0">
              <div className="aspect-square overflow-hidden rounded-xl bg-zinc-900">
                {product.imageUrl ? <img src={product.imageUrl} alt={product.title} className="h-full w-full object-cover" /> : <div className="h-full bg-zinc-900" />}
              </div>
              <p className="mt-2 truncate text-sm font-bold">{product.title}</p>
              <p className="text-xs text-zinc-500">${product.price.toFixed(2)}</p>
            </Link>
          ))}
          {profileProducts.length === 0 && (
            <div className="col-span-2 py-12 text-center text-sm text-zinc-500">
              {isViewingCurrentUser ? "Create your first offer to begin selling through CreatorOS." : "This creator has no public offers yet."}
            </div>
          )}
        </section>
      )}

      {profileView === "playlists" && (
        <ProfileTabEmpty title="No playlists yet" description="Create and curate playlists is the next content-library capability." />
      )}

      
      {/* Only show the edit profile page for the user's own profile */}
      {isViewingCurrentUser && isEditProfileOpen && user && (
        <div className="fixed inset-0 z-50 bg-black">
          <EditProfilePage 
            user={user} 
            onClose={() => setIsEditProfileOpen(false)} 
          />
        </div>
      )}
    </div>
  );
};

export default Profile;

function ProfilePostList({
  posts,
  isLoading,
  emptyTitle,
  emptyDescription,
}: {
  posts: PostType[];
  isLoading: boolean;
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (isLoading) {
    return <div className="space-y-3 p-4"><Skeleton className="h-28 w-full bg-zinc-800" /><Skeleton className="h-28 w-full bg-zinc-800" /></div>;
  }

  if (!posts.length) {
    return <ProfileTabEmpty title={emptyTitle} description={emptyDescription} />;
  }

  return <div className="divide-y divide-zinc-800">{posts.map((post) => <Post key={post.id} post={post} surface="dark" />)}</div>;
}

function ProfileTabEmpty({ title, description }: { title: string; description: string }) {
  return <section className="px-6 py-16 text-center"><h2 className="font-bold text-white">{title}</h2><p className="mt-2 text-sm text-zinc-500">{description}</p></section>;
}
