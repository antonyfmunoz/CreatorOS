import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { PostOptionsPanel } from "@/components/feed/PostOptionsPanel";
import { 
  Loader2, 
  Type, 
  Image, 
  Rocket, 
  Video, 
  MapPin, 
  Users, 
  ChevronLeft, 
  ChevronRight, 
  Plus,
  Camera,
  RefreshCw
} from "lucide-react";
import { DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TextComposerProps {
  onClose: () => void;
}

export const TextComposer = ({ onClose }: TextComposerProps) => {
  const [content, setContent] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showOptionsPanel, setShowOptionsPanel] = useState(false);
  const [addToStory, setAddToStory] = useState(false);
  const [taggedUsers, setTaggedUsers] = useState<any[]>([]);
  const [showTagLabels, setShowTagLabels] = useState(false);
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  // Handle file input change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    // Convert FileList to array for easier handling
    const fileArray = Array.from(files);
    
    // Add new files to existing ones
    const newImageFiles = [...imageFiles, ...fileArray];
    
    // Create object URLs for previews
    const newPreviews = fileArray.map(file => URL.createObjectURL(file));
    const allPreviews = [...imagePreviews, ...newPreviews];
    
    setImageFiles(newImageFiles);
    setImagePreviews(allPreviews);
    
    // Set current index to the first new image
    if (imagePreviews.length === 0) {
      setCurrentImageIndex(0);
    }
    
    // Reset the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    
    // Show options panel when images are added
    setShowOptionsPanel(true);
  };
  
  // Trigger file select dialog
  const triggerFileSelect = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  // Handle navigation between images
  const goToNextImage = () => {
    if (currentImageIndex < imagePreviews.length - 1) {
      setCurrentImageIndex(currentImageIndex + 1);
    }
  };
  
  const goToPrevImage = () => {
    if (currentImageIndex > 0) {
      setCurrentImageIndex(currentImageIndex - 1);
    }
  };
  
  // Remove an image from the carousel
  const removeImage = (index: number) => {
    const newImageFiles = [...imageFiles];
    const newImagePreviews = [...imagePreviews];
    
    // Revoke object URL to avoid memory leaks
    URL.revokeObjectURL(newImagePreviews[index]);
    
    newImageFiles.splice(index, 1);
    newImagePreviews.splice(index, 1);
    
    setImageFiles(newImageFiles);
    setImagePreviews(newImagePreviews);
    
    // Update the current index if needed
    if (index <= currentImageIndex && currentImageIndex > 0) {
      setCurrentImageIndex(currentImageIndex - 1);
    }
    
    // If all images are removed, hide options panel
    if (newImageFiles.length === 0) {
      setShowOptionsPanel(false);
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
    onSuccess: (data) => {
      toast({
        title: 'Post created!',
        description: 'Your post has been successfully shared.'
      });
      queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
      
      // If adding to story, also invalidate stories query
      if (addToStory) {
        queryClient.invalidateQueries({ queryKey: ['/api/stories'] });
        queryClient.refetchQueries({ queryKey: ['/api/stories'] });
      }
      
      onClose();
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
  
  const handleSubmit = () => {
    // Different handling based on whether we have images or just text
    if (imageFiles.length > 0) {
      // Image post
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
      formData.append('mediaType', 'photo');
      formData.append('isCarousel', String(imageFiles.length > 1));
      formData.append('addToStory', String(addToStory));
      
      // Add tagged users data if present
      if (taggedUsers.length > 0) {
        formData.append('taggedUsers', JSON.stringify(taggedUsers));
      }
      
      // Append all images to the FormData
      imageFiles.forEach((file, index) => {
        formData.append(`image${index}`, file);
      });
      
      createPostMutation.mutate(formData);
    } else {
      // Text-only post
      if (!content.trim()) {
        toast({
          title: "Cannot Post",
          description: "Your post cannot be empty",
          variant: "destructive"
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
      
      // Use the existing endpoint for text posts
      const postData = {
        userId: user.id,
        content,
        mediaType: 'text'
      };
      
      // Create a simple text post
      const textPostMutation = useMutation({
        mutationFn: async (data: any) => {
          const res = await apiRequest('POST', '/api/posts', data);
          return res.json();
        },
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
          onClose();
        }
      });
      
      textPostMutation.mutate(postData);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background text-foreground">
      <DialogTitle className="sr-only">Create New Post</DialogTitle>
      
      {/* Instagram-style header */}
      <div className="flex justify-between items-center p-4 border-b h-[58px]">
        <button 
          className="text-foreground" 
          onClick={onClose}
        >
          Cancel
        </button>
        <h2 className="text-lg font-medium">New post</h2>
        <Button 
          variant="ghost" 
          size="sm"
          onClick={handleSubmit}
          disabled={createPostMutation.isPending || (!content.trim() && imageFiles.length === 0)}
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
      
      {/* Scrollable Container */}
      <div 
        ref={scrollContainerRef}
        className="flex-grow overflow-y-auto"
      >
        {/* File Input (Hidden) */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          multiple
          className="hidden"
        />
        
        {/* Image Preview (if images are selected) */}
        {imagePreviews.length > 0 && (
          <div className="relative w-full aspect-square bg-muted flex items-center justify-center">
            {/* Image Preview */}
            <img 
              src={imagePreviews[currentImageIndex]} 
              alt={`Preview ${currentImageIndex + 1}`} 
              className="max-h-full max-w-full object-contain cursor-pointer" 
              onClick={() => {
                if (taggedUsers.length > 0) {
                  setShowTagLabels(!showTagLabels);
                }
              }}
            />
            
            {/* Navigation arrows for multiple images */}
            {imagePreviews.length > 1 && (
              <>
                {/* Previous Button */}
                {currentImageIndex > 0 && (
                  <button 
                    className="absolute left-2 top-1/2 transform -translate-y-1/2 bg-black/50 text-white rounded-full p-1"
                    onClick={goToPrevImage}
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                )}
                
                {/* Next Button */}
                {currentImageIndex < imagePreviews.length - 1 && (
                  <button 
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-black/50 text-white rounded-full p-1"
                    onClick={goToNextImage}
                  >
                    <ChevronRight className="h-6 w-6" />
                  </button>
                )}
                
                {/* Image counter indicator */}
                <div className="absolute top-2 right-2 bg-black/50 text-white text-xs rounded-full px-2 py-1">
                  {currentImageIndex + 1}/{imagePreviews.length}
                </div>
              </>
            )}
            
            {/* Remove image button */}
            <button 
              className="absolute top-2 left-2 bg-black/50 text-white rounded-full p-1"
              onClick={() => removeImage(currentImageIndex)}
            >
              <Loader2 className="h-5 w-5" />
            </button>
            
            {/* Add more images button */}
            <button 
              className="absolute bottom-2 right-2 bg-primary text-white rounded-full p-2"
              onClick={triggerFileSelect}
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
        )}
        
        {/* Caption Input Area - Similar to Instagram */}
        <div className={cn("p-4 border-b", imagePreviews.length > 0 ? "border-t-0" : "")}>
          {imagePreviews.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div 
                className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center cursor-pointer"
                onClick={triggerFileSelect}
              >
                <Image className="h-10 w-10 text-primary" />
              </div>
              <p className="text-lg font-medium">Add photos to your post</p>
              <Button 
                variant="outline" 
                onClick={triggerFileSelect}
                className="rounded-md"
              >
                Select from device
              </Button>
            </div>
          ) : null}
          
          <textarea
            className="bg-transparent text-lg placeholder-muted-foreground resize-none outline-none w-full min-h-[100px]"
            placeholder={imagePreviews.length > 0 ? "Write a caption..." : "What's happening?"}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={createPostMutation.isPending}
          ></textarea>
          
          {/* Toolbar - only show when no images are selected */}
          {imagePreviews.length === 0 && (
            <div className="flex space-x-4 mt-4 text-muted-foreground">
              <Button variant="ghost" size="icon" onClick={triggerFileSelect}>
                <Image className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon">
                <Type className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon">
                <Rocket className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon">
                <Video className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon">
                <span className="text-sm font-bold">GIF</span>
              </Button>
              <Button variant="ghost" size="icon">
                <MapPin className="h-5 w-5" />
              </Button>
            </div>
          )}
        </div>
        
        {/* Options Panel */}
        <PostOptionsPanel 
          content={content}
          onContentChange={setContent}
          onShare={handleSubmit}
        />
      </div>
    </div>
  );
};