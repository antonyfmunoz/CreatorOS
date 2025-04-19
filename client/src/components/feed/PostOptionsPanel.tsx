import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/use-auth";
import { ChevronRight, Users, MapPin, Eye, Share2, Hash, BarChart2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PostOptionsPanelProps {
  content: string;
  onContentChange: (content: string) => void;
  onShare?: () => void; // Add optional onShare prop
}

export const PostOptionsPanel = ({ content, onContentChange, onShare }: PostOptionsPanelProps) => {
  // These are placeholders until we have real connection status from the API
  const [addToStory, setAddToStory] = useState(false);
  // Default to true to show the connection options 
  const [isOptionsExpanded, setIsOptionsExpanded] = useState(true);
  
  // These handlers would initiate OAuth flows with each platform
  const handleConnectPlatform = (platform: string) => {
    // In a real implementation, this would redirect to the platform's OAuth page
    console.log(`Connecting to ${platform}...`);
    // Example of how this would work:
    // window.location.href = `https://api.${platform}.com/oauth/authorize?client_id=${process.env.CLIENT_ID}&redirect_uri=${window.location.origin}/auth/callback&scope=read_user,write_post`;
  };
  const { user } = useAuth();
  
  // Sample location suggestions - in a real app these would be dynamic based on user location
  const suggestedLocations = [
    "Villa del Palmar Cancun Beach Resort",
    "Davino Restaurante"
  ];

  const handleShareClick = () => {
    if (onShare) {
      onShare();
    }
  };

  return (
    <div className="flex flex-col min-h-full relative">
      <div className="flex-grow overflow-auto">
        <div className="flex flex-col space-y-2 px-0 py-0 text-sm bg-background text-foreground">
          {/* Option Buttons */}
          <div className="flex space-x-2 border-b border-border pb-3 px-4 pt-2">
            <Button variant="outline" size="sm" className="rounded-full flex items-center">
              <Hash className="h-4 w-4 mr-1" /> Hashtags
            </Button>
            <Button variant="outline" size="sm" className="rounded-full flex items-center">
              <BarChart2 className="h-4 w-4 mr-1" /> Poll
            </Button>
          </div>

          {/* Tag People */}
          <div className="flex justify-between items-center px-4 py-3 border-b border-border">
            <div className="flex items-center space-x-2">
              <Users className="h-5 w-5" />
              <span>Tag people</span>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </div>

          {/* Location Tag */}
          <div className="flex justify-between items-center px-4 py-3 border-b border-border">
            <div className="flex items-center space-x-2">
              <MapPin className="h-5 w-5" />
              <span>Add location</span>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </div>

          {/* Suggested Location Chips */}
          <div className="flex gap-2 text-sm px-4 py-1 overflow-x-auto">
            {suggestedLocations.map(loc => (
              <span
                key={loc}
                className="bg-muted px-3 py-1 rounded-full text-sm whitespace-nowrap"
              >
                {loc}
              </span>
            ))}
          </div>

          {/* Audience */}
          <div className="flex justify-between items-center px-4 py-3 border-b border-border">
            <div className="flex items-center space-x-2">
              <Eye className="h-5 w-5" />
              <span>Audience</span>
            </div>
            <div className="flex items-center">
              <span className="text-muted-foreground mr-2">Everyone</span>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </div>
          </div>

          {/* Post to section */}
          <div className="px-4 py-3 border-b border-border">
            <div 
              className="flex justify-between items-center cursor-pointer" 
              onClick={() => setIsOptionsExpanded(!isOptionsExpanded)}
              role="button"
              aria-expanded={isOptionsExpanded}
              aria-controls="post-to-options"
            >
              <span className="font-medium">Post to</span>
              <ChevronRight 
                className={`h-5 w-5 text-muted-foreground transform transition-transform ${isOptionsExpanded ? 'rotate-90' : ''}`} 
              />
            </div>

            <div id="post-to-options" className={`space-y-3 mt-3 ${isOptionsExpanded ? 'block' : 'hidden'}`}>

              {/* X/Twitter - Not connected */}
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-full bg-neutral-200 flex items-center justify-center overflow-hidden">
                    <span className="text-neutral-500 font-bold">𝕏</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="flex items-center">
                      <span className="text-muted-foreground">Connect X (Twitter)</span>
                    </span>
                    <span className="text-xs text-muted-foreground">Connect to share posts</span>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="rounded-full px-3 py-1 h-auto text-xs"
                  aria-label="Connect to X (Twitter)"
                  onClick={() => handleConnectPlatform('twitter')}
                >
                  Connect
                </Button>
              </div>

              {/* Facebook - Not connected */}
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center overflow-hidden">
                    <span className="text-blue-600 text-lg font-bold">f</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="flex items-center">
                      <span className="text-muted-foreground">Connect Facebook</span>
                    </span>
                    <span className="text-xs text-muted-foreground">Connect to share posts</span>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="rounded-full px-3 py-1 h-auto text-xs"
                  aria-label="Connect to Facebook"
                  onClick={() => handleConnectPlatform('facebook')}
                >
                  Connect
                </Button>
              </div>

              {/* Instagram - Not connected */}
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-600 via-pink-500 to-orange-400 flex items-center justify-center overflow-hidden">
                    <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center">
                      <div className="w-4 h-4 rounded-full border-2 border-current"></div>
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <span className="flex items-center">
                      <span className="text-muted-foreground">Connect Instagram</span>
                    </span>
                    <span className="text-xs text-muted-foreground">Connect to share posts</span>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="rounded-full px-3 py-1 h-auto text-xs"
                  aria-label="Connect to Instagram"
                  onClick={() => handleConnectPlatform('instagram')}
                >
                  Connect
                </Button>
              </div>

              {/* TikTok - Not connected */}
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center overflow-hidden">
                    <span className="text-white text-lg">♪</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="flex items-center">
                      <span className="text-muted-foreground">Connect TikTok</span>
                    </span>
                    <span className="text-xs text-muted-foreground">Connect to share posts</span>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="rounded-full px-3 py-1 h-auto text-xs"
                  aria-label="Connect to TikTok"
                  onClick={() => handleConnectPlatform('tiktok')}
                >
                  Connect
                </Button>
              </div>

              {/* YouTube - Not connected */}
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center overflow-hidden">
                    <span className="text-red-600 text-lg">▶</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="flex items-center">
                      <span className="text-muted-foreground">Connect YouTube</span>
                    </span>
                    <span className="text-xs text-muted-foreground">Connect to share posts</span>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="rounded-full px-3 py-1 h-auto text-xs"
                  aria-label="Connect to YouTube"
                  onClick={() => handleConnectPlatform('youtube')}
                >
                  Connect
                </Button>
              </div>

              {/* Your story */}
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-2">
                  <Share2 className="h-5 w-5" />
                  <span>Your story</span>
                </div>
                <Switch
                  checked={addToStory}
                  onCheckedChange={setAddToStory}
                  aria-label="Add to your story"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Sticky Share Button at bottom of screen */}
      <div className="sticky bottom-0 w-full pt-2 pb-4 px-4 bg-white border-t">
        <Button 
          className="w-full rounded-md py-2 flex items-center justify-center bg-black text-white hover:bg-gray-900"
          onClick={handleShareClick}
        >
          Share
        </Button>
      </div>
    </div>
  );
};