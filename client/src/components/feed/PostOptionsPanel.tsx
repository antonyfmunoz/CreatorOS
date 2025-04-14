import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { ChevronRight, Users, MapPin, Music, BrainCircuit, Eye, Search, Share2, MoreHorizontal, Hash, BarChart2, Search as SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PostOptionsPanelProps {
  content: string;
  onContentChange: (content: string) => void;
}

export const PostOptionsPanel = ({ content, onContentChange }: PostOptionsPanelProps) => {
  const [isAILabelEnabled, setIsAILabelEnabled] = useState(false);
  const [isTrialEnabled, setIsTrialEnabled] = useState(false);
  const [postToThreads, setPostToThreads] = useState(true);
  const [postToFacebook, setPostToFacebook] = useState(true);
  const [addToStory, setAddToStory] = useState(false);
  const [isOptionsExpanded, setIsOptionsExpanded] = useState(false);
  const { user } = useAuth();
  
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onContentChange(e.target.value);
  };
  
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

      {/* Rename Audio (show only for audio posts) */}
      <div className="flex justify-between items-center px-4 py-3 border-b border-border">
        <div className="flex items-center space-x-2">
          <Music className="h-5 w-5" />
          <span>Rename audio</span>
        </div>
        <div className="flex items-center">
          <span className="text-muted-foreground mr-2">Original audio</span>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </div>
      </div>

      {/* AI Label */}
      <div className="flex justify-between items-center px-4 py-3 border-b border-border">
        <div className="flex flex-col">
          <div className="flex items-center space-x-2">
            <BrainCircuit className="h-5 w-5" />
            <span>Add AI Label</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 ml-7">
            We require you to label certain realistic content that's made with AI. 
            <span className="text-primary ml-1">Learn more</span>
          </p>
        </div>
        <Switch
          checked={isAILabelEnabled}
          onCheckedChange={setIsAILabelEnabled}
        />
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

      {/* Trial */}
      <div className="flex justify-between items-center px-4 py-3 border-b border-border">
        <div className="flex items-center space-x-2">
          <Search className="h-5 w-5" />
          <div className="flex items-center">
            <span>Trial</span>
            <span className="ml-2 text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">NEW</span>
          </div>
        </div>
        <Switch
          checked={isTrialEnabled}
          onCheckedChange={setIsTrialEnabled}
        />
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
          {/* User's profiles */}
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
                <span className="text-xs text-muted-foreground">Threads · Public</span>
              </div>
            </div>
            <Switch
              checked={postToThreads}
              onCheckedChange={setPostToThreads}
            />
          </div>

          {/* Facebook profile */}
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center overflow-hidden">
                <span className="text-white text-lg">f</span>
              </div>
              <div className="flex flex-col">
                <span>{user?.displayName || 'Display Name'}</span>
                <span className="text-xs text-muted-foreground">Facebook · Public</span>
              </div>
            </div>
            <Switch
              checked={postToFacebook}
              onCheckedChange={setPostToFacebook}
            />
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

      {/* More options */}
      <div className="flex justify-between items-center px-4 py-3 border-b border-border">
        <div className="flex items-center space-x-2">
          <MoreHorizontal className="h-5 w-5" />
          <span>More options</span>
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground" />
      </div>

      {/* Bottom action buttons */}
      <div className="flex px-4 py-3 space-x-3 mt-auto">
        <Button variant="outline" className="w-1/2">
          Save draft
        </Button>
        <Button className="w-1/2">
          Share
        </Button>
      </div>
    </div>
  );
};