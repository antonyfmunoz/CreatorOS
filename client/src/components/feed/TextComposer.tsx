import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, Users, BarChart2, ChevronRight, MapPin, Eye, ShoppingBag } from "lucide-react";
import { DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface TextComposerProps {
  onClose: () => void;
}

export const TextComposer = ({ onClose }: TextComposerProps) => {
  const [content, setContent] = useState("");
  const [addToStory, setAddToStory] = useState(false);
  const [isPostToExpanded, setIsPostToExpanded] = useState(true);
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
  
  // These handlers would initiate OAuth flows with each platform
  const handleConnectPlatform = (platform: string) => {
    console.log(`Connecting to ${platform}...`);
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <DialogTitle className="sr-only">Create New Post</DialogTitle>
      
      {/* Product Tagging Box */}
      <div className="mx-5 my-4 px-4 py-3 rounded-lg bg-white border border-gray-200 shadow-sm">
        <h3 className="text-base font-semibold">Product tagging</h3>
        <p className="text-gray-600 text-sm">Product tagging feature coming soon!</p>
      </div>
      
      {/* Poll Button */}
      <div className="mx-5 mb-4">
        <Button 
          variant="outline" 
          size="default" 
          className="rounded-full w-full justify-start border border-gray-200 font-normal py-3"
        >
          <BarChart2 className="h-5 w-5 mr-3 text-gray-500" />
          <span>Poll</span>
        </Button>
      </div>
      
      {/* Tag People */}
      <div className="flex justify-between items-center px-5 py-3">
        <div className="flex items-center">
          <Users className="h-5 w-5 mr-3 text-gray-800" />
          <span>Tag people</span>
        </div>
        <ChevronRight className="h-5 w-5 text-gray-400" />
      </div>
      
      {/* Tag Product */}
      <div className="flex justify-between items-center px-5 py-3 border-t border-gray-100">
        <div className="flex items-center">
          <ShoppingBag className="h-5 w-5 mr-3 text-gray-800" />
          <span>Tag product</span>
        </div>
        <ChevronRight className="h-5 w-5 text-gray-400" />
      </div>
      
      {/* Add Location */}
      <div className="flex justify-between items-center px-5 py-3 border-t border-gray-100">
        <div className="flex items-center">
          <MapPin className="h-5 w-5 mr-3 text-gray-800" />
          <span>Add location</span>
        </div>
        <ChevronRight className="h-5 w-5 text-gray-400" />
      </div>
      
      {/* Audience */}
      <div className="flex justify-between items-center px-5 py-3 border-t border-gray-100">
        <div className="flex items-center">
          <Eye className="h-5 w-5 mr-3 text-gray-800" />
          <span>Audience</span>
        </div>
        <div className="flex items-center">
          <span className="text-gray-500 mr-2">Everyone</span>
          <ChevronRight className="h-5 w-5 text-gray-400" />
        </div>
      </div>
      
      {/* Post to section */}
      <div className="px-5 py-3 border-t border-gray-100">
        <div 
          className="flex justify-between items-center mb-3" 
          onClick={() => setIsPostToExpanded(!isPostToExpanded)}
          role="button"
          aria-expanded={isPostToExpanded}
        >
          <span className="font-medium">Post to</span>
          <ChevronRight 
            className={`h-5 w-5 text-gray-400 transform transition-transform ${isPostToExpanded ? 'rotate-90' : ''}`} 
          />
        </div>

        {isPostToExpanded && (
          <div className="space-y-4">
            {/* X/Twitter */}
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-xl">𝕏</span>
                </div>
                <div>
                  <p className="font-normal">Connect X (Twitter)</p>
                  <p className="text-xs text-gray-500">Connect to share posts</p>
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="rounded-full px-4 h-8"
                onClick={() => handleConnectPlatform('twitter')}
              >
                Connect
              </Button>
            </div>
            
            {/* Facebook */}
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-xl">f</span>
                </div>
                <div>
                  <p className="font-normal">Connect Facebook</p>
                  <p className="text-xs text-gray-500">Connect to share posts</p>
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="rounded-full px-4 h-8"
                onClick={() => handleConnectPlatform('facebook')}
              >
                Connect
              </Button>
            </div>
            
            {/* Instagram */}
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-tr from-purple-600 via-pink-500 to-yellow-500 rounded-full flex items-center justify-center">
                  <span className="text-white">📷</span>
                </div>
                <div>
                  <p className="font-normal">Connect Instagram</p>
                  <p className="text-xs text-gray-500">Connect to share posts</p>
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="rounded-full px-4 h-8"
                onClick={() => handleConnectPlatform('instagram')}
              >
                Connect
              </Button>
            </div>
            
            {/* TikTok */}
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center">
                  <span className="text-white">♪</span>
                </div>
                <div>
                  <p className="font-normal">Connect TikTok</p>
                  <p className="text-xs text-gray-500">Connect to share posts</p>
                </div>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="rounded-full px-4 h-8"
                onClick={() => handleConnectPlatform('tiktok')}
              >
                Connect
              </Button>
            </div>
          </div>
        )}
      </div>
      
      {/* Share Button - Exactly matching the image */}
      <div className="sticky bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 mt-auto">
        <Button 
          className="w-full rounded-md py-2.5 flex items-center justify-center bg-gray-500 text-white hover:bg-gray-600"
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
  );
};