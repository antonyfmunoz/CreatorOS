import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { ChevronRight } from "lucide-react";

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
    <div className="flex flex-col space-y-2 px-0 py-0 text-sm bg-black text-white">
      {/* Option Buttons */}
      <div className="flex space-x-2 border-b border-gray-800 pb-3 px-4 pt-2">
        <button className="bg-gray-800 px-4 py-2 rounded-full flex items-center justify-center">
          <span className="mr-1">#</span> Hashtags
        </button>
        <button className="bg-gray-800 px-4 py-2 rounded-full flex items-center justify-center">
          <span className="mr-1">☰</span> Poll
        </button>
        <button className="bg-gray-800 px-4 py-2 rounded-full flex items-center justify-center">
          <span className="mr-1">🔍</span> Prompt
        </button>
      </div>

      {/* Tag People */}
      <div className="flex justify-between items-center px-4 py-3 border-b border-gray-800">
        <div className="flex items-center space-x-2">
          <span className="text-xl">👤</span>
          <span>Tag people</span>
        </div>
        <ChevronRight className="h-5 w-5 text-gray-500" />
      </div>

      {/* Location Tag */}
      <div className="flex justify-between items-center px-4 py-3 border-b border-gray-800">
        <div className="flex items-center space-x-2">
          <span className="text-xl">📍</span>
          <span>Add location</span>
        </div>
        <ChevronRight className="h-5 w-5 text-gray-500" />
      </div>

      {/* Suggested Location Chips */}
      <div className="flex gap-2 text-sm px-4 py-1 overflow-x-auto">
        {suggestedLocations.map(loc => (
          <span
            key={loc}
            className="bg-gray-800 px-3 py-1 rounded-full text-sm whitespace-nowrap"
          >
            {loc}
          </span>
        ))}
      </div>

      {/* Rename Audio (show only for audio posts) */}
      <div className="flex justify-between items-center px-4 py-3 border-b border-gray-800">
        <div className="flex items-center space-x-2">
          <span className="text-xl">🎵</span>
          <span>Rename audio</span>
        </div>
        <div className="flex items-center">
          <span className="text-gray-500 mr-2">Original audio</span>
          <ChevronRight className="h-5 w-5 text-gray-500" />
        </div>
      </div>

      {/* AI Label */}
      <div className="flex justify-between items-center px-4 py-3 border-b border-gray-800">
        <div className="flex flex-col">
          <div className="flex items-center space-x-2">
            <span className="text-xl">🤖</span>
            <span>Add AI Label</span>
          </div>
          <p className="text-xs text-gray-500 mt-1 ml-7">
            We require you to label certain realistic content that's made with AI. 
            <span className="text-blue-400 ml-1">Learn more</span>
          </p>
        </div>
        <Switch
          checked={isAILabelEnabled}
          onCheckedChange={setIsAILabelEnabled}
          className="data-[state=checked]:bg-blue-500"
        />
      </div>

      {/* Audience */}
      <div className="flex justify-between items-center px-4 py-3 border-b border-gray-800">
        <div className="flex items-center space-x-2">
          <span className="text-xl">👁️</span>
          <span>Audience</span>
        </div>
        <div className="flex items-center">
          <span className="text-gray-500 mr-2">Everyone</span>
          <ChevronRight className="h-5 w-5 text-gray-500" />
        </div>
      </div>

      {/* Trial */}
      <div className="flex justify-between items-center px-4 py-3 border-b border-gray-800">
        <div className="flex items-center space-x-2">
          <span className="text-xl">🔍</span>
          <div className="flex items-center">
            <span>Trial</span>
            <span className="ml-2 text-xs bg-blue-500 px-2 py-0.5 rounded-full">NEW</span>
          </div>
        </div>
        <Switch
          checked={isTrialEnabled}
          onCheckedChange={setIsTrialEnabled}
          className="data-[state=checked]:bg-blue-500"
        />
      </div>

      {/* Post to section */}
      <div className="px-4 py-3 border-b border-gray-800">
        <div className="flex justify-between items-center" onClick={() => setIsOptionsExpanded(!isOptionsExpanded)}>
          <span className="font-medium">Post to</span>
          <ChevronRight 
            className={`h-5 w-5 text-gray-500 transform transition-transform ${isOptionsExpanded ? 'rotate-90' : ''}`} 
          />
        </div>

        <div className={`space-y-3 mt-3 ${isOptionsExpanded ? 'block' : 'block'}`}>
          {/* User's profiles */}
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center overflow-hidden">
                {user?.profileImageUrl ? (
                  <img src={user.profileImageUrl} alt={user.username} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs">{user?.username?.substring(0, 2).toUpperCase() || 'U'}</span>
                )}
              </div>
              <div className="flex flex-col">
                <span>@{user?.username || 'username'}</span>
                <span className="text-xs text-gray-500">Threads · Public</span>
              </div>
            </div>
            <Switch
              checked={postToThreads}
              onCheckedChange={setPostToThreads}
              className="data-[state=checked]:bg-blue-500"
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
                <span className="text-xs text-gray-500">Facebook · Public</span>
              </div>
            </div>
            <Switch
              checked={postToFacebook}
              onCheckedChange={setPostToFacebook}
              className="data-[state=checked]:bg-blue-500"
            />
          </div>

          {/* Your story */}
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <span className="text-xl">📱</span>
              <span>Your story</span>
            </div>
            <Switch
              checked={addToStory}
              onCheckedChange={setAddToStory}
              className="data-[state=checked]:bg-blue-500"
            />
          </div>
        </div>
      </div>

      {/* More options */}
      <div className="flex justify-between items-center px-4 py-3 border-b border-gray-800">
        <div className="flex items-center space-x-2">
          <span className="text-xl">⋯</span>
          <span>More options</span>
        </div>
        <ChevronRight className="h-5 w-5 text-gray-500" />
      </div>

      {/* Bottom action buttons */}
      <div className="flex px-4 py-3 space-x-3 mt-auto">
        <button className="w-1/2 py-2 border border-gray-600 rounded-md text-center">
          Save draft
        </button>
        <button className="w-1/2 py-2 bg-blue-600 rounded-md text-center">
          Share
        </button>
      </div>
    </div>
  );
};