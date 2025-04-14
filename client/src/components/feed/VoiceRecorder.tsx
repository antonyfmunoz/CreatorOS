import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Progress } from "@/components/ui/progress";
import { PostOptionsPanel } from "@/components/feed/PostOptionsPanel";
import { Button } from "@/components/ui/button";
import { Loader2, Mic } from "lucide-react";
import { DialogTitle } from "@/components/ui/dialog";

interface VoiceRecorderProps {
  onClose: () => void;
}

export const VoiceRecorder = ({ onClose }: VoiceRecorderProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [content, setContent] = useState("");

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Start recording automatically when component mounts
  useEffect(() => {
    startRecording();
    return () => {
      stopRecording();
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, []);

  // Update timer when recording
  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isRecording]);

  // Handle audio playback
  useEffect(() => {
    if (!audioRef.current || !audioUrl) return;
    
    const audio = audioRef.current;
    
    const handleEnded = () => {
      setIsPlaying(false);
    };
    
    audio.addEventListener('ended', handleEnded);
    return () => {
      audio.removeEventListener('ended', handleEnded);
    };
  }, [audioUrl]);

  // Update audio element when playing state changes
  useEffect(() => {
    if (!audioRef.current) return;
    
    if (isPlaying) {
      audioRef.current.play().catch(err => {
        console.error("Error playing audio:", err);
        setIsPlaying(false);
      });
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      
      chunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setAudioBlob(audioBlob);
        
        // Create audio URL for playback
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
      };
      
      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      toast({
        title: 'Microphone Error',
        description: 'Could not access your microphone. Please check your permissions.',
        variant: 'destructive'
      });
      onClose();
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }
    }
  };
  
  const togglePlayback = () => {
    setIsPlaying(!isPlaying);
  };

  const createPostMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch('/api/posts/media', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      
      if (!res.ok) {
        throw new Error('Failed to create post');
      }
      
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: 'Voice message sent!',
        description: 'Your voice message has been posted.'
      });
      queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
      onClose();
    },
    onError: (error) => {
      console.error('Error creating voice post:', error);
      toast({
        title: 'Error',
        description: 'Failed to send voice message. Please try again.',
        variant: 'destructive'
      });
    }
  });

  const handleSend = () => {
    if (!audioBlob) {
      toast({
        title: 'No Recording',
        description: 'Please record something first.',
        variant: 'destructive'
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

    const formData = new FormData();
    formData.append('userId', user.id.toString());
    formData.append('content', content || 'Voice message');
    formData.append('audio', audioBlob, 'recording.webm');
    formData.append('mediaType', 'audio');
    
    createPostMutation.mutate(formData);
  };

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-black text-white">
      <DialogTitle className="sr-only">Create New Voice Post</DialogTitle>
      
      {/* Top Bar */}
      <div className="flex justify-between items-center p-4 border-b border-gray-800">
        <button className="text-white" onClick={onClose}>Cancel</button>
        <h2 className="text-lg font-medium text-white">Voice Message</h2>
        <button 
          className="text-blue-500 font-medium"
          onClick={handleSend}
          disabled={createPostMutation.isPending || !audioBlob}
        >
          {createPostMutation.isPending ? "Sharing..." : "Share"}
        </button>
      </div>
      
      {/* Scrollable Container */}
      <div 
        ref={scrollContainerRef}
        className="flex-grow overflow-y-auto"
      >
        {/* Recording/Playback Area */}
        <div className="flex flex-col items-center justify-center py-8 px-4 border-b border-gray-800">
          {isRecording ? (
            <div className="flex flex-col items-center space-y-4">
              <div className="w-24 h-24 rounded-full bg-blue-500 flex items-center justify-center animate-pulse">
                <Mic className="h-12 w-12 text-white" />
              </div>
              <div className="text-center">
                <div className="text-2xl font-medium">{formatTime(recordingTime)}</div>
                <div className="text-gray-400">Recording...</div>
              </div>
              <Button 
                onClick={stopRecording} 
                variant="destructive"
                className="mt-4"
              >
                Stop Recording
              </Button>
            </div>
          ) : audioUrl ? (
            <div className="flex flex-col items-center space-y-4 w-full max-w-md">
              <audio ref={audioRef} src={audioUrl} className="hidden" />
              
              <div 
                className={`w-24 h-24 rounded-full ${isPlaying ? 'bg-blue-500/80' : 'bg-blue-500'} flex items-center justify-center cursor-pointer`}
                onClick={togglePlayback}
              >
                <span className="text-3xl text-white">{isPlaying ? '❚❚' : '▶'}</span>
              </div>
              
              <div className="text-center">
                <div className="text-xl font-medium">{formatTime(recordingTime)}</div>
                <div className="text-gray-400">
                  {isPlaying ? 'Playing...' : 'Tap to play'}
                </div>
              </div>
              
              <Button
                variant="outline"
                onClick={() => {
                  setAudioBlob(null);
                  setAudioUrl(null);
                  setIsPlaying(false);
                  setRecordingTime(0);
                  if (audioRef.current) {
                    audioRef.current.pause();
                  }
                  startRecording();
                }}
                disabled={createPostMutation.isPending}
                className="mt-4 border-gray-700 text-white hover:bg-gray-800"
              >
                Record Again
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center space-y-4">
              <Button 
                onClick={startRecording} 
                className="bg-blue-500 hover:bg-blue-600 text-white"
              >
                Start Recording
              </Button>
            </div>
          )}
        </div>
        
        {/* Caption input - only show if recording is complete */}
        {audioBlob && (
          <div className="p-4 border-b border-gray-800">
            <input
              type="text"
              className="w-full p-3 bg-transparent border border-gray-700 rounded text-white"
              placeholder="Add caption (optional)"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={createPostMutation.isPending}
            />
          </div>
        )}
        
        {/* Options Panel - only show if recording is complete */}
        {audioBlob && (
          <PostOptionsPanel 
            content={content}
            onContentChange={setContent}
          />
        )}
      </div>
    </div>
  );
};