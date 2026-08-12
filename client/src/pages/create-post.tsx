import { useState, useEffect, useRef } from "react";
import { useLocation, useSearch, useLocation as useWouterLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Edit, Mic, Video, Camera,
  FileImage, Send, ArrowLeft,
  X, Upload, Play, Pause, Square, Trash
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Progress } from "@/components/ui/progress";
import { PhotoUploader } from "@/components/feed/PhotoUploader";
import { VideoRecorder } from "@/components/feed/VideoRecorder";
import { VoiceRecorder } from "@/components/feed/VoiceRecorder";

export default function CreatePost() {
  const queryString = useSearch();
  const postType = new URLSearchParams(queryString).get("type") || "text";
  const [, setLocation] = useWouterLocation();
  const closeComposer = () => setLocation("/create");

  if (postType === "photo") return <PhotoUploader onClose={closeComposer} />;
  if (postType === "video") return <VideoRecorder onClose={closeComposer} />;
  if (postType === "audio") return <VoiceRecorder onClose={closeComposer} />;

  return <CreatePostForm />;
}

function CreatePostForm() {
  const queryString = useSearch();
  const searchParams = new URLSearchParams(queryString);
  const postType = searchParams.get("type") || "text";
  const [, setLocation] = useWouterLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  // State for all post types
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // States for image/photo posts
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  // States for audio posts
  const [isRecording, setIsRecording] = useState(false);
  const [audioFile, setAudioFile] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const [audioDuration, setAudioDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // States for video posts
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);

  // Clean up media resources on unmount
  useEffect(() => {
    return () => {
      // Stop any media stream
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }
      
      // Release any audio element
      if (audioRef.current) {
        const audioElement = audioRef.current;
        audioElement.pause();
        audioElement.src = '';
      }

      // Release any URLs
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    };
  }, [audioUrl, imagePreviewUrl, videoPreviewUrl]);

  // Handle audio element events
  useEffect(() => {
    if (audioRef.current && audioUrl) {
      const audioElement = audioRef.current;
      
      const handleTimeUpdate = () => {
        setCurrentTime(audioElement.currentTime);
      };
      
      const handleDurationChange = () => {
        setAudioDuration(audioElement.duration);
      };
      
      const handleEnded = () => {
        setIsPlaying(false);
        setCurrentTime(0);
        audioElement.currentTime = 0;
      };
      
      audioElement.addEventListener('timeupdate', handleTimeUpdate);
      audioElement.addEventListener('durationchange', handleDurationChange);
      audioElement.addEventListener('ended', handleEnded);
      
      return () => {
        audioElement.removeEventListener('timeupdate', handleTimeUpdate);
        audioElement.removeEventListener('durationchange', handleDurationChange);
        audioElement.removeEventListener('ended', handleEnded);
      };
    }
  }, [audioRef, audioUrl]);

  // Update playing state
  useEffect(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.play().catch(err => {
          console.error("Error playing audio:", err);
          setIsPlaying(false);
        });
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying]);

  // Mutation for creating a post
  const createPostMutation = useMutation({
    mutationFn: async (postData: FormData | any) => {
      // For text posts we can just use JSON, for media posts we need FormData
      if (postData instanceof FormData) {
        const res = await fetch('/api/posts/media', {
          method: 'POST',
          credentials: 'include',
          body: postData
        });
        
        if (!res.ok) {
          throw new Error(`Failed to create post: ${res.statusText}`);
        }
        
        return res.json();
      } else {
        const res = await apiRequest('POST', '/api/posts', postData);
        return res.json();
      }
    },
    onSuccess: () => {
      // Clear form and show success message
      setContent("");
      setImageFile(null);
      setImagePreviewUrl(null);
      setAudioFile(null);
      setAudioUrl(null);
      setVideoFile(null);
      setVideoPreviewUrl(null);
      
      // Show success message
      toast({
        title: 'Post created!',
        description: 'Your post has been successfully created.',
      });
      
      // Invalidate posts query to refresh the feed
      queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
      
      // Navigate back to feed
      setLocation('/');
    },
    onError: (error) => {
      console.error('Error creating post:', error);
      toast({
        title: 'Error',
        description: 'Failed to create your post. Please try again.',
        variant: 'destructive',
      });
      setIsSubmitting(false);
    }
  });

  // Function to start audio recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      
      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setAudioFile(audioBlob);
        setAudioUrl(audioUrl);
        setAudioChunks(chunks);
      };
      
      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      toast({
        title: 'Microphone Error',
        description: 'Could not access your microphone. Please check your permissions.',
        variant: 'destructive',
      });
    }
  };

  // Function to stop audio recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      // Stop all tracks in the media stream
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }
    }
  };

  // Function to toggle audio playback
  const toggleAudioPlayback = () => {
    setIsPlaying(!isPlaying);
  };

  // Function to handle image file selection
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    const file = e.target.files?.[0];
    
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Function to handle video file selection
  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    const file = e.target.files?.[0];
    
    if (file) {
      setVideoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setVideoPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Function to trigger file input click
  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  // Function to handle post submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast({
        title: 'Authentication Required',
        description: 'Please log in to create a post.',
        variant: 'destructive',
      });
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      if (postType === 'text') {
        // Text post
        if (!content.trim()) {
          throw new Error('Post content cannot be empty');
        }
        
        createPostMutation.mutate({
          userId: user.id,
          content: content
        });
      } else if (postType === 'photo') {
        // Photo post
        if (!imageFile) {
          throw new Error('Please select an image for your post');
        }
        
        const formData = new FormData();
        formData.append('userId', user.id.toString());
        formData.append('content', content);
        formData.append('image', imageFile);
        
        createPostMutation.mutate(formData);
      } else if (postType === 'audio') {
        // Audio post
        if (!audioFile) {
          throw new Error('Please record audio for your post');
        }
        
        const formData = new FormData();
        formData.append('userId', user.id.toString());
        formData.append('content', content);
        formData.append('audio', audioFile, 'recording.webm');
        
        createPostMutation.mutate(formData);
      } else if (postType === 'video') {
        // Video post
        if (!videoFile) {
          throw new Error('Please select a video for your post');
        }
        
        const formData = new FormData();
        formData.append('userId', user.id.toString());
        formData.append('content', content);
        formData.append('video', videoFile);
        
        createPostMutation.mutate(formData);
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create post',
        variant: 'destructive',
      });
      setIsSubmitting(false);
    }
  };

  // Function to remove selected file
  const removeFile = () => {
    if (postType === 'photo') {
      setImageFile(null);
      setImagePreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } else if (postType === 'video') {
      setVideoFile(null);
      setVideoPreviewUrl(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } else if (postType === 'audio') {
      setAudioFile(null);
      setAudioUrl(null);
      setAudioChunks([]);
    }
  };

  // Determine post type icon
  const renderPostTypeIcon = () => {
    switch (postType) {
      case 'text':
        return <Edit className="h-5 w-5" />;
      case 'photo':
        return <Camera className="h-5 w-5" />;
      case 'audio':
        return <Mic className="h-5 w-5" />;
      case 'video':
        return <Video className="h-5 w-5" />;
      default:
        return <Edit className="h-5 w-5" />;
    }
  };

  // Format time for audio player
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  return (
    <main className="min-h-dvh bg-black text-white">
      <Card className="mx-auto min-h-dvh max-w-lg rounded-none border-0 bg-black text-white shadow-none">
        <CardHeader className="sticky top-0 z-20 flex h-14 flex-row items-center gap-2 space-y-0 border-b border-zinc-800 bg-black px-3 py-0">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setLocation('/')}
            className="mr-1 text-white hover:bg-zinc-900 hover:text-white"
            aria-label="Back to Explore"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <CardTitle className="flex flex-1 items-center gap-2 text-base text-white">
            {renderPostTypeIcon()}
            {postType.charAt(0).toUpperCase() + postType.slice(1)} Post
          </CardTitle>
        </CardHeader>
        
        <form onSubmit={handleSubmit} className="flex min-h-[calc(100dvh-3.5rem)] flex-col">
          <CardContent className="flex-1 space-y-5 p-4">
            <Textarea
              placeholder={`What's on your mind?`}
              className="min-h-28 resize-none rounded-xl border-zinc-800 bg-zinc-950 text-white placeholder:text-zinc-500"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            
            {postType === 'photo' && (
              <div className="space-y-4">
                {!imagePreviewUrl ? (
                  <div role="button" tabIndex={0} aria-label="Choose a photo" className="flex aspect-[4/5] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-950 p-12 transition-colors hover:bg-zinc-900" onClick={triggerFileInput} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); triggerFileInput(); } }}>
                    <FileImage className="mb-4 h-12 w-12 text-zinc-500" />
                    <p className="text-sm text-zinc-500">Choose a photo</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageChange}
                    />
                  </div>
                ) : (
                  <div className="relative">
                    <img 
                      src={imagePreviewUrl} 
                      alt="Preview" 
                      className="aspect-[4/5] w-full rounded-2xl object-cover"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2"
                      onClick={removeFile}
                      aria-label="Remove photo"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}
            
            {postType === 'audio' && (
              <div className="space-y-4">
                {!audioUrl ? (
                  <div className="flex aspect-[4/5] items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-950 p-12">
                    <Button
                      type="button"
                      variant={isRecording ? "destructive" : "default"}
                      onClick={isRecording ? stopRecording : startRecording}
                      className="flex items-center gap-2"
                    >
                      {isRecording ? (
                        <>
                          <Square className="h-4 w-4" />
                          Stop Recording
                        </>
                      ) : (
                        <>
                          <Mic className="h-4 w-4" />
                          Start Recording
                        </>
                      )}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
                    <div className="flex items-center justify-between">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={toggleAudioPlayback}
                        aria-label={isPlaying ? "Pause recorded audio" : "Play recorded audio"}
                      >
                        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </Button>
                      <div className="text-sm text-zinc-500">
                        {formatTime(currentTime)} / {formatTime(audioDuration)}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={removeFile}
                        aria-label="Remove recorded audio"
                      >
                        <Trash className="h-4 w-4" />
                      </Button>
                    </div>
                    <Progress value={(currentTime / audioDuration) * 100} className="h-2" />
                    <audio ref={audioRef} src={audioUrl} className="hidden" />
                  </div>
                )}
              </div>
            )}
            
            {postType === 'video' && (
              <div className="space-y-4">
                {!videoPreviewUrl ? (
                  <div role="button" tabIndex={0} aria-label="Choose a video" className="flex aspect-[4/5] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-950 p-12 transition-colors hover:bg-zinc-900" onClick={triggerFileInput} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); triggerFileInput(); } }}>
                    <Upload className="mb-4 h-12 w-12 text-zinc-500" />
                    <p className="text-sm text-zinc-500">Choose a video</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={handleVideoChange}
                    />
                  </div>
                ) : (
                  <div className="relative">
                    <video 
                      src={videoPreviewUrl} 
                      controls 
                      className="aspect-[4/5] w-full rounded-2xl object-cover"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2"
                      onClick={removeFile}
                      aria-label="Remove video"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
          
          <CardFooter className="sticky bottom-0 flex justify-end border-t border-zinc-800 bg-black p-3">
            <Button
              type="submit"
              disabled={isSubmitting || (
                (postType === 'photo' && !imageFile) ||
                (postType === 'audio' && !audioFile) ||
                (postType === 'video' && !videoFile) ||
                (postType === 'text' && !content.trim())
              )}
              className="flex w-full items-center justify-center gap-2 bg-[#1d9bf0] text-white hover:bg-[#1d9bf0]/90"
            >
              <Send className="h-4 w-4" />
              Post
            </Button>
          </CardFooter>
        </form>
      </Card>
    </main>
  );
}
