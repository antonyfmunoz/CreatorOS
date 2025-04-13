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
      {/* Instagram-style username header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center">
          <h1 className="text-base font-normal">{user?.username}</h1>
          {/* Instagram-style verified checkmark (only for UI matching) */}
          <div className="ml-1 text-blue-500 text-base">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.498 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.49 4.49 0 01-3.498-1.306 4.491 4.491 0 01-1.307-3.498A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.49 4.49 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
            </svg>
          </div>
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
                Edit Profile
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
      
      {/* Instagram-style Tab Navigation */}
      <div className="border-t mt-2">
        <div className="grid grid-cols-3">
          <button className="py-2.5 text-blue-500 border-t border-blue-500 flex justify-center">
            <GridIcon className="h-5 w-5" />
          </button>
          <button className="py-2.5 text-gray-400 flex justify-center">
            <BookmarkIcon className="h-5 w-5" />
          </button>
          <button className="py-2.5 text-gray-400 flex justify-center">
            <UserIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
      
      {/* Instagram-style Grid Layout for Posts - Exact Instagram look with no gap */}
      <div className="grid grid-cols-3 gap-px bg-gray-100">
        {Array(9).fill(0).map((_, index) => (
          <div key={index} className="aspect-square bg-white">
            {products && products[index % products.length] ? (
              <div className="w-full h-full bg-gray-200 relative">
                <div className="absolute inset-0 flex items-center justify-center p-1">
                  <p className="text-xs text-center truncate">
                    {products[index % products.length].title?.substring(0, 15)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-100">
                <GridIcon className="h-5 w-5 text-gray-400" />
              </div>
            )}
          </div>
        ))}
      </div>
      
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
