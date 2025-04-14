import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";

interface PostOptionsPanelProps {
  content: string;
  onContentChange: (content: string) => void;
}

export const PostOptionsPanel = ({ content, onContentChange }: PostOptionsPanelProps) => {
  const [isBoostEnabled, setIsBoostEnabled] = useState(false);
  const [isScheduleEnabled, setIsScheduleEnabled] = useState(false);
  const { user } = useAuth();
  
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onContentChange(e.target.value);
  };
  
  // Sample location suggestions - in a real app these would be dynamic based on user location
  const suggestedLocations = [
    "Garza Blanca Cancun",
    "Garza Blanca Resort",
    "Villa del Palmar"
  ];

  return (
    <div className="flex flex-col space-y-6 px-4 py-6 text-sm bg-background text-foreground">
      {/* Audience */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <span className="text-lg">👁️</span>
          <span>Audience</span>
        </div>
        <button className="text-muted-foreground">Everyone ➤</button>
      </div>

      {/* Also Share On */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <span className="text-lg">↗️</span>
          <span>Also share on…</span>
        </div>
        <button className="text-muted-foreground">2 profiles ➤</button>
      </div>

      {/* Active Linked Profiles */}
      <div className="text-muted-foreground text-xs">
        <span className="mr-2">@{user?.username || 'username'}</span>
        <span className="mr-2">•</span>
        <span className="mr-2">Facebook · {user?.displayName || 'Display Name'}</span>
      </div>

      {/* Optional Caption or Text Entry */}
      <Textarea
        placeholder="Add a caption..."
        className="w-full mt-4 bg-transparent resize-none min-h-[80px]"
        value={content}
        onChange={handleContentChange}
      />

      {/* Poll (without AI prompt) */}
      <div className="flex space-x-4 mt-2">
        <button className="bg-muted px-3 py-1 rounded-full">Poll</button>
      </div>

      {/* Tag People */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <span>🖼️</span>
          <span>Tag people</span>
        </div>
        <button className="text-muted-foreground">➤</button>
      </div>

      {/* Location Tag */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <span>📍</span>
          <span>Add location</span>
        </div>
        <button className="text-muted-foreground">➤</button>
      </div>

      {/* Suggested Location Chips */}
      <div className="flex flex-wrap gap-2 text-sm">
        {suggestedLocations.map(loc => (
          <span
            key={loc}
            className="bg-muted px-3 py-1 rounded-full text-sm"
          >
            {loc}
          </span>
        ))}
      </div>

      {/* Monetization */}
      <div className="mt-6 space-y-4">
        <h3 className="text-muted-foreground text-xs uppercase">Ads and monetization</h3>

        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <span>📈</span>
            <span>Boost post</span>
          </div>
          <Switch
            checked={isBoostEnabled}
            onCheckedChange={setIsBoostEnabled}
            aria-label="Toggle boost post"
          />
        </div>

        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <span>🤝</span>
            <span>Partnership label & ads</span>
          </div>
          <button className="text-muted-foreground">➤</button>
        </div>
      </div>

      {/* Schedule Post */}
      <div className="mt-6 space-y-2">
        <h3 className="text-muted-foreground text-xs uppercase">Sharing preferences</h3>

        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <span>⏰</span>
            <span>Schedule this post</span>
          </div>
          <Switch
            checked={isScheduleEnabled}
            onCheckedChange={setIsScheduleEnabled}
            aria-label="Toggle schedule post"
          />
        </div>
        
        {isScheduleEnabled && (
          <div className="mt-2 p-3 border border-border rounded-md">
            <Label className="block mb-2">Schedule for</Label>
            <input 
              type="datetime-local" 
              className="bg-background border border-input rounded-md p-2 w-full"
              min={new Date().toISOString().slice(0, 16)}
            />
          </div>
        )}
      </div>
    </div>
  );
};