import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { X, Upload, CheckCircle, Loader2 } from "lucide-react";
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
  
  // If image is selected, show the image editor and options
  if (imagePreview) {
    return (
      <div className="flex flex-col h-full overflow-hidden bg-black text-white">
        <DialogTitle className="sr-only">Create New Photo Post</DialogTitle>
        
        {/* Top Bar - Instagram-like header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-800">
          <button className="text-white" onClick={onClose}>Cancel</button>
          <h2 className="text-lg font-medium text-white">New post</h2>
          <button 
            className="text-blue-500 font-medium"
            onClick={handlePost}
            disabled={createPostMutation.isPending || !imageFile}
          >
            {createPostMutation.isPending ? "Sharing..." : "Share"}
          </button>
        </div>
        
        {/* Scrollable Content */}
        <div 
          ref={scrollContainerRef}
          className="flex-grow overflow-y-auto"
        >
          {/* Image preview */}
          <div className="w-full aspect-square bg-black flex items-center justify-center">
            <img 
              src={imagePreview} 
              alt="Preview" 
              className="max-h-full max-w-full object-contain" 
            />
          </div>
          
          {/* Caption input */}
          <div className="p-4 border-b border-gray-800">
            <textarea
              className="w-full p-3 mb-4 bg-transparent border border-gray-700 rounded resize-none text-white"
              placeholder="Write a caption..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={createPostMutation.isPending}
            />
            
            <Button
              variant="outline"
              onClick={() => {
                setImageFile(null);
                setImagePreview(null);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              className="w-full border-gray-700 text-white hover:bg-gray-800"
              disabled={createPostMutation.isPending}
            >
              Change Photo
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
  
  // Photo selection mode with Instagram-inspired UI
  return (
    <div className="relative w-full h-screen bg-black text-white">
      <DialogTitle className="sr-only">Create New Photo Post</DialogTitle>
      
      {/* Top bar */}
      <div className="flex justify-between items-center p-4 border-b border-gray-800">
        <button onClick={onClose} className="text-white">✕</button>
        <h2 className="text-lg font-medium">New Post</h2>
        <div className="w-10"></div> {/* Empty space for symmetry */}
      </div>

      {/* Center Upload Button */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="bg-gray-800/50 rounded-lg p-10 flex flex-col items-center max-w-xs mx-auto">
          <div 
            onClick={triggerFileSelect}
            className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mb-4 cursor-pointer"
          >
            <Upload className="h-8 w-8 text-white" />
          </div>
          <p className="text-lg mb-2 text-white">Upload a photo</p>
          <p className="text-sm text-gray-400 text-center mb-4">
            Share a photo with your followers
          </p>
          <Button 
            onClick={triggerFileSelect} 
            className="bg-blue-500 hover:bg-blue-600 text-white"
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