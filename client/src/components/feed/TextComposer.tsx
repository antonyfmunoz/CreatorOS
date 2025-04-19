import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { 
  X, Hash, BarChart2, Users, MapPin, Eye, ChevronRight, Loader2
} from "lucide-react";
import { DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface TextComposerProps {
  onClose: () => void;
}

export const TextComposer = ({ onClose }: TextComposerProps) => {
  const [content, setContent] = useState("");
  
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [addToStory, setAddToStory] = useState(false);

  // Sample location suggestions - in a real app these would be dynamic
  const suggestedLocations = [
    "Villa del Palmar Cancun Beach Resort",
    "Davino Restaurante"
  ];

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
    <div className="flex flex-col w-full h-full bg-white">
      <DialogTitle className="sr-only">New Text Post</DialogTitle>
      
      {/* Top bar with X and title */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <Button 
          variant="ghost" 
          size="icon" 
          className="p-1 h-9 w-9" 
          onClick={onClose}
        >
          <X className="h-5 w-5" />
        </Button>
        <h2 className="font-semibold text-base">New post</h2>
        <div className="w-9"></div> {/* Empty spacer for alignment */}
      </div>

      {/* Main content area with scrolling */}
      <div className="flex-grow overflow-y-auto">
        {/* Description */}
        <p className="text-center text-gray-500 text-sm py-4">
          Create a text post to share with your followers.
        </p>
        
        {/* Text input area */}
        <div className="px-4 mb-5">
          <textarea
            className="w-full p-3 bg-white border border-gray-200 rounded-md resize-none focus:outline-none focus:ring-0 text-base"
            placeholder="What's on your mind?"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={createPostMutation.isPending}
            rows={6}
          />
        </div>
        
        {/* Quick actions */}
        <div className="flex px-4 gap-3 mb-3">
          <Button 
            variant="outline" 
            className="rounded-full border border-gray-200 px-4 py-1 h-8"
          >
            <Hash className="h-4 w-4 mr-1.5" />
            <span className="text-sm">Hashtags</span>
          </Button>
          
          <Button 
            variant="outline" 
            className="rounded-full border border-gray-200 px-4 py-1 h-8"
          >
            <BarChart2 className="h-4 w-4 mr-1.5" />
            <span className="text-sm">Poll</span>
          </Button>
        </div>
        
        {/* Tag People */}
        <div className="flex justify-between items-center px-4 py-3 border-t border-gray-100">
          <div className="flex items-center">
            <Users className="h-5 w-5 mr-3 text-black" />
            <span>Tag people</span>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-400" />
        </div>
        
        {/* Add Location */}
        <div className="flex justify-between items-center px-4 py-3 border-t border-gray-100">
          <div className="flex items-center">
            <MapPin className="h-5 w-5 mr-3 text-black" />
            <span>Add location</span>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-400" />
        </div>
        
        {/* Location suggestions */}
        <div className="px-4 pb-2 flex gap-2 overflow-x-auto">
          {suggestedLocations.map(location => (
            <div 
              key={location} 
              className="bg-gray-100 text-black px-3 py-1 rounded-full whitespace-nowrap text-sm"
            >
              {location}
            </div>
          ))}
        </div>
        
        {/* Audience */}
        <div className="flex justify-between items-center px-4 py-3 border-t border-gray-100">
          <div className="flex items-center">
            <Eye className="h-5 w-5 mr-3 text-black" />
            <span>Audience</span>
          </div>
          <div className="flex items-center">
            <span className="text-gray-500 mr-2 text-sm">Everyone</span>
            <ChevronRight className="h-5 w-5 text-gray-400" />
          </div>
        </div>
      </div>
      
      {/* Share Button - Fixed to bottom */}
      <div className="sticky bottom-0 left-0 right-0 p-4 bg-white border-t mt-auto">
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