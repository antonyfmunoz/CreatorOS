import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { X, Upload, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PostOptionsPanel } from "@/components/feed/PostOptionsPanel";

interface VideoRecorderProps {
  onClose: () => void;
}

export const VideoRecorder = ({ onClose }: VideoRecorderProps) => {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [content, setContent] = useState("");
  const [activeTab, setActiveTab] = useState<"preview" | "options">("preview");
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  
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
  
  // TikTok-inspired UI with options panel
  return (
    <div className="relative w-full h-screen bg-background text-foreground">
      {videoPreview ? (
        // Video preview mode with tabs
        <div className="flex flex-col h-full">
          {/* Top bar */}
          <div className="flex justify-between items-center p-4 border-b">
            <button onClick={onClose} className="text-xl">✕</button>
            <div className="text-sm font-medium">
              {videoDuration < 10 ? 'Short video' : 'Long video'}
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handlePost}
              disabled={createPostMutation.isPending}
            >
              Post
            </Button>
          </div>
          
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "preview" | "options")}>
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="preview">Preview</TabsTrigger>
              <TabsTrigger value="options">Options</TabsTrigger>
            </TabsList>
            
            <TabsContent value="preview" className="h-[calc(100vh-180px)] flex flex-col">
              {/* Video preview */}
              <div className="flex-grow flex justify-center items-center bg-black">
                <video 
                  ref={videoRef}
                  src={videoPreview} 
                  className="max-h-full max-w-full" 
                  controls
                  onLoadedMetadata={handleVideoMetadata}
                />
              </div>
              
              {/* Caption input */}
              <div className="p-4">
                <input
                  type="text"
                  className="w-full p-2 mb-4 border border-border rounded"
                  placeholder="Add a caption"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  disabled={createPostMutation.isPending}
                />
                
                <div className="flex justify-between">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setVideoFile(null);
                      setVideoPreview(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    disabled={createPostMutation.isPending}
                  >
                    Change Video
                  </Button>
                  
                  <Button 
                    onClick={handlePost}
                    disabled={createPostMutation.isPending || !videoFile}
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
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="options" className="h-[calc(100vh-180px)] overflow-y-auto">
              <PostOptionsPanel 
                content={content}
                onContentChange={setContent}
              />
            </TabsContent>
          </Tabs>
        </div>
      ) : (
        // Video selection mode with TikTok-inspired UI
        <>
          {/* Top Controls */}
          <div className="absolute top-4 left-4 right-4 flex justify-between items-center z-10">
            <button className="text-foreground text-xl" onClick={onClose}>✕</button>
            <div className="flex space-x-2">
              <button 
                className="bg-muted px-3 py-1 rounded-full text-sm"
                onClick={triggerFileSelect}
              >
                Upload
              </button>
              <button className="bg-muted w-8 h-8 rounded-full text-sm flex items-center justify-center">15s</button>
            </div>
          </div>

          {/* Center Upload Button */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-lg mb-4">Select a video to upload</p>
            <button 
              onClick={triggerFileSelect}
              className="flex flex-col items-center justify-center space-y-2"
            >
              <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center">
                <Upload className="h-8 w-8 text-primary-foreground" />
              </div>
              <span className="text-sm">Tap to select</span>
            </button>
          </div>

          {/* Bottom Nav */}
          <div className="absolute bottom-5 left-0 right-0 flex justify-around text-sm text-foreground">
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
        </>
      )}
    </div>
  );
};