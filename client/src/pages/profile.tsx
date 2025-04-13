import { useState } from "react";
import { useAppStore } from "@/lib/stores";
import { Settings, LogOut, LogIn, User as UserIcon, GridIcon, BarChart3Icon, BookmarkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import StatCard from "@/components/profile/StatCard";
import RevenueChart from "@/components/profile/RevenueChart";
import ContactList from "@/components/profile/ContactList";
import ProductForm from "@/components/profile/ProductForm";
import DocumentEditor from "@/components/profile/DocumentEditor";
import ProfileEditForm from "@/components/profile/ProfileEditForm";
import EditProfilePage from "@/components/profile/EditProfilePage";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Product } from "@/types";
import { User } from "@shared/schema";
import { useParams, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const Profile = () => {
  const [, setLocation] = useLocation();
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const { user: currentUser, isLoading: isAuthLoading, logoutMutation } = useAuth();
  const params = useParams<{ id?: string; username?: string }>();
  
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
  
  const { data: products, isLoading: isLoadingProducts } = useQuery<Product[]>({
    queryKey: ['/api/products'],
  });
  
  // Calculate stats for user
  const stats = {
    followers: "2.4K",
    revenue: products ? `$${(products.reduce((sum, product) => sum + product.price, 0)).toFixed(2)}` : "$0.00",
    products: products ? products.length.toString() : "0",
  };
  
  const handleLogout = () => {
    logoutMutation.mutate();
  };
  
  const handleLogin = () => {
    setLocation("/auth");
  };
  
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
    <div className="pb-20">
      {/* Instagram-style username header - without badge */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center">
          <h1 className="text-base font-normal lowercase">{user?.username}</h1>
        </div>
        
        {isOwnProfile && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="p-1">
                <Settings className="h-5 w-5" />
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
              <DropdownMenuItem onClick={handleLogout} className="text-red-500">
                <LogOut className="mr-2 h-4 w-4" /> Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      
      {/* Profile Info Section */}
      <div className="px-4 pt-4 pb-2">
        {/* Avatar and Stats Row */}
        <div className="flex mb-5">
          {/* Avatar */}
          <div className="mr-7">
            <Avatar className="w-[77px] h-[77px]">
              <AvatarImage src={user?.profileImageUrl || undefined} alt={user?.displayName || "User"} />
              <AvatarFallback>
                {user?.displayName?.charAt(0) || "U"}
              </AvatarFallback>
            </Avatar>
          </div>
          
          {/* Stats in 3 columns */}
          <div className="flex flex-1 items-center">
            <div className="flex-1 text-center">
              <div className="text-base font-semibold">{stats.products}</div>
              <div className="text-xs">posts</div>
            </div>
            <div className="flex-1 text-center">
              <div className="text-base font-semibold">{stats.followers}</div>
              <div className="text-xs">followers</div>
            </div>
            <div className="flex-1 text-center">
              <div className="text-base font-semibold">1.2K</div>
              <div className="text-xs">following</div>
            </div>
          </div>
        </div>
        
        {/* Name and Bio */}
        <div className="mb-3">
          <div className="font-semibold text-sm leading-5">{user?.displayName}</div>
          <div className="text-sm leading-5 mt-1">{user?.bio || "Creator OS user"}</div>
        </div>
        
        {/* Edit Profile Button */}
        {isOwnProfile && (
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full h-[30px] text-sm font-medium rounded-md"
            onClick={() => setIsEditProfileOpen(true)}
          >
            Edit Profile
          </Button>
        )}
      </div>
      
      {/* Placeholder for future tab content - empty section */}
      <div className="border-t mt-6 mb-6"></div>
      
      {/* Only show these sections for the user's own profile */}
      {isOwnProfile && (
        <>
          {/* Revenue Chart */}
          <RevenueChart userId={user?.id || 1} />
          
          {/* CRM Contact List */}
          <ContactList userId={user?.id || 1} />
          
          {/* Create New Product */}
          <ProductForm />
          
          {/* Document Editor */}
          <DocumentEditor />
          
          {/* Instagram-style Edit Profile Page */}
          {isEditProfileOpen && user && (
            <div className="fixed inset-0 bg-white z-50">
              <EditProfilePage 
                user={user} 
                onClose={() => setIsEditProfileOpen(false)} 
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Profile;
