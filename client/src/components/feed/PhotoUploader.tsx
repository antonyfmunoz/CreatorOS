import React, { useState, useRef, useCallback, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { 
  Upload, 
  Loader2, 
  X, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Users, 
  MapPin, 
  Eye, 
  Share,
  BarChart2,
  Instagram,
  Facebook
} from "lucide-react";
import { PollCreator, type PollData } from "@/components/feed/PollCreator";
import { LocationPicker, type LocationData } from "@/components/feed/LocationPicker";
import { TagEditor, type TaggedUser } from "@/components/feed/TagEditor";
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
  const [isPollModalOpen, setIsPollModalOpen] = useState(false);
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [isTagEditorOpen, setIsTagEditorOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<LocationData | null>(null);
  const [pollData, setPollData] = useState<PollData | null>(null);
  const [taggedUsers, setTaggedUsers] = useState<TaggedUser[]>([]);
  
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
          
          {/* Post options buttons */}
          <div className="space-y-4">
            {/* Poll button and poll data */}
            <div className="flex flex-col gap-2 p-4 border-b">
              {pollData ? (
                <div className="w-full">
                  <div className="flex justify-between items-center mb-2">
                    <div className="font-medium">{pollData.question}</div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 w-8 p-0 rounded-full"
                      onClick={() => {
                        setPollData(null);
                        toast({
                          title: "Poll Removed",
                          description: "The poll has been removed from your post"
                        });
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="space-y-2 text-sm">
                    {pollData.options.map((option, i) => (
                      <div key={i} className="bg-muted p-2 rounded-md">{option}</div>
                    ))}
                  </div>
                </div>
              ) : (
                <Button 
                  variant="outline" 
                  className="flex items-center gap-2 rounded-full"
                  onClick={() => setIsPollModalOpen(true)}
                >
                  <BarChart2 className="w-4 h-4" /> Poll
                </Button>
              )}
            </div>
            
            {/* Tag people, location, audience */}
            <div className="space-y-4 px-4 pb-4 border-b">
              <div className="flex items-center justify-between py-2" 
                onClick={() => setIsTagEditorOpen(true)}
              >
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5" />
                  <span>Tag people</span>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </div>
              
              {/* Tagged users pills */}
              {taggedUsers.length > 0 && (
                <div className="flex flex-wrap gap-2 py-2">
                  {taggedUsers.map(user => (
                    <div 
                      key={user.id} 
                      className="px-3 py-1 bg-primary/20 text-primary rounded-full text-sm flex items-center gap-1"
                    >
                      <span>{user.username}</span>
                      <X 
                        className="w-3.5 h-3.5 cursor-pointer ml-1 hover:text-destructive" 
                        onClick={(e) => {
                          e.stopPropagation();
                          setTaggedUsers(taggedUsers.filter(u => u.id !== user.id));
                          toast({
                            title: "Tag Removed",
                            description: `${user.displayName} has been untagged from your post`
                          });
                        }} 
                      />
                    </div>
                  ))}
                </div>
              )}
              
              <div className="flex items-center justify-between py-2"
                onClick={() => setIsLocationModalOpen(true)}
              >
                <div className="flex items-center gap-3">
                  <MapPin className="w-5 h-5" />
                  <span>Add location</span>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </div>
              
              {/* Location pills */}
              {selectedLocation && (
                <div className="flex flex-wrap gap-2 py-2">
                  <div className="px-3 py-1 bg-primary/20 text-primary rounded-full text-sm flex items-center gap-1">
                    <span>{selectedLocation.name}</span>
                    <X 
                      className="w-3.5 h-3.5 cursor-pointer ml-1 hover:text-destructive" 
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedLocation(null);
                        toast({
                          title: "Location Removed",
                          description: "The location has been removed from your post"
                        });
                      }} 
                    />
                  </div>
                </div>
              )}
              
              <div className="flex items-center justify-between py-2"
                onClick={() => {
                  toast({
                    title: "Audience",
                    description: "Choose who can see your post",
                  });
                }}
              >
                <div className="flex items-center gap-3">
                  <Eye className="w-5 h-5" />
                  <span>Audience</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Everyone</span>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </div>
              </div>
            </div>
            
            {/* Post to / Share to */}
            <div className="px-4 pb-4 border-b">
              <div className="flex items-center justify-between pb-3">
                <span className="font-medium">Post to</span>
                <ChevronRight className="w-5 h-5 text-muted-foreground transform rotate-90" />
              </div>
              
              {/* Social platforms */}
              <div className="space-y-3">
                {/* X (Twitter) */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-black text-white rounded-full flex items-center justify-center">
                      <span className="text-sm font-bold">X</span>
                    </div>
                    <div className="flex flex-col">
                      <span>Connect X (Twitter)</span>
                      <span className="text-xs text-muted-foreground">Connect to share posts</span>
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="rounded-full"
                    onClick={() => {
                      toast({
                        title: "Connect X",
                        description: "Authentication required to link your X account.",
                        action: (
                          <div className="flex gap-2 mt-2">
                            <Button variant="default" size="sm" onClick={() => toast({ title: "Connecting to X...", description: "Opening X authentication page" })}>
                              Authenticate
                            </Button>
                          </div>
                        ),
                      });
                    }}
                  >
                    Connect
                  </Button>
                </div>
                
                {/* Facebook */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center">
                      <Facebook className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col">
                      <span>Connect Facebook</span>
                      <span className="text-xs text-muted-foreground">Connect to share posts</span>
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="rounded-full"
                    onClick={() => {
                      toast({
                        title: "Connect Facebook",
                        description: "Authentication required to link your Facebook account.",
                        action: (
                          <div className="flex gap-2 mt-2">
                            <Button variant="default" size="sm" onClick={() => toast({ title: "Connecting to Facebook...", description: "Opening Facebook authentication page" })}>
                              Authenticate
                            </Button>
                          </div>
                        ),
                      });
                    }}
                  >
                    Connect
                  </Button>
                </div>
                
                {/* Instagram */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-pink-500 via-purple-500 to-yellow-500 text-white rounded-full flex items-center justify-center">
                      <Instagram className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col">
                      <span>Connect Instagram</span>
                      <span className="text-xs text-muted-foreground">Connect to share posts</span>
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="rounded-full"
                    onClick={() => {
                      toast({
                        title: "Connect Instagram",
                        description: "Authentication required to link your Instagram account.",
                        action: (
                          <div className="flex gap-2 mt-2">
                            <Button variant="default" size="sm" onClick={() => toast({ title: "Connecting to Instagram...", description: "Opening Instagram authentication page" })}>
                              Authenticate
                            </Button>
                          </div>
                        ),
                      });
                    }}
                  >
                    Connect
                  </Button>
                </div>
                
                {/* TikTok */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-black text-white rounded-full flex items-center justify-center">
                      <span className="text-sm font-bold">TT</span>
                    </div>
                    <div className="flex flex-col">
                      <span>Connect TikTok</span>
                      <span className="text-xs text-muted-foreground">Connect to share posts</span>
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="rounded-full"
                    onClick={() => {
                      toast({
                        title: "Connect TikTok",
                        description: "Authentication required to link your TikTok account.",
                        action: (
                          <div className="flex gap-2 mt-2">
                            <Button variant="default" size="sm" onClick={() => toast({ title: "Connecting to TikTok...", description: "Opening TikTok authentication page" })}>
                              Authenticate
                            </Button>
                          </div>
                        ),
                      });
                    }}
                  >
                    Connect
                  </Button>
                </div>
                
                {/* YouTube */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-red-600 text-white rounded-full flex items-center justify-center">
                      <span className="text-xs font-bold">YT</span>
                    </div>
                    <div className="flex flex-col">
                      <span>Connect YouTube</span>
                      <span className="text-xs text-muted-foreground">Connect to share posts</span>
                    </div>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="rounded-full"
                    onClick={() => {
                      toast({
                        title: "Connect YouTube",
                        description: "Authentication required to link your YouTube account.",
                        action: (
                          <div className="flex gap-2 mt-2">
                            <Button variant="default" size="sm" onClick={() => toast({ title: "Connecting to YouTube...", description: "Opening YouTube authentication page" })}>
                              Authenticate
                            </Button>
                          </div>
                        ),
                      });
                    }}
                  >
                    Connect
                  </Button>
                </div>
              </div>
            </div>
            
            {/* Your story toggle */}
            <div className="flex items-center justify-between px-4 pb-4">
              <div className="flex items-center gap-3">
                <Share className="w-5 h-5" />
                <span>Your story</span>
              </div>
              <div 
                className="w-12 h-6 bg-gray-200 rounded-full relative cursor-pointer group"
                onClick={() => {
                  const toggle = document.getElementById('story-toggle');
                  if (toggle) {
                    const isActive = toggle.classList.contains('active');
                    if (isActive) {
                      toggle.classList.remove('active', 'bg-primary');
                      toggle.classList.add('bg-gray-200');
                      toggle.querySelector('div')?.classList.remove('translate-x-5');
                      toggle.querySelector('div')?.classList.add('translate-x-0');
                      
                      toast({
                        title: "Story disabled",
                        description: "This post will not be added to your story",
                      });
                    } else {
                      toggle.classList.add('active', 'bg-primary');
                      toggle.classList.remove('bg-gray-200');
                      toggle.querySelector('div')?.classList.add('translate-x-5');
                      toggle.querySelector('div')?.classList.remove('translate-x-0');
                      
                      toast({
                        title: "Added to Story",
                        description: "This post will also be added to your story",
                      });
                    }
                  }
                }}
                id="story-toggle"
              >
                <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transform transition-transform duration-200 ease-in-out"></div>
              </div>
            </div>
          </div>
          
          {/* Original Options Panel (keeping for reference) */}
          <div className="hidden">
            <PostOptionsPanel 
              content={content}
              onContentChange={setContent}
            />
          </div>

          {/* Poll Modal */}
          <PollCreator 
            isOpen={isPollModalOpen}
            onClose={() => setIsPollModalOpen(false)}
            onSave={(data) => {
              setPollData(data);
              toast({
                title: "Poll Added",
                description: "Your poll has been added to the post"
              });
            }}
          />

          {/* Location Picker Modal */}
          <LocationPicker 
            isOpen={isLocationModalOpen}
            onClose={() => setIsLocationModalOpen(false)}
            onSelect={(location) => {
              setSelectedLocation(location);
              toast({
                title: "Location Added",
                description: `Added ${location.name} to your post`
              });
            }}
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