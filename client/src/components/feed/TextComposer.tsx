import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { PostOptionsPanel } from "@/components/feed/PostOptionsPanel";
import { Loader2 } from "lucide-react";
import { DialogTitle } from "@/components/ui/dialog";

interface TextComposerProps {
  onClose: () => void;
}

export const TextComposer = ({ onClose }: TextComposerProps) => {
  const [content, setContent] = useState("");
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
      toast({
        title: 'Post created!',
        description: 'Your post has been successfully created.'
      });
      queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
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
    
    createPostMutation.mutate({
      userId: user.id,
      content,
      mediaType: 'text'
    });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-black text-white">
      <DialogTitle className="sr-only">Create New Post</DialogTitle>
      
      {/* Top Bar */}
      <div className="flex justify-between items-center p-4 border-b border-gray-800">
        <button 
          className="text-white" 
          onClick={onClose}
        >
          Cancel
        </button>
        <h2 className="text-lg font-medium text-white">New post</h2>
        <button 
          className="text-blue-500 font-medium"
          onClick={handleSubmit}
          disabled={createPostMutation.isPending || !content.trim()}
        >
          {createPostMutation.isPending ? "Sharing..." : "Share"}
        </button>
      </div>
      
      {/* Scrollable Container */}
      <div 
        ref={scrollContainerRef}
        className="flex-grow overflow-y-auto"
      >
        {/* X-Style Compose Area */}
        <div className="p-4 border-b border-gray-800">
          <textarea
            className="bg-transparent text-lg placeholder-gray-500 resize-none outline-none w-full min-h-[150px]"
            placeholder="What's happening?"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={createPostMutation.isPending}
          ></textarea>
          
          {/* Toolbar */}
          <div className="flex space-x-4 mt-4 text-gray-400 text-xl">
            <button>🅰️</button>
            <button>🖼️</button>
            <button>🚀</button>
            <button>🎥</button>
            <button>GIF</button>
            <button>📍</button>
          </div>
        </div>
        
        {/* Options Panel */}
        <PostOptionsPanel 
          content={content}
          onContentChange={setContent}
        />
      </div>
    </div>
  );
};