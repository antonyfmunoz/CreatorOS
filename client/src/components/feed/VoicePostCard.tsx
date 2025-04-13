import { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, MessageSquare, Heart, Share2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { formatDistanceToNow } from 'date-fns';

interface VoicePostUser {
  id: number;
  name: string;
  username: string;
  avatar?: string;
}

interface VoicePostCardProps {
  user: VoicePostUser;
  audioUrl: string;
  transcript?: string;
  createdAt: string | Date;
  likes?: number;
  comments?: number;
}

export const VoicePostCard = ({
  user,
  audioUrl,
  transcript,
  createdAt,
  likes = 0,
  comments = 0
}: VoicePostCardProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationRef = useRef<number | null>(null);

  // Format the created date
  const formattedDate = typeof createdAt === 'string' 
    ? formatDistanceToNow(new Date(createdAt), { addSuffix: true })
    : formatDistanceToNow(createdAt, { addSuffix: true });

  useEffect(() => {
    // Initialize audio element
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    
    // Set up event listeners
    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration);
    });
    
    audio.addEventListener('ended', () => {
      setIsPlaying(false);
      setProgress(0);
      cancelAnimationFrame(animationRef.current as number);
    });
    
    // Clean up on unmount
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [audioUrl]);

  const togglePlayPause = () => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.pause();
      cancelAnimationFrame(animationRef.current as number);
    } else {
      audioRef.current.play();
      animationRef.current = requestAnimationFrame(updateProgress);
    }
    
    setIsPlaying(!isPlaying);
  };

  const updateProgress = () => {
    if (!audioRef.current) return;
    
    const value = (audioRef.current.currentTime / duration) * 100;
    setProgress(value);
    
    if (audioRef.current.currentTime < duration) {
      animationRef.current = requestAnimationFrame(updateProgress);
    }
  };
  
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Card className="mb-4 overflow-hidden">
      <CardHeader className="p-4 pb-0">
        <div className="flex items-center">
          <Avatar className="h-10 w-10 mr-3">
            <AvatarImage src={user.avatar} alt={user.name} />
            <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
          </Avatar>
          <div>
            <div className="font-medium">{user.name}</div>
            <div className="text-sm text-gray-500">
              @{user.username} · {formattedDate}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 mb-3">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={togglePlayPause}
              className="h-12 w-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center"
            >
              {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </button>
            
            <div className="flex-1 mx-4">
              {/* Audio waveform visualization (simplified) */}
              <div className="relative h-8">
                <div className="absolute inset-0 bg-gray-200 dark:bg-gray-700 rounded-full">
                  <div 
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="absolute inset-0 flex items-center justify-between px-2">
                  {/* Create some fake bars to simulate waveform */}
                  {Array.from({ length: 40 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-1 w-1 bg-gray-400 rounded-full transform"
                      style={{
                        height: `${Math.random() * 100}%`,
                        opacity: progress > (i / 40) * 100 ? 0.8 : 0.3,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
            
            <div className="text-sm text-gray-500 w-16 text-right">
              {formatTime(duration * (progress / 100))} / {formatTime(duration)}
            </div>
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowTranscript(!showTranscript)}
            className="text-xs"
          >
            {showTranscript ? 'Hide Transcript' : 'Show Transcript'}
          </Button>
        </div>
        
        {showTranscript && transcript && (
          <div className="mt-2 text-sm p-3 bg-muted rounded-md">
            {transcript}
          </div>
        )}
      </CardContent>
      <CardFooter className="p-4 pt-0 flex justify-between">
        <Button variant="ghost" size="sm" className="text-gray-500 hover:text-gray-700">
          <Heart className="h-4 w-4 mr-1" />
          <span>{likes}</span>
        </Button>
        <Button variant="ghost" size="sm" className="text-gray-500 hover:text-gray-700">
          <MessageSquare className="h-4 w-4 mr-1" />
          <span>{comments}</span>
        </Button>
        <Button variant="ghost" size="sm" className="text-gray-500 hover:text-gray-700">
          <Share2 className="h-4 w-4 mr-1" />
          <span>Share</span>
        </Button>
      </CardFooter>
    </Card>
  );
};