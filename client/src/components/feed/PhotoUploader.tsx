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
  Share,
  BarChart2,
  Instagram,
  Facebook,
  Camera,
  RefreshCw
} from "lucide-react";
import { PollCreator, type PollData } from "@/components/feed/PollCreator";
import { LocationPicker, type LocationData } from "@/components/feed/LocationPicker";
import { TagEditor, type TaggedUser } from "@/components/feed/TagEditor";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PostOptionsPanel } from "@/components/feed/PostOptionsPanel";
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
  const [showTagLabels, setShowTagLabels] = useState(false);
  const [addToStory, setAddToStory] = useState(false);
  const [cameraMode, setCameraMode] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [showOptionsPanel, setShowOptionsPanel] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
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
  
  // Start camera with the current facing mode
  const startCamera = async () => {
    try {
      // Stop any existing camera streams first
      stopCamera();
      
      setCameraError(null);
      setCameraMode(true);
      
      // Short delay to ensure UI state is updated before attempting camera access
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const constraints = {
        audio: false,
        video: { 
          facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }, 
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Ensure the video element is properly initialized
        videoRef.current.onloadedmetadata = () => {
          if (videoRef.current) videoRef.current.play();
        };
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      setCameraError('Could not access camera. Please check permissions.');
      setCameraMode(false);
    }
  };
  
  // Switch between front and back cameras
  const switchCamera = async () => {
    try {
      // Get the new facing mode (opposite of current)
      const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
      
      // First set the facing mode
      setFacingMode(newFacingMode);
      
      // Get all tracks from the stream and stop them
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
      
      // Set camera mode to maintain state
      setCameraMode(true);
      
      // Request new stream with different camera
      const constraints = {
        audio: false,
        video: { 
          facingMode: newFacingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }, 
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error('Error switching camera:', error);
      // If switching fails, attempt to revert to previous camera
      const previousMode = facingMode; // Save current before changing
      setFacingMode(previousMode);
      
      try {
        const constraints = {
          audio: false,
          video: { facingMode: previousMode }
        };
        
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (fallbackError) {
        console.error('Failed to fallback to previous camera:', fallbackError);
        setCameraError('Camera switching failed. Please try again.');
        stopCamera();
      }
    }
  };
  
  // Stop and release camera
  const stopCamera = () => {
    setCameraMode(false);
    
    // Get all tracks from the stream and stop them
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };
  
  // Take a photo from the camera stream
  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // Set canvas dimensions to match the video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Draw the current video frame to the canvas
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Apply horizontal flip for selfie camera
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Convert canvas to blob
    canvas.toBlob((blob) => {
      if (!blob) return;
      
      // Create a file from the blob
      const file = new File([blob], `camera-photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
      
      // Create a preview URL
      const previewUrl = URL.createObjectURL(blob);
      
      // Update state with the new file and preview
      setImageFiles([...imageFiles, file]);
      setImagePreviews([...imagePreviews, previewUrl]);
      setCurrentImageIndex(imagePreviews.length); // Set to the new image
      
      // Exit camera mode
      stopCamera();
    }, 'image/jpeg', 0.95);
  };
  
  // Modified to handle custom close behavior for both screens
  const handleClose = useCallback(() => {
    // Stop camera if it's active
    stopCamera();
    
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
    onSuccess: (data) => {
      // No toast notification, just update the cache
      queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
      
      // If adding to story, also invalidate stories query to refresh immediately
      if (addToStory) {
        // Invalidate the cache first
        queryClient.invalidateQueries({ queryKey: ['/api/stories'] });
        
        // Force an immediate refetch to update the UI
        queryClient.refetchQueries({ queryKey: ['/api/stories'] });
      }
      
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
    formData.append('addToStory', String(addToStory));
    
    // Add tagged users data if present
    if (taggedUsers.length > 0) {
      formData.append('taggedUsers', JSON.stringify(taggedUsers));
    }
    
    // Add location data if present
    if (selectedLocation) {
      formData.append('location', JSON.stringify(selectedLocation));
    }
    
    // Add poll data if present
    if (pollData) {
      formData.append('pollData', JSON.stringify(pollData));
    }
    
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
      <div className="flex min-h-dvh flex-col overflow-hidden bg-black text-white">
        <h1 className="sr-only">Create New Photo Post</h1>
        
        {/* Top Bar - Instagram-like header */}
        <div className="flex h-[58px] items-center justify-between border-b border-zinc-800 p-4">
          <div className="w-10 h-6 flex items-center justify-center"></div> {/* Empty space matched to X button size */}
          <h2 className="text-lg font-medium">New post</h2>
          <div className="w-10 h-6"></div> {/* Empty space to balance the header */}
        </div>
        
        {/* Scrollable Content */}
        <div 
          ref={scrollContainerRef}
          className="flex-grow overflow-y-auto"
        >
          {/* Image preview carousel */}
          <div 
            className="relative flex aspect-square w-full items-center justify-center bg-zinc-900"
            onClick={() => {
              if (taggedUsers.length > 0) {
                setShowTagLabels(!showTagLabels);
              }
            }}
          >
            <img 
              src={imagePreviews[currentImageIndex]} 
              alt={`Preview ${currentImageIndex + 1}`} 
              className="max-h-full max-w-full object-contain cursor-pointer" 
            />
            
            {/* Tagged users indicators */}
            {taggedUsers.length > 0 && currentImageIndex === 0 && (
              <>
                {taggedUsers.map((user) => (
                  <div key={user.id} className="relative">
                    {/* Instagram-style tag marker (removing the "U" icon as requested) */}
                    <div 
                      className="absolute w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center cursor-pointer transform -translate-x-1/2 -translate-y-1/2 shadow-md border border-white"
                      style={{ 
                        left: `${user.positionX * 100}%`, 
                        top: `${user.positionY * 100}%`,
                        zIndex: 10
                      }}
                      onClick={(e) => {
                        e.stopPropagation(); // Prevent toggling the labels
                      }}
                    >
                      {/* Letter removed as requested */}
                    </div>
                    
                    {/* Username label (visible only when showTagLabels is true) */}
                    {showTagLabels && (
                      <div 
                        className="absolute bg-black/80 text-white py-1 px-3 text-sm transform -translate-x-1/2 whitespace-nowrap shadow-md"
                        style={{ 
                          left: `${user.positionX * 100}%`, 
                          top: `${user.positionY * 100 + 4}%`, // Position below the tag dot
                          zIndex: 20 
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          // In a real app, navigate to the user's profile
                          toast({
                            title: "Navigating",
                            description: `Going to @${user.username}'s profile`
                          });
                        }}
                      >
                        {user.username}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
            
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
            
            {/* Remove current image button - hidden as requested */}
            
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
          <div className="border-b border-zinc-800 p-4">
            <textarea
              className="w-full resize-none rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-white placeholder:text-zinc-500"
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
                <button 
                  type="button"
                  className="flex items-center justify-center gap-2 px-4 py-2 rounded-full border border-border cursor-pointer bg-transparent"
                  onClick={() => {
                    setIsPollModalOpen(true);
                  }}
                >
                  <BarChart2 className="w-4 h-4" /> <span className="inline-block">Poll</span>
                </button>
              )}
            </div>
            
            {/* Tag people, products, location, audience */}
            <div className="space-y-4 px-4 pb-4 border-b">
              <button 
                type="button"
                className="flex items-center justify-between w-full py-2 px-0 bg-transparent border-none cursor-pointer"
                onClick={() => {
                  setIsTagEditorOpen(true);
                }}
              >
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5" />
                  <span>Tag people</span>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>
              
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
              
              <button 
                type="button"
                className="flex items-center justify-between w-full py-2 px-0 bg-transparent border-none cursor-pointer"
                onClick={() => {
                  setIsLocationModalOpen(true);
                }}
              >
                <div className="flex items-center gap-3">
                  <MapPin className="w-5 h-5" />
                  <span>Add location</span>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>
              
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
              
            </div>
            
            {/* Post to / Share to */}
            <div className="px-4 pb-4 border-b">
              <div className="flex items-center justify-between pb-3">
                <span className="font-medium">Post to CreativesOS</span>
                <ChevronRight className="w-5 h-5 text-muted-foreground transform rotate-90" />
              </div>
              
              {/* Social platforms */}
              <div className="hidden" aria-hidden="true">
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
              <Switch
                id="story-toggle"
                checked={addToStory}
                onCheckedChange={setAddToStory}
                aria-label="Add photo post to your story"
              />
            </div>
            
            {/* Share Button */}
            <div className="sticky bottom-0 w-full border-t border-zinc-800 bg-black px-4 pb-4 pt-2">
              <Button 
                className="flex w-full items-center justify-center rounded-xl bg-[#1d9bf0] py-2 text-white hover:bg-[#1a8cd8]"
                onClick={handlePost}
              >
                Share
              </Button>
            </div>
          </div>
          
          {/* Options Panel shown when showOptionsPanel is true */}
          {showOptionsPanel && (
            <div className="fixed inset-0 z-[100] bg-white overflow-y-auto flex flex-col">
              {/* Top Bar */}
              <div className="flex items-center justify-between px-4 py-3 border-b bg-white z-50">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="rounded-full h-8 w-8" 
                  onClick={() => setShowOptionsPanel(false)}
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <span className="font-semibold text-lg">
                  New post
                </span>
                <div className="w-8"></div> {/* Spacer for centering title */}
              </div>
              
              {/* Updated Options Panel with onShare handler */}
              <div className="flex-grow overflow-auto">
                <PostOptionsPanel 
                  content={content}
                  onContentChange={setContent}
                  addToStory={addToStory}
                  onAddToStoryChange={setAddToStory}
                  onShare={handlePost}
                  isSharing={createPostMutation.isPending}
                  shareDisabled={imageFiles.length === 0}
                />
              </div>
            </div>
          )}

          {/* Poll Modal */}
          {isPollModalOpen && (
            <div className="fixed inset-0 z-[100] bg-background overflow-y-auto">
              <PollCreator 
                isOpen={true}
                onClose={() => {
                  setIsPollModalOpen(false);
                }}
                onSave={(data) => {
                  setPollData(data);
                  toast({
                    title: "Poll Added",
                    description: "Your poll has been added to the post"
                  });
                }}
              />
            </div>
          )}

          {/* Location Picker Modal */}
          {isLocationModalOpen && (
            <div className="fixed inset-0 z-[100] bg-background overflow-y-auto">
              <LocationPicker 
                isOpen={true}
                onClose={() => {
                  setIsLocationModalOpen(false);
                }}
                onSelect={(location) => {
                  setSelectedLocation(location);
                  toast({
                    title: "Location Added",
                    description: `Added ${location.name} to your post`
                  });
                }}
              />
            </div>
          )}

          {/* Tag Editor Modal */}
          {isTagEditorOpen && (
            <div className="fixed inset-0 z-[100] bg-background overflow-y-auto">
              <TagEditor
                isOpen={true}
                onClose={() => {
                  setIsTagEditorOpen(false);
                }}
                image={currentImageIndex >= 0 ? imagePreviews[currentImageIndex] : undefined}
                initialTags={taggedUsers}
                onTagSave={(users) => {
                  setTaggedUsers(users);
                  toast({
                    title: "Tags Saved",
                    description: `${users.length} people tagged in your post`
                  });
                }}
              />
            </div>
          )}
        </div>
      </div>
    );
  }
  
  // Photo selection mode with Instagram-inspired UI, similar to story creator
  return (
    <div className="flex h-[100vh] w-full flex-col bg-black text-white">
      <h1 className="sr-only">Create New Photo Post</h1>
      
      {/* Top bar - exactly like story creator */}
      <div className="z-50 flex items-center justify-between border-b border-zinc-800 bg-black px-4 py-3">
        <Button 
          variant="ghost" 
          size="icon" 
          className="rounded-full h-8 w-8" 
          onClick={onClose}
          aria-label="Cancel photo post"
        >
          <X className="h-5 w-5" />
        </Button>
        <span className="font-semibold text-lg">
          New post
        </span>
        <div className="w-8"></div> {/* Spacer for centering title */}
      </div>

      {/* Main content area - will grow to fill available space */}
      <div className="flex-grow overflow-auto">
        <div className="flex items-center justify-center min-h-full">
          {!cameraMode ? (
            <div className="flex flex-col items-center w-full max-w-md px-4">
              <p className="mb-8 text-center text-zinc-400">
                Add photos or videos to your post to share with your followers.
              </p>
              
              <div className="w-full grid grid-cols-2 gap-4">
                <Button
                  variant="outline"
                  size="lg"
                  className="flex h-32 w-full flex-col items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900 text-white hover:bg-zinc-800"
                  onClick={triggerFileSelect}
                >
                  <Upload className="h-7 w-7 mb-2" />
                  <span>Upload</span>
                </Button>
                
                <Button
                  variant="outline"
                  size="lg"
                  className="flex h-32 w-full flex-col items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900 text-white hover:bg-zinc-800"
                  onClick={startCamera}
                >
                  <Camera className="h-7 w-7 mb-2" />
                  <span>Camera</span>
                </Button>
                
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*"
                  onChange={handleFileChange}
                  multiple
                />
              </div>
              
              {cameraError && (
                <div className="text-red-500 text-center mt-2">
                  {cameraError}
                </div>
              )}
            </div>
          ) : (
            <div className="w-full h-full bg-black">
              {/* Camera view */}
              <div className="flex flex-col items-center h-full">
                <video 
                  ref={videoRef}
                  autoPlay 
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)' }} // Mirror for selfie view only
                />
                
                {/* Hidden canvas for capturing images */}
                <canvas ref={canvasRef} className="hidden" />
                
                {/* Camera controls */}
                <div className="fixed bottom-24 left-1/2 transform -translate-x-1/2">
                  <Button
                    variant="default"
                    size="icon"
                    className="rounded-full h-20 w-20 flex items-center justify-center mx-auto"
                    onClick={capturePhoto}
                  >
                    <div className="bg-white rounded-full h-16 w-16 border-2 border-primary"></div>
                  </Button>
                </div>
                
                {/* Camera mode switch button - positioned at the right */}
                <div className="fixed bottom-24 right-6">
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-full h-14 w-14 flex items-center justify-center bg-white/20 backdrop-blur-sm border-white/40 text-white hover:bg-white/30"
                    onClick={switchCamera}
                  >
                    <RefreshCw className="h-6 w-6" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
