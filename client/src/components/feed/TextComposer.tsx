import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { PostOptionsPanel } from "@/components/feed/PostOptionsPanel";
import { Loader2, Type, Image, Rocket, Video, MapPin, ChevronLeft } from "lucide-react";
import { DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface TextComposerProps {
  onClose: () => void;
}

export const TextComposer = ({ onClose }: TextComposerProps) => {
  const [content, setContent] = useState("");
  const [showOptionsPanel, setShowOptionsPanel] = useState(false);
  const [addToStory, setAddToStory] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const createPostMutation = useMutation({
    mutationFn: async (postData: any) => {
      const res = await apiRequest('POST', '/api/posts', postData);
      return res.json();
    },
    onSuccess: () => {
      // No toast notification, just update the cache
      queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
      
      // If adding to story, also invalidate stories query to refresh immediately
      if (addToStory) {
        console.log('Post added to story, refreshing stories data');
        // Invalidate the cache first
        queryClient.invalidateQueries({ queryKey: ['/api/stories'] });
        
        // Force an immediate refetch to update the UI
        queryClient.refetchQueries({ queryKey: ['/api/stories'] });
      }
      
      onClose();
    },
    onError: (error) => {
      console.error('Error creating post:', error);
      toast({
        title: 'Error',
        description: 'Failed to create post. Please try again.',
        variant: 'destructive'
      });
    }
  });
  
  const handleSubmit = () => {
    if (!content.trim()) {
      toast({
        title: "Cannot Post",
        description: "Your post cannot be empty",
        variant: "destructive"
      });
      return;
    }
    
    if (!user) {
      toast({
        title: 'Authentication Required',
        description: 'Please log in to create a post.',
        variant: 'destructive'
      });
      return;
    }
    
    const postData: any = {
      userId: user.id,
      content,
      mediaType: 'text',
      addToStory: addToStory
    };
    
    createPostMutation.mutate(postData);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white text-foreground">
      <DialogTitle className="sr-only">Create New Post</DialogTitle>
      
      {/* Top Bar - Instagram-like header */}
      <div className="flex justify-between items-center p-4 border-b h-[58px]">
        <div className="w-10 h-6 flex items-center justify-center"></div> {/* Empty space matched to X button size */}
        <h2 className="text-lg font-medium">New post</h2>
        <div className="w-10 h-6"></div> {/* Empty space to balance the header */}
      </div>
      
      {/* Main content */}
      <div className="flex-grow overflow-hidden flex flex-col">
        {!showOptionsPanel && (
          <div className="flex-grow flex flex-col overflow-y-auto">
            {/* Compose Area */}
            <div className="p-4 flex-grow">
              <textarea
                className="bg-transparent text-lg placeholder-muted-foreground resize-none outline-none w-full h-full min-h-[200px]"
                placeholder="What's happening?"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                disabled={createPostMutation.isPending}
                autoFocus
              ></textarea>
            </div>
            
            {/* Media Toolbar */}
            <div className="border-t border-b p-2 flex justify-center space-x-8">
              <Button variant="ghost" size="icon" className="text-muted-foreground">
                <Type className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" className="text-muted-foreground">
                <Image className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" className="text-muted-foreground">
                <Rocket className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" className="text-muted-foreground">
                <Video className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" className="text-muted-foreground">
                <span className="text-sm font-bold">GIF</span>
              </Button>
              <Button variant="ghost" size="icon" className="text-muted-foreground">
                <MapPin className="h-5 w-5" />
              </Button>
            </div>
            
            {/* Options Menu Buttons */}
            <div className="space-y-2 p-4">
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full justify-between rounded-full text-sm h-9 py-2 px-4 bg-transparent"
                onClick={() => setShowOptionsPanel(true)}
              >
                <div className="flex items-center">
                  <span className="mr-2 text-muted-foreground">#</span>
                  <span>Hashtags</span>
                </div>
              </Button>
              
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full justify-between rounded-full text-sm h-9 py-2 px-4 bg-transparent"
                onClick={() => setShowOptionsPanel(true)}
              >
                <div className="flex items-center">
                  <span className="mr-2 text-muted-foreground">👤</span>
                  <span>Tag people</span>
                </div>
                <ChevronLeft className="h-4 w-4 rotate-180" />
              </Button>
              
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full justify-between rounded-full text-sm h-9 py-2 px-4 bg-transparent"
                onClick={() => setShowOptionsPanel(true)}
              >
                <div className="flex items-center">
                  <span className="mr-2 text-muted-foreground">📍</span>
                  <span>Add location</span>
                </div>
                <ChevronLeft className="h-4 w-4 rotate-180" />
              </Button>
            </div>
            
            {/* Share Button */}
            <div className="sticky bottom-0 w-full pt-2 pb-4 px-4 bg-white border-t">
              <Button 
                className="w-full rounded-md py-2 flex items-center justify-center bg-black text-white hover:bg-gray-900"
                onClick={handleSubmit}
                disabled={createPostMutation.isPending || !content.trim()}
              >
                {createPostMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sharing...
                  </>
                ) : "Share"}
              </Button>
            </div>
          </div>
        )}
        
        {/* Options Panel shown when showOptionsPanel is true */}
        {showOptionsPanel && (
          <div className="flex flex-col h-full">
            <div className="flex items-center p-3 border-b">
              <Button
                variant="ghost"
                size="sm"
                className="p-1 mr-3"
                onClick={() => setShowOptionsPanel(false)}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <h3 className="text-lg font-medium flex-grow text-center">Post options</h3>
              <div className="w-8"></div> {/* Spacer for centering title */}
            </div>
            
            {/* Updated Options Panel with onShare handler */}
            <div className="flex-grow overflow-auto">
              <PostOptionsPanel 
                content={content}
                onContentChange={setContent}
                onShare={handleSubmit}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};