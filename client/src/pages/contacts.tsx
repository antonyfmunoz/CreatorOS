import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import ContactList from "@/components/profile/ContactList";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";

const ContactsPage = () => {
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
    <div className="min-h-screen bg-black pb-24 text-white">
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-zinc-900 bg-black/95 p-4 backdrop-blur">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => setLocation("/profile")}
          aria-label="Back to profile"
          className="mr-2 text-white hover:bg-zinc-900 hover:text-white"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-bold flex-1 text-center">Contacts</h1>
        <div className="w-9" />
      </div>
      
      <div className="mx-auto max-w-xl p-4">
        <ContactList userId={user.id} />
      </div>
    </div>
  );
};

export default ContactsPage;
