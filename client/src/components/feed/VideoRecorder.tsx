import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { X, Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PostOptionsPanel } from "@/components/feed/PostOptionsPanel";

interface VideoRecorderProps {
  onClose: () => void;
}

export const VideoRecorder = ({ onClose }: VideoRecorderProps) => {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [content, setContent] = useState("");
  const [addToStory, setAddToStory] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const triggerFileSelect = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setVideoFile(file);
      const videoUrl = URL.createObjectURL(file);
      setVideoPreview(videoUrl);
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
        title: 'Video posted!',
        description: 'Your video has been successfully posted.'
      });
      queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
      onClose();
    },
    onError: (error) => {
      console.error('Error creating video post:', error);
      toast({
        title: 'Error',
        description: 'Failed to post video. Please try again.',
        variant: 'destructive'
      });
    }
  });
  
  const handlePost = () => {
    if (!videoFile) {
      toast({
        title: 'No Video Selected',
        description: 'Please select a video file first.',
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
    formData.append('content', content || 'Video post');
    formData.append('video', videoFile);
    formData.append('mediaType', 'video');
    formData.append('addToStory', String(addToStory));
    
    createPostMutation.mutate(formData);
  };
  
  const handleVideoMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    setVideoDuration(video.duration);
  };
  
  // If video is selected, show the video editor and options
  if (videoPreview) {
    return (
      <div className="flex min-h-dvh flex-col overflow-hidden bg-black text-white">
        <h1 className="sr-only">Create New Video Post</h1>
        
        {/* Top Bar - Instagram-like header */}
        <div className="flex items-center justify-between border-b border-zinc-800 p-4">
        <button className="text-zinc-300" onClick={onClose} aria-label="Cancel video post">Cancel</button>
          <div className="text-sm font-medium">
            {videoDuration < 10 ? 'Short video' : 'Long video'}
          </div>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={handlePost}
            disabled={createPostMutation.isPending || !videoFile}
            className="text-primary font-medium"
          >
            {createPostMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sharing...
              </>
            ) : "Share"}
          </Button>
        </div>
        
        {/* Scrollable Content */}
        <div 
          ref={scrollContainerRef}
          className="flex-grow overflow-y-auto"
        >
          {/* Video preview */}
          <div className="flex aspect-[4/5] w-full items-center justify-center bg-zinc-900">
            <video 
              ref={videoRef}
              src={videoPreview} 
              className="max-h-full max-w-full" 
              controls
              onLoadedMetadata={handleVideoMetadata}
            />
          </div>
          
          {/* Caption input */}
          <div className="p-4 border-b">
            <input
              type="text"
              className="mb-4 w-full rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-white placeholder:text-zinc-500"
              placeholder="Add a caption"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={createPostMutation.isPending}
            />
            
            <Button
              variant="outline"
              onClick={() => {
                setVideoFile(null);
                setVideoPreview(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              className="w-full"
              disabled={createPostMutation.isPending}
            >
              Change Video
            </Button>
          </div>
          
          {/* Options Panel */}
          <PostOptionsPanel 
            content={content}
            onContentChange={setContent}
            addToStory={addToStory}
            onAddToStoryChange={setAddToStory}
            onShare={handlePost}
            isSharing={createPostMutation.isPending}
            shareDisabled={!videoFile}
          />
        </div>
      </div>
    );
  }
  
  // TikTok-inspired UI for video selection
  return (
    <div className="relative h-screen w-full bg-black text-white">
      <h1 className="sr-only">Create New Video Post</h1>
      
      {/* Top Controls */}
      <div className="absolute left-0 right-0 top-0 z-10 flex h-[58px] items-center justify-between border-b border-zinc-800 bg-black px-4">
        <button className="rounded-full p-2 text-xl text-white transition-colors hover:bg-white/10" onClick={onClose} aria-label="Cancel video post">✕</button>
        <span className="absolute left-1/2 -translate-x-1/2 text-lg font-semibold">New reel</span>
        <div className="flex space-x-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="rounded-full border-zinc-700 bg-zinc-900 text-white hover:bg-zinc-800"
            onClick={triggerFileSelect}
          >
            Upload
          </Button>
        </div>
      </div>

      {/* Center Upload Button */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="mb-4 text-lg">Choose a video to share</p>
        <button 
          onClick={triggerFileSelect}
          className="flex flex-col items-center justify-center space-y-2"
          aria-label="Upload a video"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#1d9bf0]">
            <Upload className="h-8 w-8 text-primary-foreground" />
          </div>
          <span className="text-sm">Tap to select</span>
        </button>
      </div>

      {/* Hidden file input */}
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        onChange={handleFileChange} 
        accept="video/*"
      />
    </div>
  );
};
