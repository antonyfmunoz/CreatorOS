import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { 
  Loader2, Users, BarChart2, ChevronRight, 
  MapPin, Eye, ShoppingBag, X 
} from "lucide-react";
import { DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface TextComposerProps {
  onClose: () => void;
}

export const TextComposer = ({ onClose }: TextComposerProps) => {
  const [content, setContent] = useState("");
  const [addToStory, setAddToStory] = useState(false);
  const [isPostToExpanded, setIsPostToExpanded] = useState(true);
  const [selectedLocation, setSelectedLocation] = useState<null | {name: string}>(null);
  
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
    
    // Add location if selected
    if (selectedLocation) {
      postData.location = selectedLocation.name;
    }
    
    createPostMutation.mutate(postData);
  };

  return (
    <div className="flex flex-col w-full h-full bg-white text-foreground">
      <DialogTitle className="sr-only">Create New Post</DialogTitle>
      
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
      
      {/* Content Area */}
      <div className="flex-grow overflow-auto px-4 py-4">
        {/* Text input for content */}
        <textarea
          className="w-full p-3 bg-background border border-gray-200 rounded resize-none mb-4 min-h-[120px]"
          placeholder="What's on your mind?"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={createPostMutation.isPending}
        />
        
        {/* Options Section */}
        <div className="space-y-4">
          {/* Poll Button */}
          <div className="mb-4">
            <Button 
              variant="outline" 
              size="default" 
              className="rounded-full w-full justify-start border border-gray-200 font-normal py-2.5"
            >
              <BarChart2 className="h-5 w-5 mr-3 text-gray-700" />
              <span>Poll</span>
            </Button>
          </div>
          
          {/* Tag People */}
          <div className="flex justify-between items-center py-2.5">
            <div className="flex items-center">
              <Users className="h-5 w-5 mr-3 text-gray-700" />
              <span>Tag people</span>
            </div>
            <ChevronRight className="h-5 w-5 text-gray-400" />
          </div>
          
          {/* Tag Product */}
          <div className="flex justify-between items-center py-2.5 border-t border-gray-100">
            <div className="flex items-center">
              <ShoppingBag className="h-5 w-5 mr-3 text-gray-700" />
              <span>Tag product</span>
            </div>
            <ChevronRight className="h-5 w-5 text-gray-400" />
          </div>
          
          {/* Add Location */}
          <div className="flex justify-between items-center py-2.5 border-t border-gray-100">
            <div className="flex items-center">
              <MapPin className="h-5 w-5 mr-3 text-gray-700" />
              <span>Add location</span>
            </div>
            <ChevronRight className="h-5 w-5 text-gray-400" />
          </div>
          
          {/* Audience */}
          <div className="flex justify-between items-center py-2.5 border-t border-gray-100">
            <div className="flex items-center">
              <Eye className="h-5 w-5 mr-3 text-gray-700" />
              <span>Audience</span>
            </div>
            <div className="flex items-center">
              <span className="text-gray-500 mr-2">Everyone</span>
              <ChevronRight className="h-5 w-5 text-gray-400" />
            </div>
          </div>
        </div>
      
        {/* Post to section */}
        <div className="py-3 border-t border-gray-100">
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
                  <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center">
                    <span className="text-white font-bold">𝕏</span>
                  </div>
                  <div>
                    <p className="text-sm font-normal">Connect X (Twitter)</p>
                    <p className="text-xs text-gray-500">Connect to share posts</p>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="rounded-full"
                  onClick={() => toast({
                    title: "Connect X",
                    description: "Authentication required to link your X account."
                  })}
                >
                  Connect
                </Button>
              </div>
              
              {/* Facebook */}
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold">f</span>
                  </div>
                  <div>
                    <p className="text-sm font-normal">Connect Facebook</p>
                    <p className="text-xs text-gray-500">Connect to share posts</p>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="rounded-full"
                  onClick={() => toast({
                    title: "Connect Facebook",
                    description: "Authentication required to link your Facebook account."
                  })}
                >
                  Connect
                </Button>
              </div>
              
              {/* Instagram */}
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-gradient-to-tr from-purple-600 via-pink-500 to-yellow-500 rounded-full flex items-center justify-center">
                    <span className="text-white">📷</span>
                  </div>
                  <div>
                    <p className="text-sm font-normal">Connect Instagram</p>
                    <p className="text-xs text-gray-500">Connect to share posts</p>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="rounded-full"
                  onClick={() => toast({
                    title: "Connect Instagram",
                    description: "Authentication required to link your Instagram account."
                  })}
                >
                  Connect
                </Button>
              </div>
              
              {/* TikTok */}
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center">
                    <span className="text-white">♪</span>
                  </div>
                  <div>
                    <p className="text-sm font-normal">Connect TikTok</p>
                    <p className="text-xs text-gray-500">Connect to share posts</p>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="rounded-full"
                  onClick={() => toast({
                    title: "Connect TikTok",
                    description: "Authentication required to link your TikTok account."
                  })}
                >
                  Connect
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Share Button - Exactly matching the photo uploader */}
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
  );
};