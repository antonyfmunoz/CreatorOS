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
  Share2,
  ShoppingBag
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
    toast({
      title: `Connect to ${platform}`,
      description: `Connecting to ${platform} would open OAuth flow in a real implementation.`
    });
  };
  
  const handleOpenTagPeople = () => {
    console.log("Opening tag people");
    toast({
      title: "Tag People",
      description: "Tag people feature would open here"
    });
  };
  
  const handleOpenTagProducts = () => {
    console.log("Opening tag products");
    toast({
      title: "Tag Products",
      description: "Tag products feature would open here"
    });
  };
  
  const handleOpenLocationPicker = () => {
    console.log("Opening location picker");
    toast({
      title: "Add Location",
      description: "Add location feature would open here"
    });
  };
  
  const handleOpenAudiencePicker = () => {
    console.log("Opening audience picker");
    toast({
      title: "Audience Settings",
      description: "Audience settings would open here"
    });
  };
  
  const handleOpenPollCreator = () => {
    console.log("Opening poll creator");
    toast({
      title: "Create Poll",
      description: "Poll creation feature would open here"
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
        
        {/* This section is the EXACT match of PhotoUploader.tsx layout */}
        <div className="space-y-0">
          {/* Poll Button */}
          <button 
            type="button"
            className="mx-4 mt-3 mb-2 w-[calc(100%-32px)] flex items-center gap-2 px-4 py-2.5 rounded-full text-sm bg-gray-100 cursor-pointer"
            onClick={handleOpenPollCreator}
          >
            <BarChart2 className="w-4 h-4" /> Poll
          </button>
            
          {/* Tag people, products, location, audience */}
          <div className="space-y-0 border-t">
            {/* Tag people option - EXACT match */}
            <button 
              type="button"
              className="flex items-center justify-between w-full py-3 px-4 bg-transparent border-none cursor-pointer"
              onClick={handleOpenTagPeople}
            >
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5" />
                <span>Tag people</span>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
            
            {/* Tag product button - EXACT match */}
            <button 
              type="button"
              className="flex items-center justify-between w-full py-3 px-4 bg-transparent border-none cursor-pointer border-t"
              onClick={handleOpenTagProducts}
            >
              <div className="flex items-center gap-3">
                <ShoppingBag className="w-5 h-5" />
                <span>Tag product</span>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
            
            {/* Add location option - EXACT match */}
            <button 
              type="button"
              className="flex items-center justify-between w-full py-3 px-4 bg-transparent border-none cursor-pointer border-t"
              onClick={handleOpenLocationPicker}
            >
              <div className="flex items-center gap-3">
                <MapPin className="w-5 h-5" />
                <span>Add location</span>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
            
            {/* Audience option - EXACT match */}
            <div 
              className="flex items-center justify-between w-full py-3 px-4 cursor-pointer border-t"
              onClick={handleOpenAudiencePicker}
            >
              <div className="flex items-center gap-3">
                <Eye className="w-5 h-5" />
                <span>Audience</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Everyone</span>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </div>
            </div>
          </div>
            
          {/* Post to section - EXACT match */}
          <div className="border-t">
            <div 
              className="flex items-center justify-between px-4 py-3.5 cursor-pointer" 
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
                    <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center text-white">
                      <span className="text-sm font-bold">𝕏</span>
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
                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">
                      <span className="text-lg">f</span>
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
                  
                {/* Your Story - EXACT match */}
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
        
        {/* Share Button - EXACT match */}
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