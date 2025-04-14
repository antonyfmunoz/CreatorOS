import { useState, useRef, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Progress } from "@/components/ui/progress";

interface VoiceRecorderProps {
  onClose: () => void;
}

export const VoiceRecorder = ({ onClose }: VoiceRecorderProps) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [content, setContent] = useState("");

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Start recording automatically when component mounts
  useEffect(() => {
    startRecording();
    return () => stopRecording();
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
    <div className="absolute bottom-0 left-0 right-0 px-4 pb-4 pt-2 bg-background">
      <div className="flex flex-col">
        {/* Optional caption input */}
        <input
          type="text"
          className="bg-background border border-border rounded-md p-2 mb-2 text-sm"
          placeholder="Add caption (optional)"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          disabled={createPostMutation.isPending}
        />
        
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-foreground text-sm">{formatTime(recordingTime)}</span>
            {isRecording ? (
              <span className="text-muted-foreground text-sm">Slide to cancel</span>
            ) : (
              <span className="text-muted-foreground text-sm">Recording complete</span>
            )}
          </div>

          {isRecording ? (
            <button
              onClick={stopRecording}
              className="bg-primary w-14 h-14 rounded-full flex items-center justify-center"
            >
              <span className="text-2xl">🎙️</span>
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={createPostMutation.isPending || !audioBlob}
              className="bg-primary text-primary-foreground px-4 py-2 rounded-full"
            >
              {createPostMutation.isPending ? "Sending..." : "Send"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};