import { useState, useRef, useEffect } from "react";
import { Plus, Edit, Mic, Video, Camera, X, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function FloatingActionButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [postType, setPostType] = useState<"text" | "photo" | "audio" | "video">("text");
  const [content, setContent] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // Clean up media resources on unmount
  useEffect(() => {
    return () => {
      // Stop any media stream
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
      }
      
      // Release any audio/video elements
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.src = '';
      }
      
      // Release any object URLs
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (imagePreview) URL.revokeObjectURL(imagePreview);
      if (videoPreview) URL.revokeObjectURL(videoPreview);
    };
  }, [audioUrl, imagePreview, videoPreview]);
  
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
  
  const toggleOpen = () => {
    setIsOpen(!isOpen);
  };
  
  const createPostMutation = useMutation({
    mutationFn: async (postData: FormData | object) => {
      if (postData instanceof FormData) {
        const res = await fetch('/api/posts/media', {
          method: 'POST',
          body: postData,
          credentials: 'include'
        });
        
        if (!res.ok) {
          throw new Error('Failed to create post');
        }
        
        return res.json();
      } else {
        const res = await apiRequest('POST', '/api/posts', postData);
        return res.json();
      }
    },
    onSuccess: () => {
      toast({
        title: 'Post created!',
        description: 'Your post has been successfully created.'
      });
      queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
      
      // Reset form
      resetForm();
      setIsModalOpen(false);
    },
    onError: (error) => {
      console.error('Error creating post:', error);
      toast({
        title: 'Error',
        description: 'Failed to create post. Please try again.',
        variant: 'destructive'
      });
    }
  });
  
  const resetForm = () => {
    setContent('');
    setImageFile(null);
    setImagePreview(null);
    setVideoFile(null);
    setVideoPreview(null);
    setAudioBlob(null);
    setAudioUrl(null);
    setAudioDuration(0);
    setCurrentTime(0);
    setIsPlaying(false);
    
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = '';
    }
    
    // Stop any active recording
    if (isRecording) {
      stopRecording();
    }
  };
  
  const openPostModal = (type: "text" | "photo" | "audio" | "video") => {
    // Close the FAB menu
    setIsOpen(false);
    
    // Set the post type
    setPostType(type);
    
    // Open the modal
    setIsModalOpen(true);
    
    // If type is photo or video, prepare file picker
    if (type === "photo" || type === "video") {
      setTimeout(() => {
        if (fileInputRef.current) {
          fileInputRef.current.accept = type === "photo" ? "image/*" : "video/*";
          fileInputRef.current.click();
        }
      }, 300);
    }
    
    // If type is audio, prepare recording
    if (type === "audio") {
      setTimeout(() => {
        startRecording();
      }, 300);
    }
  };
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (postType === "photo") {
      setImageFile(file);
      const imageUrl = URL.createObjectURL(file);
      setImagePreview(imageUrl);
    } else if (postType === "video") {
      setVideoFile(file);
      const videoUrl = URL.createObjectURL(file);
      setVideoPreview(videoUrl);
      
      // Load video to get duration
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        setVideoDuration(video.duration);
      };
      video.src = videoUrl;
    }
  };
  
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
        
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
        
        // Create audio element to get duration
        const audio = new Audio(url);
        audio.onloadedmetadata = () => {
          setAudioDuration(audio.duration);
        };
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
    }
  };
  
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      setIsRecording(false);
    }
  };
  
  const toggleAudioPlayback = () => {
    setIsPlaying(!isPlaying);
  };
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      toast({
        title: 'Authentication Required',
        description: 'Please log in to create a post.',
        variant: 'destructive'
      });
      return;
    }
    
    try {
      if (postType === "text") {
        if (!content.trim()) {
          throw new Error('Post content cannot be empty');
        }
        
        createPostMutation.mutate({
          userId: user.id,
          content,
          mediaType: 'text'
        });
      }
      else if (postType === "photo") {
        if (!imageFile) {
          throw new Error('Please select an image');
        }
        
        const formData = new FormData();
        formData.append('userId', user.id.toString());
        formData.append('content', content);
        formData.append('image', imageFile);
        formData.append('mediaType', 'photo');
        
        createPostMutation.mutate(formData);
      }
      else if (postType === "video") {
        if (!videoFile) {
          throw new Error('Please select a video');
        }
        
        const formData = new FormData();
        formData.append('userId', user.id.toString());
        formData.append('content', content);
        formData.append('video', videoFile);
        formData.append('mediaType', 'video');
        
        createPostMutation.mutate(formData);
      }
      else if (postType === "audio") {
        if (!audioBlob) {
          throw new Error('Please record audio for your post');
        }
        
        const formData = new FormData();
        formData.append('userId', user.id.toString());
        formData.append('content', content);
        formData.append('audio', audioBlob, 'recording.webm');
        formData.append('mediaType', 'audio');
        
        createPostMutation.mutate(formData);
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create post',
        variant: 'destructive'
      });
    }
  };
  
  const formatTime = (time: number): string => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };
  
  const getTooltipText = (type: string): string => {
    switch (type) {
      case 'text':
        return 'Text Post (like X)';
      case 'photo':
        return 'Image Post (like Instagram)';
      case 'audio':
        return 'Voice Post (like Telegram)';
      case 'video':
        return 'Video Post (TikTok <10s, YouTube >10s)';
      default:
        return '';
    }
  };

  return (
    <>
      <div className="fixed bottom-[80px] right-5 z-50">
        {/* Action menu */}
        <div className={cn(
          "flex flex-col-reverse items-center mb-3 transition-all duration-300 ease-in-out space-y-reverse space-y-3",
          isOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
        )}>
          {/* Text Post */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => openPostModal("text")}
                  variant="secondary"
                  className="rounded-full h-12 w-12 shadow-lg flex items-center justify-center bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Edit className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p>{getTooltipText('text')}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {/* Audio Post */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => openPostModal("audio")}
                  variant="secondary"
                  className="rounded-full h-12 w-12 shadow-lg flex items-center justify-center bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Mic className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p>{getTooltipText('audio')}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {/* Video Post */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => openPostModal("video")}
                  variant="secondary"
                  className="rounded-full h-12 w-12 shadow-lg flex items-center justify-center bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Video className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p>{getTooltipText('video')}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {/* Photo Post */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => openPostModal("photo")}
                  variant="secondary"
                  className="rounded-full h-12 w-12 shadow-lg flex items-center justify-center bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <Camera className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p>{getTooltipText('photo')}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        
        {/* Main button */}
        <Button
          onClick={toggleOpen}
          className={cn(
            "rounded-full h-14 w-14 shadow-xl flex items-center justify-center transition-transform",
            isOpen && "rotate-45"
          )}
        >
          <Plus className="h-6 w-6" />
        </Button>
      </div>
      
      {/* Hidden file input */}
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        onChange={handleFileChange} 
        accept={postType === "photo" ? "image/*" : "video/*"} 
      />
      
      {/* Post creation modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>
              {postType === "text" && "Create Text Post"}
              {postType === "photo" && "Create Photo Post"}
              {postType === "audio" && "Create Voice Post"}
              {postType === "video" && "Create Video Post"}
            </DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Content area */}
            <Textarea
              placeholder="What's on your mind?"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[100px] resize-none"
            />
            
            {/* Media preview area */}
            {postType === "photo" && imagePreview && (
              <div className="relative rounded-md overflow-hidden">
                <img src={imagePreview} alt="Preview" className="w-full max-h-[300px] object-contain" />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2"
                  onClick={() => {
                    setImageFile(null);
                    setImagePreview(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
            
            {postType === "video" && videoPreview && (
              <div className="relative rounded-md overflow-hidden">
                <video 
                  ref={videoRef}
                  src={videoPreview} 
                  controls 
                  className="w-full max-h-[300px]"
                  onLoadedMetadata={(e) => {
                    setVideoDuration((e.target as HTMLVideoElement).duration);
                  }}
                />
                <div className="text-sm text-gray-500 mt-1">
                  {videoDuration < 10 ? 'Short video (TikTok style)' : 'Long video (YouTube style)'}
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2"
                  onClick={() => {
                    setVideoFile(null);
                    setVideoPreview(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
            
            {postType === "audio" && (
              <div className="space-y-3 p-4 border rounded-md">
                {isRecording ? (
                  <div className="flex flex-col items-center space-y-3">
                    <div className="animate-pulse text-red-500 flex items-center space-x-2">
                      <Mic className="h-5 w-5" />
                      <span>Recording...</span>
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={stopRecording}
                    >
                      Stop Recording
                    </Button>
                  </div>
                ) : audioUrl ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={toggleAudioPlayback}
                      >
                        {isPlaying ? 'Pause' : 'Play'}
                      </Button>
                      <span className="text-sm">
                        {formatTime(currentTime)} / {formatTime(audioDuration)}
                      </span>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          setAudioBlob(null);
                          setAudioUrl(null);
                          setIsPlaying(false);
                          if (audioRef.current) {
                            audioRef.current.pause();
                            audioRef.current.src = '';
                          }
                        }}
                      >
                        Reset
                      </Button>
                    </div>
                    <Progress value={(currentTime / audioDuration) * 100} className="h-2" />
                    <audio ref={audioRef} src={audioUrl} className="hidden" />
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={startRecording}
                    className="w-full"
                  >
                    Start Recording
                  </Button>
                )}
              </div>
            )}
            
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  resetForm();
                  setIsModalOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button 
                type="submit"
                disabled={
                  createPostMutation.isPending ||
                  (postType === "text" && !content.trim()) ||
                  (postType === "photo" && !imageFile) ||
                  (postType === "video" && !videoFile) ||
                  (postType === "audio" && !audioBlob)
                }
              >
                {createPostMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Posting...
                  </>
                ) : (
                  <>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Post
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}