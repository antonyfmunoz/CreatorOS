import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import RevenueChart from "@/components/profile/RevenueChart";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";

const RevenuePage = () => {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  
  // If not authenticated, redirect to auth page
  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/auth");
    }
  }, [user, isLoading, setLocation]);

  if (isLoading) {
    return <div className="p-4">Loading...</div>;
  }

  if (!user) {
    return null; // will redirect via useEffect
  }

  return (
    <div className="pb-20">
      {/* Header with back button */}
      <div className="flex items-center justify-between p-4 border-b">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => setLocation("/profile")}
          className="mr-2"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-bold flex-1 text-center">Revenue</h1>
        <div className="w-9"></div> {/* Empty div for balance */}
      </div>
      
      <div className="p-4">
        <RevenueChart userId={user.id} />
      </div>
    </div>
  );
};

export default RevenuePage;