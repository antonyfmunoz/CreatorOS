import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { X, Upload, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PostOptionsPanel } from "@/components/feed/PostOptionsPanel";
import { DialogTitle } from "@/components/ui/dialog";

interface PhotoUploaderProps {
  onClose: () => void;
}

export const PhotoUploader = ({ onClose }: PhotoUploaderProps) => {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [content, setContent] = useState("");
  
  const fileInputRef = useRef<HTMLInputElement>(null);
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
      setImageFile(file);
      const imageUrl = URL.createObjectURL(file);
      setImagePreview(imageUrl);
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
        title: 'Photo posted!',
        description: 'Your photo has been successfully posted.'
      });
      queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
      onClose();
    },
    onError: (error) => {
      console.error('Error creating photo post:', error);
      toast({
        title: 'Error',
        description: 'Failed to post photo. Please try again.',
        variant: 'destructive'
      });
    }
  });
  
  const handlePost = () => {
    if (!imageFile) {
      toast({
        title: 'No Image Selected',
        description: 'Please select an image file first.',
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
    formData.append('content', content || 'Photo post');
    formData.append('image', imageFile);
    formData.append('mediaType', 'photo');
    
    createPostMutation.mutate(formData);
  };
  
  const handleBack = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  
  // If image is selected, show the image editor and options
  if (imagePreview) {
    return (
      <div className="flex flex-col h-full overflow-hidden bg-background text-foreground">
        <DialogTitle className="sr-only">Create New Photo Post</DialogTitle>
        
        {/* Top Bar - Instagram-like header */}
        <div className="flex justify-between items-center p-4 border-b">
          <Button 
            variant="ghost" 
            size="sm" 
            className="flex items-center gap-1 px-2" 
            onClick={handleBack}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <h2 className="text-lg font-medium">New post</h2>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={handlePost}
            disabled={createPostMutation.isPending || !imageFile}
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
          {/* Image preview */}
          <div className="w-full aspect-square bg-muted flex items-center justify-center">
            <img 
              src={imagePreview} 
              alt="Preview" 
              className="max-h-full max-w-full object-contain" 
            />
          </div>
          
          {/* Caption input */}
          <div className="p-4 border-b">
            <textarea
              className="w-full p-3 bg-background border border-border rounded resize-none"
              placeholder="Write a caption..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={createPostMutation.isPending}
            />
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
  
  // Photo selection mode with Instagram-inspired UI
  return (
    <div className="relative w-full h-screen bg-background text-foreground">
      <DialogTitle className="sr-only">Create New Photo Post</DialogTitle>
      
      {/* Top bar */}
      <div className="flex justify-between items-center p-4 border-b">
        <div className="w-10"></div> {/* Empty space for symmetry */}
        <h2 className="text-lg font-medium">New Post</h2>
        <div className="w-10"></div> {/* Empty space for symmetry */}
      </div>

      {/* Center Upload Button */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="bg-muted/50 rounded-lg p-10 flex flex-col items-center max-w-xs mx-auto">
          <div 
            onClick={triggerFileSelect}
            className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mb-4 cursor-pointer"
          >
            <Upload className="h-8 w-8 text-primary-foreground" />
          </div>
          <p className="text-lg mb-2">Upload a photo</p>
          <p className="text-sm text-muted-foreground text-center mb-4">
            Share a photo with your followers
          </p>
          <Button 
            onClick={triggerFileSelect}
          >
            Select from device
          </Button>
        </div>
      </div>
      
      {/* Hidden file input */}
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        onChange={handleFileChange} 
        accept="image/*"
      />
    </div>
  );
};