import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import ProductForm from "@/components/profile/ProductForm";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";

const CreateProductPage = () => {
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
    <main className="min-h-dvh bg-black pb-24 text-white">
      {/* Header with back button */}
      <header className="flex h-16 items-center gap-2 border-b border-zinc-800 px-4">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => setLocation("/profile")}
          className="-ml-2 text-zinc-400 hover:bg-zinc-900 hover:text-white"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div><h1 className="text-lg font-bold">Create an offer</h1><p className="text-xs text-zinc-500">Build something your audience can discover and buy.</p></div>
      </header>
      
      <div className="p-4">
        <ProductForm />
      </div>
    </main>
  );
};

export default CreateProductPage;
