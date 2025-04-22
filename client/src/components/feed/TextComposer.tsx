import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { 
  Loader2, 
  Type, 
  Image, 
  Rocket, 
  Video, 
  MapPin, 
  Users, 
  ChevronRight, 
  Eye, 
  BarChart2, 
  ChevronDown,
  Share2
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
  
  // Connect platform handler
  const handleConnectPlatform = (platform: string) => {
    console.log(`Connecting to ${platform}...`);
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
      
      // If adding to story, also invalidate stories query
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
    <div className="flex flex-col h-full overflow-hidden bg-background text-foreground">
      <DialogTitle className="sr-only">Create New Post</DialogTitle>
      
      {/* Top Bar */}
      <div className="flex justify-between items-center p-4 border-b">
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
        className="flex-grow overflow-y-auto"
      >
        {/* Compose Area */}
        <div className="p-4 border-b">
          <textarea
            className="bg-transparent text-lg placeholder-muted-foreground resize-none outline-none w-full min-h-[150px]"
            placeholder="What's happening?"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={createPostMutation.isPending}
          ></textarea>
          
          {/* Toolbar */}
          <div className="flex space-x-4 mt-4 text-muted-foreground">
            <Button variant="ghost" size="icon">
              <Image className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon">
              <Type className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon">
              <Rocket className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon">
              <Video className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon">
              <span className="text-sm font-bold">GIF</span>
            </Button>
            <Button variant="ghost" size="icon">
              <MapPin className="h-5 w-5" />
            </Button>
          </div>
        </div>
        
        {/* Poll Button - Round gray container */}
        <div className="px-4 py-3">
          <div className="w-full rounded-full bg-gray-100 py-2.5 px-4 flex items-center">
            <BarChart2 className="h-4 w-4 mr-2.5" />
            <span className="text-sm">Poll</span>
          </div>
        </div>
        
        {/* Instagram-style options - EXACTLY matched to screenshot */}
        <div>
          {/* Tag People Option */}
          <div className="flex justify-between items-center px-4 py-3.5 border-t">
            <div className="flex items-center">
              <Users className="h-5 w-5 mr-3" />
              <span>Tag people</span>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </div>
          
          {/* Tag Product Option */}
          <div className="flex justify-between items-center px-4 py-3.5 border-t">
            <div className="flex items-center">
              <svg 
                width="20" 
                height="20" 
                viewBox="0 0 24 24" 
                fill="none" 
                xmlns="http://www.w3.org/2000/svg"
                className="mr-3"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
                <path d="M3 9H21" stroke="currentColor" strokeWidth="2" />
                <path d="M9 21V9" stroke="currentColor" strokeWidth="2" />
              </svg>
              <span>Tag product</span>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </div>
          
          {/* Add Location Option */}
          <div className="flex justify-between items-center px-4 py-3.5 border-t">
            <div className="flex items-center">
              <MapPin className="h-5 w-5 mr-3" />
              <span>Add location</span>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </div>
          
          {/* Audience Option */}
          <div className="flex justify-between items-center px-4 py-3.5 border-t">
            <div className="flex items-center">
              <Eye className="h-5 w-5 mr-3" />
              <span>Audience</span>
            </div>
            <div className="flex items-center">
              <span className="text-muted-foreground mr-2">Everyone</span>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </div>
          </div>
          
          {/* Post to section */}
          <div className="border-t">
            <div 
              className="flex justify-between items-center px-4 py-3.5 cursor-pointer" 
              onClick={() => setIsPostToExpanded(!isPostToExpanded)}
            >
              <span className="font-medium">Post to</span>
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            </div>
            
            {isPostToExpanded && (
              <div className="space-y-4 pb-4">
                {/* X (Twitter) */}
                <div className="flex justify-between items-center px-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center text-white font-semibold text-sm">
                      𝕏
                    </div>
                    <div>
                      <div>Connect X (Twitter)</div>
                      <div className="text-xs text-muted-foreground">Connect to share posts</div>
                    </div>
                  </div>
                  <Button 
                    variant="outline"
                    size="sm"
                    className="rounded-full px-3 py-1 h-7"
                    onClick={() => handleConnectPlatform('X')}
                  >
                    Connect
                  </Button>
                </div>
                
                {/* Facebook */}
                <div className="flex justify-between items-center px-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-lg">
                      f
                    </div>
                    <div>
                      <div>Connect Facebook</div>
                      <div className="text-xs text-muted-foreground">Connect to share posts</div>
                    </div>
                  </div>
                  <Button 
                    variant="outline"
                    size="sm"
                    className="rounded-full px-3 py-1 h-7"
                    onClick={() => handleConnectPlatform('Facebook')}
                  >
                    Connect
                  </Button>
                </div>
                
                {/* Instagram */}
                <div className="flex justify-between items-center px-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-600 via-pink-500 to-orange-400 flex items-center justify-center">
                      <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center">
                        <div className="w-4 h-4 rounded-full border-2 border-current"></div>
                      </div>
                    </div>
                    <div>
                      <div>Connect Instagram</div>
                      <div className="text-xs text-muted-foreground">Connect to share posts</div>
                    </div>
                  </div>
                  <Button 
                    variant="outline"
                    size="sm"
                    className="rounded-full px-3 py-1 h-7"
                    onClick={() => handleConnectPlatform('Instagram')}
                  >
                    Connect
                  </Button>
                </div>
                
                {/* TikTok */}
                <div className="flex justify-between items-center px-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center text-white">
                      <span>♪</span>
                    </div>
                    <div>
                      <div>Connect TikTok</div>
                      <div className="text-xs text-muted-foreground">Connect to share posts</div>
                    </div>
                  </div>
                  <Button 
                    variant="outline"
                    size="sm"
                    className="rounded-full px-3 py-1 h-7"
                    onClick={() => handleConnectPlatform('TikTok')}
                  >
                    Connect
                  </Button>
                </div>
                
                {/* YouTube */}
                <div className="flex justify-between items-center px-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center text-white">
                      <span>▶</span>
                    </div>
                    <div>
                      <div>Connect YouTube</div>
                      <div className="text-xs text-muted-foreground">Connect to share posts</div>
                    </div>
                  </div>
                  <Button 
                    variant="outline"
                    size="sm"
                    className="rounded-full px-3 py-1 h-7"
                    onClick={() => handleConnectPlatform('YouTube')}
                  >
                    Connect
                  </Button>
                </div>
                
                {/* Your Story */}
                <div className="flex justify-between items-center px-4 pt-1">
                  <div className="flex items-center space-x-3">
                    <Share2 className="h-5 w-5" />
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
        </div>
        
        {/* Share Button */}
        <div className="sticky bottom-0 w-full px-4 py-3 bg-white border-t mt-auto">
          <Button
            className="w-full bg-black text-white hover:bg-gray-900 h-11 rounded-md font-medium"
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
    </div>
  );
};