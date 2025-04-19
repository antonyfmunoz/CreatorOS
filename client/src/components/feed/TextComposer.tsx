import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { X } from "lucide-react";
import { DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PostOptionsPanel } from "./PostOptionsPanel";

interface TextComposerProps {
  onClose: () => void;
}

export const TextComposer = ({ onClose }: TextComposerProps) => {
  const [content, setContent] = useState("");
  
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [addToStory, setAddToStory] = useState(false);

  const createPostMutation = useMutation({
    mutationFn: async (postData: any) => {
      const res = await apiRequest('POST', '/api/posts', postData);
      return res.json();
    },
    onSuccess: () => {
      // No toast notification, just update the cache
      queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
      
      // If post was added to story, refresh stories data
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
    
    const postData = {
      userId: user.id,
      content,
      mediaType: 'text',
      addToStory: addToStory
    };
    
    createPostMutation.mutate(postData);
  };

  return (
    <div className="flex flex-col w-full h-[100vh] bg-white text-foreground">
      <DialogTitle className="sr-only">Create New Text Post</DialogTitle>
      
      {/* Top bar - exactly like photo uploader */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-white z-50">
        <Button 
          variant="ghost" 
          size="icon" 
          className="rounded-full h-8 w-8" 
          onClick={onClose}
        >
          <X className="h-5 w-5" />
        </Button>
        <span className="font-semibold text-lg">
          New post
        </span>
        <div className="w-8"></div> {/* Spacer for centering title */}
      </div>

      {/* Main content area - will grow to fill available space */}
      <div className="flex-grow overflow-auto">
        <div className="flex flex-col w-full p-4">
          <DialogDescription className="text-center text-gray-500 mb-4">
            Create a text post to share with your followers.
          </DialogDescription>
          
          {/* Text input area */}
          <div className="mb-6 w-full">
            <textarea
              className="w-full p-4 min-h-[200px] bg-background border border-gray-200 rounded-md resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="What's on your mind?"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={createPostMutation.isPending}
            />
          </div>
          
          {/* Options panel */}
          <div className="pb-24"> {/* Add padding at bottom for scrolling */}
            <PostOptionsPanel 
              content={content}
              onContentChange={setContent}
              onShare={handleSubmit}
            />
          </div>
        </div>
      </div>
    </div>
  );
};