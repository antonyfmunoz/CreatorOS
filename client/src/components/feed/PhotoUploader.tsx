import React, { useState, useRef, useCallback, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Upload, Loader2, X, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PostOptionsPanel } from "@/components/feed/PostOptionsPanel";
import { DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface PhotoUploaderProps {
  onClose: () => void;
}

export const PhotoUploader = ({ onClose }: PhotoUploaderProps) => {
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [content, setContent] = useState("");
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
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
    
    // If all images are removed, go back to file selection
    if (newImageFiles.length === 0) {
      handleClose();
    }
  };
  
  // Modified to handle custom close behavior for both screens
  const handleClose = useCallback(() => {
    // On the post creation screen with uploaded images, go back to file selection
    if (imageFiles.length > 0) {
      // Revoke all object URLs to avoid memory leaks
      imagePreviews.forEach(preview => URL.revokeObjectURL(preview));
      
      setImageFiles([]);
      setImagePreviews([]);
      setCurrentImageIndex(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } else {
      // On the initial file selection screen, close the entire dialog
      onClose();
    }
  }, [imageFiles, imagePreviews, onClose]);
  
  // A safer implementation for custom X button behavior
  useEffect(() => {
    // Function that will be called when the component mounts
    const timer = setTimeout(() => {
      try {
        // Find the DialogPrimitive.Close button - more specific selector
        const closeButton = document.querySelector('[aria-label="Close"]') as HTMLElement | null;
        
        if (!closeButton) return;
        
        // Function to handle close button click
        const handleCloseClick = (e: Event) => {
          e.preventDefault();
          e.stopPropagation();
          handleClose();
        };
        
        // Replace with our custom handler
        closeButton.addEventListener('click', handleCloseClick);
        
        // Ensure cleanup is registered
        const cleanup = () => {
          closeButton.removeEventListener('click', handleCloseClick);
        };
        
        // Return cleanup function
        return cleanup;
      } catch (error) {
        console.error("Error setting up close button handler:", error);
      }
    }, 100); // Small delay to ensure DOM is ready
    
    // Cleanup timeout on unmount
    return () => {
      clearTimeout(timer);
    };
  }, [handleClose]);
  
  const triggerFileSelect = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
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
        title: 'Photos posted!',
        description: `Your ${imageFiles.length > 1 ? 'carousel post' : 'photo'} has been successfully posted.`
      });
      queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
      onClose();
    },
    onError: (error) => {
      console.error('Error creating photo post:', error);
      toast({
        title: 'Error',
        description: 'Failed to post photos. Please try again.',
        variant: 'destructive'
      });
    }
  });
  
  const handlePost = () => {
    if (imageFiles.length === 0) {
      toast({
        title: 'No Images Selected',
        description: 'Please select at least one image file.',
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
    formData.append('mediaType', 'photo');
    formData.append('isCarousel', String(imageFiles.length > 1));
    
    // Append all images to the FormData
    imageFiles.forEach((file, index) => {
      formData.append(`image${index}`, file);
    });
    
    createPostMutation.mutate(formData);
  };
  
  // Add more images to the carousel
  const addMoreImages = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  // If images are selected, show the carousel editor and options
  if (imagePreviews.length > 0) {
    return (
      <div className="flex flex-col h-full overflow-hidden bg-background text-foreground">
        <DialogTitle className="sr-only">Create New Photo Post</DialogTitle>
        
        {/* Top Bar - Instagram-like header */}
        <div className="flex justify-between items-center p-4 border-b h-[58px]">
          <div className="w-10 h-6 flex items-center justify-center"></div> {/* Empty space matched to X button size */}
          <h2 className="text-lg font-medium">New post</h2>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={handlePost}
            disabled={createPostMutation.isPending || imageFiles.length === 0}
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
          {/* Image preview carousel */}
          <div className="relative w-full aspect-square bg-muted flex items-center justify-center">
            <img 
              src={imagePreviews[currentImageIndex]} 
              alt={`Preview ${currentImageIndex + 1}`} 
              className="max-h-full max-w-full object-contain" 
            />
            
            {/* Navigation arrows for carousel */}
            {imagePreviews.length > 1 && (
              <>
                {currentImageIndex > 0 && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="absolute left-2 bg-background/80 hover:bg-background rounded-full"
                    onClick={goToPrevImage}
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </Button>
                )}
                
                {currentImageIndex < imagePreviews.length - 1 && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="absolute right-2 bg-background/80 hover:bg-background rounded-full"
                    onClick={goToNextImage}
                  >
                    <ChevronRight className="h-6 w-6" />
                  </Button>
                )}
              </>
            )}
            
            {/* Remove current image button */}
            <Button 
              variant="ghost" 
              size="icon" 
              className="absolute top-2 right-2 bg-background/80 hover:bg-background/80 hover:text-destructive rounded-full"
              onClick={() => removeImage(currentImageIndex)}
            >
              <X className="h-5 w-5" />
            </Button>
            
            {/* Add more images button */}
            <Button 
              variant="ghost" 
              size="icon" 
              className="absolute bottom-2 right-2 bg-background/80 hover:bg-background rounded-full"
              onClick={addMoreImages}
            >
              <Plus className="h-5 w-5" />
            </Button>
            
            {/* Carousel indicators */}
            {imagePreviews.length > 1 && (
              <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
                {imagePreviews.map((_, index) => (
                  <button
                    key={index}
                    className={cn(
                      "w-2 h-2 rounded-full transition-all",
                      index === currentImageIndex 
                        ? "bg-primary scale-125" 
                        : "bg-muted-foreground/50 hover:bg-muted-foreground"
                    )}
                    onClick={() => setCurrentImageIndex(index)}
                    aria-label={`Go to image ${index + 1}`}
                  />
                ))}
              </div>
            )}
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
      <div className="flex justify-between items-center p-4 border-b h-[58px]">
        <div className="w-10 h-6 flex items-center justify-center"></div> {/* Empty space matched to X button size */}
        <h2 className="text-lg font-medium">New post</h2>
        <div className="w-10 h-6 flex items-center justify-center"></div> {/* Empty space matched to X button size */}
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
          <p className="text-lg mb-2">Upload photos</p>
          <p className="text-sm text-muted-foreground text-center mb-4">
            Share one or multiple photos with your followers
          </p>
          <Button 
            onClick={triggerFileSelect}
          >
            Select from device
          </Button>
        </div>
      </div>
      
      {/* Hidden file input - now allows multiple selection */}
      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        onChange={handleFileChange} 
        accept="image/*"
        multiple
      />
    </div>
  );
};