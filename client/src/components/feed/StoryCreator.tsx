import { useState, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import { 
  Dialog, 
  DialogContent, 
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Upload, X, Camera, RefreshCw } from 'lucide-react';

interface StoryCreatorProps {
  isOpen: boolean;
  onClose: () => void;
}

export const StoryCreator = ({ isOpen, onClose }: StoryCreatorProps) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [cameraMode, setCameraMode] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  
  // Cleanup camera on unmount
  useEffect(() => {
    return () => {
      // Clean up any camera streams when component unmounts
      stopCamera();
    };
  }, []);
  
  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) {
      return;
    }
    
    const file = e.target.files[0];
    
    // Set the file first before creating the preview
    setSelectedFile(file);
    
    // Create preview
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    
    // Make sure cameraMode is off
    setCameraMode(false);
    
    // Reset input value to allow selecting the same file again
    e.target.value = '';
    
    console.log('File selected:', file.name, 'type:', file.type, 'size:', file.size);
  };
  
  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch('/api/stories', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!res.ok) {
        throw new Error('Failed to upload story');
      }
      
      return res.json();
    },
    onSuccess: () => {
      // Invalidate and immediately refetch stories data
      console.log('Story created, refreshing stories data');
      queryClient.invalidateQueries({ queryKey: ['/api/stories'] });
      
      // Force an immediate refetch
      queryClient.refetchQueries({ queryKey: ['/api/stories'] });
      
      toast({
        title: 'Story uploaded',
        description: 'Your story has been successfully uploaded.',
      });
      
      handleClose();
    },
    onError: (error) => {
      toast({
        title: 'Upload failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
  
  // Handle upload
  const handleUpload = () => {
    if (!selectedFile || !user) {
      toast({
        title: 'Error',
        description: 'Please select a file to upload',
        variant: 'destructive',
      });
      return;
    }
    
    const formData = new FormData();
    formData.append('userId', user.id.toString());
    formData.append('mediaType', selectedFile.type.startsWith('image/') ? 'image' : 'video');
    formData.append('caption', caption);
    formData.append('media', selectedFile);
    
    uploadMutation.mutate(formData);
  };
  
  // Start camera
  const startCamera = async () => {
    try {
      // Stop any existing streams
      stopCamera();
      
      // Set camera mode
      setCameraMode(true);
      setCameraError(null);
      
      // Request camera access with current facing mode
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode }, 
        audio: false 
      });
      
      // Save stream reference
      streamRef.current = stream;
      
      // Connect stream to video element if it exists
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      setCameraError('Could not access camera. Please check permissions.');
      setCameraMode(false);
      
      toast({
        title: 'Camera Error',
        description: 'Could not access camera. Please check permissions.',
        variant: 'destructive'
      });
    }
  };
  
  // Switch between front and back cameras
  const switchCamera = async () => {
    // Toggle facing mode
    const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newFacingMode);
    
    try {
      // Stop current stream
      stopCamera();
      
      // Set camera mode
      setCameraMode(true);
      setCameraError(null);
      
      // Request camera access with new facing mode
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: newFacingMode }, 
        audio: false 
      });
      
      // Save stream reference
      streamRef.current = stream;
      
      // Connect stream to video element if it exists
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (error) {
      console.error('Error switching camera:', error);
      setCameraError('Could not switch camera. Device may only have one camera.');
      
      // Try to restart with previous mode
      setFacingMode(facingMode);
      startCamera();
    }
  };
  
  // Stop camera and clean up stream
  const stopCamera = () => {
    // Get all tracks from the stream and stop them
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    // Reset video element
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setCameraMode(false);
  };
  
  // Capture photo from camera
  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // Set canvas size to match video dimensions
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Draw current video frame to canvas
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (facingMode === 'user') {
      // Flip horizontally for selfie view
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    } else {
      // No flip for back camera
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }
    
    // Convert canvas to a Blob (file)
    canvas.toBlob((blob) => {
      if (!blob) return;
      
      // Create a file from the blob
      const file = new File([blob], `camera-capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
      
      // Set as selected file
      setSelectedFile(file);
      
      // Create and set preview
      const objectUrl = URL.createObjectURL(blob);
      setPreview(objectUrl);
      
      // Exit camera mode
      stopCamera();
    }, 'image/jpeg', 0.95);
  };
  
  // Handle close with cleanup
  const handleClose = () => {
    if (preview) {
      URL.revokeObjectURL(preview);
    }
    stopCamera(); // Ensure camera is stopped
    setSelectedFile(null);
    setPreview(null);
    setCaption('');
    setCameraMode(false);
    setCameraError(null);
    onClose();
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={handleClose} modal={true}>
      <DialogContent className="max-w-full h-[100vh] p-0 overflow-hidden bg-white border-0 sm:rounded-none">
        <DialogTitle className="sr-only">
          {preview ? 'Create Story' : 'Add to Your Story'}
        </DialogTitle>
        <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 border-b bg-white">
          <Button 
            variant="ghost" 
            size="icon" 
            className="rounded-full h-8 w-8" 
            onClick={handleClose}
          >
            <X className="h-5 w-5" />
          </Button>
          <span className="font-semibold text-lg">
            {preview ? 'Create Story' : 'Add to Your Story'}
          </span>
          <div className="w-8"></div> {/* Spacer for centering title */}
        </div>
        
        <div className="flex flex-col items-center justify-center mt-16">
          {!preview && !cameraMode ? (
            <div className="p-8 flex flex-col items-center">
              <DialogDescription className="text-center mb-6">
                Add photos or videos to your story. They'll disappear after 24 hours.
              </DialogDescription>
              
              <div className="w-full flex gap-2 px-2">
                <Button
                  variant="outline"
                  size="lg"
                  className="flex flex-col items-center justify-center h-28 w-full rounded-lg border"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-6 w-6 mb-2" />
                  <span>Upload</span>
                </Button>
                
                <Button
                  variant="outline"
                  size="lg"
                  className="flex flex-col items-center justify-center h-28 w-full rounded-lg border"
                  onClick={startCamera}
                >
                  <Camera className="h-6 w-6 mb-2" />
                  <span>Camera</span>
                </Button>
                
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  accept="image/*,video/*"
                  onChange={handleFileChange}
                />
              </div>
              
              {cameraError && (
                <div className="text-red-500 text-center mt-2">
                  {cameraError}
                </div>
              )}
            </div>
          ) : cameraMode ? (
            <div className="fixed inset-0 z-10 mt-12 bg-black">
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
                <div className="fixed bottom-10 inset-x-0 flex justify-center w-full gap-6">
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-full h-14 w-14 flex items-center justify-center bg-white/20 backdrop-blur-sm border-white/40 text-white hover:bg-white/30"
                    onClick={stopCamera}
                  >
                    <X className="h-6 w-6" />
                  </Button>
                  
                  <Button
                    variant="default"
                    size="icon"
                    className="rounded-full h-16 w-16 flex items-center justify-center"
                    onClick={capturePhoto}
                  >
                    <div className="bg-white rounded-full h-12 w-12 border-2 border-primary"></div>
                  </Button>
                  
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
          ) : (
            <div className="fixed inset-0 z-10 mt-12 bg-black">
              <div className="relative h-full flex flex-col">
                <div className="flex-grow flex items-center justify-center bg-black overflow-hidden">
                  {preview && selectedFile?.type.startsWith('image/') && (
                    <img 
                      src={preview} 
                      alt="Story preview" 
                      className="h-[calc(100vh-180px)] w-full object-contain"
                    />
                  )}
                  {preview && selectedFile && !selectedFile.type.startsWith('image/') && (
                    <video 
                      src={preview} 
                      controls 
                      className="h-[calc(100vh-180px)] w-full object-contain"
                    />
                  )}
                </div>
                
                {/* Back button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-4 left-4 h-8 w-8 rounded-full bg-black/30 text-white hover:bg-black/50"
                  onClick={() => {
                    if (preview) {
                      URL.revokeObjectURL(preview);
                    }
                    setSelectedFile(null);
                    setPreview(null);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
                
                {/* Caption input */}
                <div className="p-4 bg-white border-t">
                  <textarea
                    className="w-full p-3 border rounded-md resize-none"
                    placeholder="Write a caption..."
                    rows={2}
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                  />
                  
                  <Button
                    className="w-full mt-4 bg-blue-500 hover:bg-blue-600"
                    onClick={handleUpload}
                    disabled={uploadMutation.isPending}
                  >
                    {uploadMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      'Share to Story'
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};