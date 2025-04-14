import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { PostOptionsPanel } from "@/components/feed/PostOptionsPanel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";

interface TextComposerProps {
  onClose: () => void;
}

export const TextComposer = ({ onClose }: TextComposerProps) => {
  const [content, setContent] = useState("");
  const [activeTab, setActiveTab] = useState<"compose" | "options">("compose");
  
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
      <div className="flex justify-between items-center p-4 border-b">
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
          {createPostMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Posting...
            </>
          ) : "Post"}
        </button>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "compose" | "options")}>
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="compose">Compose</TabsTrigger>
          <TabsTrigger value="options">Options</TabsTrigger>
        </TabsList>
        
        <TabsContent value="compose" className="p-4">
          {/* X-Style Compose Area */}
          <div className="flex flex-col">
            <textarea
              className="bg-transparent text-lg placeholder-muted-foreground resize-none outline-none w-full min-h-[200px]"
              placeholder="What's happening?"
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
        </TabsContent>
        
        <TabsContent value="options">
          <PostOptionsPanel 
            content={content}
            onContentChange={setContent}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};