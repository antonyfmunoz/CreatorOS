import { useState, useRef } from 'react';
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
import { Loader2, Upload, X, Camera } from 'lucide-react';

interface StoryCreatorProps {
  isOpen: boolean;
  onClose: () => void;
}

export const StoryCreator = ({ isOpen, onClose }: StoryCreatorProps) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  
  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) {
      return;
    }
    
    const file = e.target.files[0];
    setSelectedFile(file);
    
    // Create preview
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    
    // Reset input value to allow selecting the same file again
    e.target.value = '';
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
  
  // Handle close with cleanup
  const handleClose = () => {
    if (preview) {
      URL.revokeObjectURL(preview);
    }
    setSelectedFile(null);
    setPreview(null);
    setCaption('');
    onClose();
  };
  
  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden bg-white">
        <DialogTitle className="px-4 py-3 text-center border-b">
          {preview ? 'Create Story' : 'Add to Your Story'}
        </DialogTitle>
        
        <div className="flex flex-col items-center justify-center">
          {!preview ? (
            <div className="p-8 flex flex-col items-center">
              <DialogDescription className="text-center mb-6">
                Add photos or videos to your story. They'll disappear after 24 hours.
              </DialogDescription>
              
              <div className="mb-6 flex gap-4">
                <Button
                  variant="outline"
                  size="lg"
                  className="flex flex-col items-center justify-center h-24 w-32"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-8 w-8 mb-2" />
                  <span>Upload</span>
                </Button>
                
                <Button
                  variant="outline"
                  size="lg"
                  className="flex flex-col items-center justify-center h-24 w-32"
                  onClick={() => {
                    toast({
                      title: 'Camera',
                      description: 'Camera access coming soon!',
                    });
                  }}
                >
                  <Camera className="h-8 w-8 mb-2" />
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
            </div>
          ) : (
            <div className="w-full">
              <div className="relative">
                {selectedFile?.type.startsWith('image/') ? (
                  <img 
                    src={preview} 
                    alt="Story preview" 
                    className="max-h-[70vh] w-full object-contain"
                  />
                ) : (
                  <video 
                    src={preview} 
                    controls 
                    className="max-h-[70vh] w-full object-contain"
                  />
                )}
                
                {/* Close button */}
                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/50 text-white hover:bg-black/70"
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
              </div>
              
              {/* Caption input */}
              <div className="p-4">
                <textarea
                  className="w-full p-3 border rounded-md resize-none"
                  placeholder="Write a caption..."
                  rows={2}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                />
                
                <Button
                  className="w-full mt-4"
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
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};