import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { X, Loader2 } from "lucide-react";
import { DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PostOptionsPanel } from "./PostOptionsPanel";

interface TextComposerProps {
  onClose: () => void;
}

export const TextComposer = ({ onClose }: TextComposerProps) => {
  const [content, setContent] = useState("");
  const [addToStory, setAddToStory] = useState(false);
  
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // Reference for the scrollable container
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
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
        queryClient.invalidateQueries({ queryKey: ['/api/stories'] });
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

  // Use a taller textarea to force scrolling like in the photo uploader
  const textareaHeight = "180px";

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      <DialogTitle className="sr-only">Create New Text Post</DialogTitle>
      
      {/* Top Bar - Instagram-like header */}
      <div className="flex justify-between items-center p-4 border-b h-[58px]">
        <Button 
          variant="ghost" 
          size="icon" 
          className="rounded-full h-8 w-8" 
          onClick={onClose}
        >
          <X className="h-5 w-5" />
        </Button>
        <h2 className="text-lg font-medium">New post</h2>
        <div className="w-8"></div> {/* Spacer for centering title */}
      </div>
      
      {/* Scrollable Content - with ref for scrolling */}
      <div 
        ref={scrollContainerRef}
        className="flex-grow overflow-y-auto relative"
      >
        {/* Caption input */}
        <div className="p-4 border-b">
          <textarea
            className="w-full p-3 bg-background border border-border rounded resize-none"
            placeholder="Write a caption..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={createPostMutation.isPending}
            style={{ minHeight: textareaHeight }}
          />
        </div>
        
        {/* Options panel */}
        <div className="pb-32"> {/* Add extra padding to ensure content is scrollable */}
          <PostOptionsPanel 
            content={content}
            onContentChange={setContent}
            onShare={handleSubmit}
          />
        </div>
      </div>
    </div>
  );
};