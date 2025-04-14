import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { X, Upload, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PostOptionsPanel } from "@/components/feed/PostOptionsPanel";
import { DialogTitle } from "@/components/ui/dialog";

interface VideoRecorderProps {
  onClose: () => void;
}

export const VideoRecorder = ({ onClose }: VideoRecorderProps) => {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [content, setContent] = useState("");
  
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
    
    createPostMutation.mutate(formData);
  };
  
  const handleVideoMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    setVideoDuration(video.duration);
  };
  
  // If video is selected, show the video editor and options
  if (videoPreview) {
    return (
      <div className="flex flex-col h-full overflow-hidden bg-black text-white">
        <DialogTitle className="sr-only">Create New Video Post</DialogTitle>
        
        {/* Top Bar - Instagram-like header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-800">
          <button className="text-white" onClick={onClose}>Cancel</button>
          <div className="text-sm font-medium text-white">
            {videoDuration < 10 ? 'Short video' : 'Long video'}
          </div>
          <button 
            className="text-blue-500 font-medium"
            onClick={handlePost}
            disabled={createPostMutation.isPending || !videoFile}
          >
            {createPostMutation.isPending ? "Sharing..." : "Share"}
          </button>
        </div>
        
        {/* Scrollable Content */}
        <div 
          ref={scrollContainerRef}
          className="flex-grow overflow-y-auto"
        >
          {/* Video preview */}
          <div className="w-full aspect-video bg-black flex items-center justify-center">
            <video 
              ref={videoRef}
              src={videoPreview} 
              className="max-h-full max-w-full" 
              controls
              onLoadedMetadata={handleVideoMetadata}
            />
          </div>
          
          {/* Caption input */}
          <div className="p-4 border-b border-gray-800">
            <input
              type="text"
              className="w-full p-3 mb-4 bg-transparent border border-gray-700 rounded text-white"
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
              className="w-full border-gray-700 text-white hover:bg-gray-800"
              disabled={createPostMutation.isPending}
            >
              Change Video
            </Button>
          </div>
          
          {/* Options Panel */}
          <PostOptionsPanel 
            content={content}
            onContentChange={setContent}
          />
        </div>
      </div>
    );
  }
  
  // TikTok-inspired UI for video selection
  return (
    <div className="relative w-full h-screen bg-black text-white">
      <DialogTitle className="sr-only">Create New Video Post</DialogTitle>
      
      {/* Top Controls */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-10">
        <button className="text-white text-xl" onClick={onClose}>✕</button>
        <div className="flex space-x-2">
          <button 
            className="bg-gray-800 px-3 py-1 rounded-full text-sm"
            onClick={triggerFileSelect}
          >
            Upload
          </button>
          <button className="bg-gray-800 w-8 h-8 rounded-full text-sm flex items-center justify-center">15s</button>
        </div>
      </div>

      {/* Center Upload Button */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-lg mb-4 text-white">Select a video to upload</p>
        <button 
          onClick={triggerFileSelect}
          className="flex flex-col items-center justify-center space-y-2"
        >
          <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center">
            <Upload className="h-8 w-8 text-white" />
          </div>
          <span className="text-sm text-white">Tap to select</span>
        </button>
      </div>

      {/* Bottom Nav */}
      <div className="absolute bottom-5 left-0 right-0 flex justify-around text-sm text-white">
        <span>Video</span>
        <span className="font-bold">Short</span>
        <span>Live</span>
        <span>Post</span>
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