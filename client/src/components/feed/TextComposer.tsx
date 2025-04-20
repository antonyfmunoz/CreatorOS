import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { 
  X, Hash, BarChart2, Users, MapPin, Eye, ChevronRight, Loader2,
  Twitter, Facebook, Instagram, Video, Youtube
} from "lucide-react";
import { DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface TextComposerProps {
  onClose: () => void;
}

export const TextComposer = ({ onClose }: TextComposerProps) => {
  const [content, setContent] = useState("");
  
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [addToStory, setAddToStory] = useState(false);
  const [audience, setAudience] = useState("everyone");
  
  // Social media connection states
  const [connectTwitter, setConnectTwitter] = useState(false);
  const [connectFacebook, setConnectFacebook] = useState(false);
  const [connectInstagram, setConnectInstagram] = useState(false);
  const [connectTikTok, setConnectTikTok] = useState(false);
  const [connectYouTube, setConnectYouTube] = useState(false);

  // Tag people state
  const [tagText, setTagText] = useState("");
  
  // Location state
  const [locationText, setLocationText] = useState("");
  
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
    
    // Gather social connections for metadata
    const socialConnections = {
      twitter: connectTwitter,
      facebook: connectFacebook,
      instagram: connectInstagram,
      tiktok: connectTikTok,
      youtube: connectYouTube
    };
    
    const postData = {
      userId: user.id,
      content,
      mediaType: 'text',
      addToStory: addToStory,
      // Add new metadata from the form
      metadata: {
        audience,
        taggedUsers: tagText ? tagText.split(',').map(t => t.trim()) : [],
        location: locationText,
        socialConnections
      }
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
        <h2 className="font-semibold text-base">New Post</h2>
        <div className="w-9"></div> {/* Empty spacer for alignment */}
      </div>

      {/* Main content area with scrolling */}
      <div className="flex-grow overflow-y-auto">
        {/* Container with max-width for better mobile alignment */}
        <div className="container max-w-lg mx-auto">
        
          {/* Text input area */}
          <div className="px-4 mb-5">
            <textarea
              className="w-full p-3 bg-gray-100 border-none rounded-xl resize-none focus:outline-none focus:ring-0 text-base"
              placeholder="What's on your mind?"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={createPostMutation.isPending}
              rows={5}
            />
          </div>
          
          {/* Quick actions */}
          <div className="flex px-4 gap-3 mb-3">
            <Button 
              variant="outline" 
              className="flex-1 rounded-full border border-gray-200 px-4 py-1 h-9 bg-white"
            >
              <Hash className="h-4 w-4 mr-1.5" />
              <span className="text-sm"># Hashtags</span>
            </Button>
            
            <Button 
              variant="outline" 
              className="flex-1 rounded-full border border-gray-200 px-4 py-1 h-9 bg-white"
            >
              <BarChart2 className="h-4 w-4 mr-1.5" />
              <span className="text-sm">Poll</span>
            </Button>
          </div>
          
          {/* Tag People */}
          <div className="field px-4 py-3 border-t border-gray-100">
            <label className="font-medium text-sm mb-2 block">Tag people</label>
            <input 
              type="text" 
              placeholder="Tag people..." 
              className="w-full p-2.5 border border-gray-200 rounded-lg bg-gray-50"
              value={tagText}
              onChange={(e) => setTagText(e.target.value)}
            />
          </div>
          
          {/* Add Location */}
          <div className="field px-4 py-3 border-t border-gray-100">
            <label className="font-medium text-sm mb-2 block">Add location</label>
            <input 
              type="text" 
              placeholder="Search for location..." 
              className="w-full p-2.5 border border-gray-200 rounded-lg bg-gray-50"
              value={locationText}
              onChange={(e) => setLocationText(e.target.value)}
            />
            
            {/* Location suggestions */}
            <div className="location-tags mt-2.5 flex flex-wrap gap-1.5 overflow-x-auto">
              {suggestedLocations.map(location => (
                <div 
                  key={location} 
                  className="tag-pill bg-gray-200 text-black px-3 py-1.5 rounded-full whitespace-nowrap text-xs cursor-pointer"
                  onClick={() => setLocationText(location)}
                >
                  {location}
                </div>
              ))}
            </div>
          </div>
          
          {/* Audience */}
          <div className="field px-4 py-3 border-t border-gray-100">
            <label className="font-medium text-sm mb-2 block">Audience</label>
            <Select value={audience} onValueChange={setAudience}>
              <SelectTrigger className="w-full bg-gray-50 border-gray-200 rounded-lg">
                <SelectValue placeholder="Select audience" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="everyone">Everyone</SelectItem>
                <SelectItem value="friends">Close Friends</SelectItem>
                <SelectItem value="private">Only Me</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* Social Media Connections */}
          <div className="post-to px-4 py-3 border-t border-gray-100 mt-4">
            <h3 className="font-semibold mb-3 text-base">Post to</h3>
            
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2.5">
                <input 
                  type="checkbox"
                  id="twitter" 
                  checked={connectTwitter} 
                  onChange={(e) => setConnectTwitter(e.target.checked)}
                  className="h-5 w-5 rounded border-gray-300"
                />
                <label htmlFor="twitter" className="flex items-center text-sm gap-2.5">
                  <Twitter className="h-4 w-4 text-blue-400" />
                  <span>Connect X (Twitter)</span>
                </label>
              </div>
              
              <div className="flex items-center gap-2.5">
                <input 
                  type="checkbox"
                  id="facebook" 
                  checked={connectFacebook} 
                  onChange={(e) => setConnectFacebook(e.target.checked)}
                  className="h-5 w-5 rounded border-gray-300"
                />
                <label htmlFor="facebook" className="flex items-center text-sm gap-2.5">
                  <Facebook className="h-4 w-4 text-blue-600" />
                  <span>Connect Facebook</span>
                </label>
              </div>
              
              <div className="flex items-center gap-2.5">
                <input 
                  type="checkbox"
                  id="instagram" 
                  checked={connectInstagram} 
                  onChange={(e) => setConnectInstagram(e.target.checked)}
                  className="h-5 w-5 rounded border-gray-300"
                />
                <label htmlFor="instagram" className="flex items-center text-sm gap-2.5">
                  <Instagram className="h-4 w-4 text-pink-500" />
                  <span>Connect Instagram</span>
                </label>
              </div>
              
              <div className="flex items-center gap-2.5">
                <input 
                  type="checkbox"
                  id="tiktok" 
                  checked={connectTikTok} 
                  onChange={(e) => setConnectTikTok(e.target.checked)}
                  className="h-5 w-5 rounded border-gray-300"
                />
                <label htmlFor="tiktok" className="flex items-center text-sm gap-2.5">
                  <Video className="h-4 w-4 text-black" />
                  <span>Connect TikTok</span>
                </label>
              </div>
              
              <div className="flex items-center gap-2.5">
                <input 
                  type="checkbox"
                  id="youtube" 
                  checked={connectYouTube} 
                  onChange={(e) => setConnectYouTube(e.target.checked)}
                  className="h-5 w-5 rounded border-gray-300"
                />
                <label htmlFor="youtube" className="flex items-center text-sm gap-2.5">
                  <Youtube className="h-4 w-4 text-red-600" />
                  <span>Connect YouTube</span>
                </label>
              </div>
            </div>
          </div>
          
          {/* Add to Story Option */}
          <div className="story-toggle px-4 py-3 border-t border-gray-100 mt-2">
            <div className="flex items-center gap-2.5">
              <input 
                type="checkbox"
                id="add-story" 
                checked={addToStory} 
                onChange={(e) => setAddToStory(e.target.checked)}
                className="h-5 w-5 rounded border-gray-300"
              />
              <label htmlFor="add-story" className="text-sm">
                Add to Your Story
              </label>
            </div>
          </div>
        </div>
      </div>
      
      {/* Share Button - Fixed to bottom */}
      <div className="sticky bottom-0 left-0 right-0 p-4 bg-white border-t mt-auto">
        <button 
          className="share-button w-full py-3.5 rounded-xl font-semibold text-base bg-black text-white flex items-center justify-center"
          onClick={handleSubmit}
          disabled={createPostMutation.isPending || !content.trim()}
        >
          {createPostMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sharing...
            </>
          ) : "Share"}
        </button>
      </div>
    </div>
  );
};