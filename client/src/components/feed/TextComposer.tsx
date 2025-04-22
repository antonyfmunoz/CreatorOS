import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { 
  Loader2, 
  ChevronRight, 
  Eye, 
  BarChart2, 
  ChevronDown,
  MapPin,
  Users
} from "lucide-react";
import { DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

interface TextComposerProps {
  onClose: () => void;
}

export const TextComposer = ({ onClose }: TextComposerProps) => {
  const [content, setContent] = useState("");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isPostToExpanded, setIsPostToExpanded] = useState(true);
  const [addToStory, setAddToStory] = useState(false);
  
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const handleConnectPlatform = () => {
    toast({
      title: "Connect Platform",
      description: "Platform connection would be handled here"
    });
  };
  
  const createPostMutation = useMutation({
    mutationFn: async (postData: any) => {
      const res = await apiRequest('POST', '/api/posts', postData);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: 'Post created!',
        description: 'Your post has been successfully shared.'
      });
      queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
      
      if (addToStory) {
        queryClient.invalidateQueries({ queryKey: ['/api/stories'] });
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
    
    createPostMutation.mutate({
      userId: user.id,
      content,
      mediaType: 'text',
      addToStory
    });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white text-foreground">
      <DialogTitle className="sr-only">Create New Post</DialogTitle>
      
      {/* Top Bar */}
      <div className="flex justify-between items-center px-4 py-4 border-b">
        <button 
          className="text-foreground" 
          onClick={onClose}
        >
          Cancel
        </button>
        <h2 className="text-lg font-medium">New post</h2>
        <Button 
          variant="ghost" 
          size="sm"
          onClick={handleSubmit}
          disabled={createPostMutation.isPending || !content.trim()}
          className="text-primary font-medium"
        >
          {createPostMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sharing...
            </>
          ) : "Share"}
        </Button>
      </div>
      
      {/* Scrollable Container */}
      <div 
        ref={scrollContainerRef}
        className="flex-grow overflow-y-auto flex flex-col"
      >
        {/* Caption Input */}
        <div className="p-4 border-b">
          <textarea
            className="bg-transparent text-lg placeholder-muted-foreground resize-none outline-none w-full min-h-[120px]"
            placeholder="What's happening?"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={createPostMutation.isPending}
          ></textarea>
        </div>
        
        {/* Poll Button */}
        <div className="mx-4 my-3 w-[calc(100%-2rem)]">
          <div className="flex items-center justify-start rounded-full bg-gray-100 py-2.5 px-4">
            <BarChart2 className="h-5 w-5 mr-2.5" />
            <span className="text-[15px]">Poll</span>
          </div>
        </div>
        
        {/* Options exactly matching screenshot */}
        <div className="flex-grow flex flex-col">
          {/* Tag people */}
          <div className="flex items-center justify-between px-5 py-4 border-t">
            <div className="flex items-center">
              <Users className="h-[22px] w-[22px] mr-3" />
              <span>Tag people</span>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </div>
          
          {/* Tag product */}
          <div className="flex items-center justify-between px-5 py-4 border-t">
            <div className="flex items-center">
              {/* Product tag icon */}
              <div className="h-[22px] w-[22px] mr-3">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
                  <path d="M3 9H21" stroke="currentColor" strokeWidth="2" />
                  <path d="M9 21V9" stroke="currentColor" strokeWidth="2" />
                </svg>
              </div>
              <span>Tag product</span>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </div>
          
          {/* Add location */}
          <div className="flex items-center justify-between px-5 py-4 border-t">
            <div className="flex items-center">
              <MapPin className="h-[22px] w-[22px] mr-3" />
              <span>Add location</span>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </div>
          
          {/* Audience */}
          <div className="flex items-center justify-between px-5 py-4 border-t">
            <div className="flex items-center">
              <Eye className="h-[22px] w-[22px] mr-3" />
              <span>Audience</span>
            </div>
            <div className="flex items-center">
              <span className="text-muted-foreground mr-2">Everyone</span>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </div>
          </div>
          
          {/* Post to header with border */}
          <div className="border-t">
            <div className="flex items-center justify-between px-5 py-4 cursor-pointer" onClick={() => setIsPostToExpanded(!isPostToExpanded)}>
              <span className="font-medium">Post to</span>
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            </div>
            
            {isPostToExpanded && (
              <div className="space-y-4 pb-4">
                {/* X (Twitter) */}
                <div className="flex justify-between items-center px-5">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-neutral-800 rounded-full flex items-center justify-center text-white">
                      <span className="text-md font-bold">𝕏</span>
                    </div>
                    <div>
                      <div className="text-sm">Connect X (Twitter)</div>
                      <div className="text-xs text-muted-foreground">Connect to share posts</div>
                    </div>
                  </div>
                  <Button 
                    variant="outline"
                    size="sm"
                    className="rounded-full px-3 py-1 h-7"
                    onClick={handleConnectPlatform}
                  >
                    Connect
                  </Button>
                </div>
                
                {/* Facebook */}
                <div className="flex justify-between items-center px-5">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white">
                      <span className="text-xl font-bold">f</span>
                    </div>
                    <div>
                      <div className="text-sm">Connect Facebook</div>
                      <div className="text-xs text-muted-foreground">Connect to share posts</div>
                    </div>
                  </div>
                  <Button 
                    variant="outline"
                    size="sm"
                    className="rounded-full px-3 py-1 h-7"
                    onClick={handleConnectPlatform}
                  >
                    Connect
                  </Button>
                </div>
                
                {/* Instagram */}
                <div className="flex justify-between items-center px-5">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-gradient-to-tr from-purple-600 via-pink-500 to-orange-400 rounded-full flex items-center justify-center">
                      <div className="w-7 h-7 bg-white rounded-full flex items-center justify-center">
                        <div className="w-5 h-5 border-2 rounded-full border-current"></div>
                      </div>
                    </div>
                    <div>
                      <div className="text-sm">Connect Instagram</div>
                      <div className="text-xs text-muted-foreground">Connect to share posts</div>
                    </div>
                  </div>
                  <Button 
                    variant="outline"
                    size="sm"
                    className="rounded-full px-3 py-1 h-7"
                    onClick={handleConnectPlatform}
                  >
                    Connect
                  </Button>
                </div>
                
                {/* TikTok */}
                <div className="flex justify-between items-center px-5">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center text-white">
                      <span className="text-lg">♪</span>
                    </div>
                    <div>
                      <div className="text-sm">Connect TikTok</div>
                      <div className="text-xs text-muted-foreground">Connect to share posts</div>
                    </div>
                  </div>
                  <Button 
                    variant="outline"
                    size="sm"
                    className="rounded-full px-3 py-1 h-7"
                    onClick={handleConnectPlatform}
                  >
                    Connect
                  </Button>
                </div>
                
                {/* YouTube */}
                <div className="flex justify-between items-center px-5">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center text-white">
                      <span className="text-sm">▶</span>
                    </div>
                    <div>
                      <div className="text-sm">Connect YouTube</div>
                      <div className="text-xs text-muted-foreground">Connect to share posts</div>
                    </div>
                  </div>
                  <Button 
                    variant="outline"
                    size="sm"
                    className="rounded-full px-3 py-1 h-7"
                    onClick={handleConnectPlatform}
                  >
                    Connect
                  </Button>
                </div>
                
                {/* Your story */}
                <div className="flex justify-between items-center px-5 pt-2">
                  <div className="flex items-center space-x-3">
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M17 8L12 3L7 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M12 3V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span>Your story</span>
                  </div>
                  <Switch 
                    checked={addToStory}
                    onCheckedChange={setAddToStory}
                  />
                </div>
              </div>
            )}
          </div>
          
          {/* Spacer to push the share button to the bottom */}
          <div className="flex-grow"></div>
          
          {/* Share Button */}
          <div className="sticky bottom-0 w-full py-4 px-4 bg-white border-t">
            <button
              className="w-full bg-black text-white h-11 rounded py-2.5 font-medium"
              onClick={handleSubmit}
              disabled={createPostMutation.isPending || !content.trim()}
            >
              {createPostMutation.isPending ? "Sharing..." : "Share"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};