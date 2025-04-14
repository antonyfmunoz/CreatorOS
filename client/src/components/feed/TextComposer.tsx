import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

interface TextComposerProps {
  onClose: () => void;
}

export const TextComposer = ({ onClose }: TextComposerProps) => {
  const [content, setContent] = useState("");
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
    <div className="flex flex-col h-full bg-background text-foreground">
      {/* Top Bar */}
      <div className="flex justify-between items-center mb-4">
        <button 
          className="text-sm" 
          onClick={onClose}
        >
          Cancel
        </button>
        <button 
          className="bg-primary text-primary-foreground text-sm px-4 py-1 rounded-full"
          onClick={handleSubmit}
          disabled={createPostMutation.isPending || !content.trim()}
        >
          {createPostMutation.isPending ? "Posting..." : "Post"}
        </button>
      </div>

      {/* Input Area */}
      <textarea
        className="bg-transparent text-lg placeholder-muted-foreground resize-none outline-none w-full flex-grow"
        placeholder="What's happening?"
        rows={6}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        disabled={createPostMutation.isPending}
      ></textarea>

      {/* Toolbar */}
      <div className="flex space-x-4 mt-4 text-primary text-xl">
        <button>🅰️</button>
        <button>🖼️</button>
        <button>🚀</button>
        <button>🎥</button>
        <button>GIF</button>
        <button>📍</button>
      </div>
    </div>
  );
};