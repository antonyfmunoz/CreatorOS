import { useState } from "react";
import { Plus, Edit, Mic, Video, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";

export function FloatingActionButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [, setLocation] = useLocation();
  
  const toggleOpen = () => {
    setIsOpen(!isOpen);
  };
  
  const handleOptionClick = (option: string) => {
    // Close the menu first
    setIsOpen(false);
    
    // Navigate to the create page with the appropriate type
    setLocation(`/create?type=${option}`);
  };

  return (
    <div className="fixed bottom-[80px] right-5 z-50">
      {/* Action menu */}
      <div className={cn(
        "flex flex-col-reverse items-center mb-3 transition-all duration-300 ease-in-out space-y-reverse space-y-3",
        isOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
      )}>
        {/* Text Post */}
        <Button
          onClick={() => handleOptionClick("text")}
          variant="secondary"
          className="rounded-full h-12 w-12 shadow-lg flex items-center justify-center bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <Edit className="h-5 w-5" />
        </Button>
        
        {/* Audio Post */}
        <Button
          onClick={() => handleOptionClick("audio")}
          variant="secondary"
          className="rounded-full h-12 w-12 shadow-lg flex items-center justify-center bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <Mic className="h-5 w-5" />
        </Button>
        
        {/* Video Post */}
        <Button
          onClick={() => handleOptionClick("video")}
          variant="secondary"
          className="rounded-full h-12 w-12 shadow-lg flex items-center justify-center bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <Video className="h-5 w-5" />
        </Button>
        
        {/* Photo Post */}
        <Button
          onClick={() => handleOptionClick("photo")}
          variant="secondary"
          className="rounded-full h-12 w-12 shadow-lg flex items-center justify-center bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <Camera className="h-5 w-5" />
        </Button>
      </div>
      
      {/* Main button */}
      <Button
        onClick={toggleOpen}
        className={cn(
          "rounded-full h-14 w-14 shadow-xl flex items-center justify-center transition-transform",
          isOpen && "rotate-45"
        )}
      >
        <Plus className="h-6 w-6" />
      </Button>
    </div>
  );
}