import { useState } from "react";
import { Plus, Edit, Mic, Video, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { TextComposer } from "@/components/feed/TextComposer";
import { VoiceRecorder } from "@/components/feed/VoiceRecorder";
import { VideoRecorder } from "@/components/feed/VideoRecorder";
import { PhotoUploader } from "@/components/feed/PhotoUploader";

export function FloatingActionButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [postType, setPostType] = useState<"text" | "photo" | "audio" | "video">("text");
  
  const toggleOpen = () => {
    setIsOpen(!isOpen);
  };
  
  const openPostModal = (type: "text" | "photo" | "audio" | "video") => {
    // Close the FAB menu
    setIsOpen(false);
    
    // Set the post type
    setPostType(type);
    
    // Open the modal
    setIsModalOpen(true);
  };
  
  const closeModal = () => {
    setIsModalOpen(false);
  };
  
  const getTooltipText = (type: string): string => {
    switch (type) {
      case 'text':
        return 'Text Post (like X)';
      case 'photo':
        return 'Image Post (like Instagram)';
      case 'audio':
        return 'Voice Post (like Telegram)';
      case 'video':
        return 'Video Post (TikTok <10s, YouTube >10s)';
      default:
        return '';
    }
  };

  // Determine modal content based on post type
  const renderModalContent = () => {
    switch (postType) {
      case "text":
        return <TextComposer onClose={closeModal} />;
      case "photo":
        return <PhotoUploader onClose={closeModal} />;
      case "audio":
        return <VoiceRecorder onClose={closeModal} />;
      case "video":
        return <VideoRecorder onClose={closeModal} />;
      default:
        return null;
    }
  };

  // Get dialog title based on post type
  const getDialogTitle = () => {
    switch (postType) {
      case "text":
        return "Create Text Post";
      case "photo":
        return "Create Photo Post";
      case "audio":
        return "Create Audio Post";
      case "video":
        return "Create Video Post";
      default:
        return "Create Post";
    }
  };

  return (
    <>
      <div className="fixed bottom-[80px] right-5 z-50">
        {/* Action menu */}
        <div className={cn(
          "flex flex-col-reverse items-center mb-3 transition-all duration-300 ease-in-out space-y-reverse space-y-3",
          isOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
        )}>
          {/* Text Post */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => openPostModal("text")}
                  variant="secondary"
                  className="rounded-full h-12 w-12 shadow-lg flex items-center justify-center bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Edit className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p>{getTooltipText('text')}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {/* Audio Post */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => openPostModal("audio")}
                  variant="secondary"
                  className="rounded-full h-12 w-12 shadow-lg flex items-center justify-center bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Mic className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p>{getTooltipText('audio')}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {/* Video Post */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => openPostModal("video")}
                  variant="secondary"
                  className="rounded-full h-12 w-12 shadow-lg flex items-center justify-center bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Video className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p>{getTooltipText('video')}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {/* Photo Post */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => openPostModal("photo")}
                  variant="secondary"
                  className="rounded-full h-12 w-12 shadow-lg flex items-center justify-center bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Camera className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p>{getTooltipText('photo')}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
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
      
      {/* Post creation modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className={cn(
          "sm:max-w-[550px]", 
          // For fullscreen modals on audio/video/photo
          (postType === "audio" || postType === "video" || postType === "photo") && "sm:max-w-[100vw] w-screen h-screen max-h-screen p-0"
        )}
        // The DialogTitle is included within each component to fix the accessibility warning
        aria-describedby="post-creation-description"
        >
          <div id="post-creation-description" className="sr-only">
            Use this form to create a new {postType} post for your followers.
          </div>
          
          {renderModalContent()}
        </DialogContent>
      </Dialog>
    </>
  );
}