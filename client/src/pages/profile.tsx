import { useAppStore } from "@/lib/stores";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import StatCard from "@/components/profile/StatCard";
import RevenueChart from "@/components/profile/RevenueChart";
import ContactList from "@/components/profile/ContactList";
import ProductForm from "@/components/profile/ProductForm";
import DocumentEditor from "@/components/profile/DocumentEditor";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { User, Product } from "@/types";
import { useParams } from "wouter";

const Profile = () => {
  const params = useParams<{ id?: string; username?: string }>();
  let queryKey: any[] = ['/api/users'];
  
  // Handle different routing patterns:
  // 1. /profile/:id - numeric ID-based route
  // 2. /user/:username - username-based route (Instagram style)
  // 3. /profile (no params) - default to current user profile
  if (params.id) {
    // ID-based route
    const userId = parseInt(params.id);
    queryKey = ['/api/users', userId];
  } else if (params.username) {
    // Username-based route (Instagram style)
    queryKey = ['/api/users/by-username', params.username];
  } else {
    // Default to user ID 1 if no parameters
    queryKey = ['/api/users', 1];
  }
  
  const { data: user, isLoading: isLoadingUser } = useQuery<User>({
    queryKey: queryKey,
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
      } else {
        url = '/api/users/1'; // Default user
      }
      
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch user');
      return res.json();
    }
  });
  
  const { data: products, isLoading: isLoadingProducts } = useQuery<Product[]>({
    queryKey: ['/api/products'],
  });
  
  // Calculate stats for user
  const stats = {
    followers: "2.4K",
    revenue: products ? `$${(products.reduce((sum, product) => sum + product.price, 0)).toFixed(2)}` : "$0.00",
    products: products ? products.length.toString() : "0",
  };
  
  if (isLoadingUser) {
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
  
  return (
    <div className="px-4 pt-4 pb-20">
      {/* Profile Header */}
      <div className="flex items-center mb-6">
        <Avatar className="w-16 h-16 mr-4">
          <AvatarImage src={user?.profileImageUrl} alt={user?.displayName || "User"} />
          <AvatarFallback>
            {user?.displayName?.charAt(0) || "U"}
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-xl font-bold">{user?.displayName}</h1>
          <p className="text-gray-500">{user?.bio}</p>
        </div>
        <Button variant="outline" size="icon" className="ml-auto p-2 rounded-full bg-gray-100">
          <Settings className="h-5 w-5" />
        </Button>
      </div>
      
      {/* Dashboard Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard title="Followers" value={stats.followers} />
        <StatCard title="Revenue" value={stats.revenue} />
        <StatCard title="Products" value={stats.products} />
      </div>
      
      {/* Revenue Chart */}
      <RevenueChart userId={user?.id || 1} />
      
      {/* CRM Contact List */}
      <ContactList userId={user?.id || 1} />
      
      {/* Create New Product */}
      <ProductForm />
      
      {/* Document Editor */}
      <DocumentEditor />
    </div>
  );
};

export default Profile;
