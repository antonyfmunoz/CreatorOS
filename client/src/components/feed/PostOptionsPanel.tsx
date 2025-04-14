import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/hooks/use-auth";
import { ChevronRight, Users, MapPin, Eye, Share2, Hash, BarChart2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PostOptionsPanelProps {
  content: string;
  onContentChange: (content: string) => void;
}

export const PostOptionsPanel = ({ content, onContentChange }: PostOptionsPanelProps) => {
  const [postToThreads, setPostToThreads] = useState(true);
  const [postToFacebook, setPostToFacebook] = useState(true);
  const [addToStory, setAddToStory] = useState(false);
  const [isOptionsExpanded, setIsOptionsExpanded] = useState(false);
  const { user } = useAuth();
  
  // Sample location suggestions - in a real app these would be dynamic based on user location
  const suggestedLocations = [
    "Villa del Palmar Cancun Beach Resort",
    "Davino Restaurante"
  ];

  return (
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
        <div className="flex justify-between items-center" onClick={() => setIsOptionsExpanded(!isOptionsExpanded)}>
          <span className="font-medium">Post to</span>
          <ChevronRight 
            className={`h-5 w-5 text-muted-foreground transform transition-transform ${isOptionsExpanded ? 'rotate-90' : ''}`} 
          />
        </div>

        <div className={`space-y-3 mt-3 ${isOptionsExpanded ? 'block' : 'block'}`}>
          {/* User's CreatorOS profile (always available) */}
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                {user?.profileImageUrl ? (
                  <img src={user.profileImageUrl} alt={user.username} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs">{user?.username?.substring(0, 2).toUpperCase() || 'U'}</span>
                )}
              </div>
              <div className="flex flex-col">
                <span>@{user?.username || 'username'}</span>
                <span className="text-xs text-muted-foreground">CreatorOS · Public</span>
              </div>
            </div>
            <Switch
              checked={true}
              disabled={true}
            />
          </div>

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
            />
          </div>
        </div>
      </div>
    </div>
  );
};