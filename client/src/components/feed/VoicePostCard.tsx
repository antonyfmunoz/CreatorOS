import { useState } from "react";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatDistanceToNow } from "date-fns";
import { MessageSquare, Heart, Bookmark, Share2, Play, Pause, ChevronDown, ChevronUp } from "lucide-react";

interface VoicePostCardProps {
  user: {
    id: number;
    name: string;
    username: string;
    avatar: string;
  };
  audioUrl: string;
  transcript: string;
  createdAt: string;
  likes: number;
  comments: number;
}

export function VoicePostCard({ user, audioUrl, transcript, createdAt, likes, comments }: VoicePostCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);
  const [audio] = useState(new Audio(audioUrl));
  
  const togglePlay = () => {
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };
  
  // Handle audio ending
  audio.onended = () => {
    setIsPlaying(false);
  };
  
  return (
    <Card className="mb-4 overflow-hidden">
      <CardHeader className="p-4 pb-2 flex flex-row items-center space-y-0">
        <Avatar className="h-10 w-10 mr-3">
          <AvatarImage src={user.avatar} alt={user.name} />
          <AvatarFallback>{user.name[0]}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <div className="font-semibold">{user.name}</div>
          <div className="text-sm text-gray-500">@{user.username} · {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}</div>
        </div>
      </CardHeader>
      
      <CardContent className="p-4 pt-2">
        {/* Audio Waveform Visualization */}
        <div className="relative h-16 bg-gray-100 dark:bg-gray-800 rounded-lg my-3 flex items-center px-3">
          {/* Play/Pause Button */}
          <Button 
            variant="outline" 
            size="icon" 
            className="h-10 w-10 rounded-full mr-3 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={togglePlay}
          >
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </Button>
          
          {/* Waveform Visualization (static for this demo) */}
          <div className="flex-1 flex items-center h-8 space-x-0.5">
            {Array(40).fill(0).map((_, i) => {
              // Create a random height for each bar to simulate a waveform
              const height = Math.random() * 100;
              return (
                <div 
                  key={i}
                  style={{ height: `${height}%` }}
                  className="w-1 bg-primary/60 rounded-sm"
                />
              );
            })}
          </div>
        </div>
        
        {/* Transcript Collapsible */}
        <Collapsible
          open={isTranscriptOpen}
          onOpenChange={setIsTranscriptOpen}
          className="border rounded-lg p-3 bg-gray-50 dark:bg-gray-900"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Transcript</span>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                {isTranscriptOpen ? 
                  <ChevronUp className="h-4 w-4" /> : 
                  <ChevronDown className="h-4 w-4" />
                }
              </Button>
            </CollapsibleTrigger>
          </div>
          
          <CollapsibleContent className="mt-2">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {transcript}
            </p>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
      
      <Separator />
      
      <CardFooter className="p-2 flex justify-between">
        <Button variant="ghost" size="sm" className="gap-1">
          <Heart className="h-4 w-4" />
          <span>{likes}</span>
        </Button>
        
        <Button variant="ghost" size="sm" className="gap-1">
          <MessageSquare className="h-4 w-4" />
          <span>{comments}</span>
        </Button>
        
        <Button variant="ghost" size="sm">
          <Bookmark className="h-4 w-4" />
        </Button>
        
        <Button variant="ghost" size="sm">
          <Share2 className="h-4 w-4" />
        </Button>
      </CardFooter>
    </Card>
  );
}