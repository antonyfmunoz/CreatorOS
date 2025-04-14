import { useState, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { X, Upload, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PostOptionsPanel } from "@/components/feed/PostOptionsPanel";

interface PhotoUploaderProps {
  onClose: () => void;
}

export const PhotoUploader = ({ onClose }: PhotoUploaderProps) => {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [activeTab, setActiveTab] = useState<"preview" | "options">("preview");
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
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
  
  // Instagram-inspired UI
  return (
    <div className="relative w-full h-screen bg-background text-foreground">
      {imagePreview ? (
        // Image preview mode with tabs for Options
        <div className="flex flex-col h-full">
          {/* Top bar */}
          <div className="flex justify-between items-center p-4 border-b">
            <button onClick={onClose} className="text-xl">✕</button>
            <h2 className="text-lg font-medium">New Post</h2>
            <Button 
              variant="ghost" 
              size="sm" 
              disabled={createPostMutation.isPending}
              onClick={handlePost}
            >
              {createPostMutation.isPending ? "Posting..." : "Next"}
            </Button>
          </div>
          
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "preview" | "options")}>
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="preview">Preview</TabsTrigger>
              <TabsTrigger value="options">Options</TabsTrigger>
            </TabsList>
            
            <TabsContent value="preview" className="h-[calc(100vh-180px)] flex flex-col">
              {/* Image preview */}
              <div className="flex-grow flex justify-center items-center bg-black">
                <img 
                  src={imagePreview} 
                  alt="Preview" 
                  className="max-h-full max-w-full object-contain" 
                />
              </div>
              
              {/* Caption input */}
              <div className="p-4">
                <textarea
                  className="w-full p-3 mb-4 border border-border rounded min-h-[100px] resize-none"
                  placeholder="Write a caption..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  disabled={createPostMutation.isPending}
                />
                
                <div className="flex justify-between">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setImageFile(null);
                      setImagePreview(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    disabled={createPostMutation.isPending}
                  >
                    Change Photo
                  </Button>
                  
                  <Button 
                    onClick={handlePost}
                    disabled={createPostMutation.isPending || !imageFile}
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
        // Photo selection mode with Instagram-inspired UI
        <>
          {/* Top bar */}
          <div className="flex justify-between items-center p-4 border-b">
            <button onClick={onClose} className="text-xl">✕</button>
            <h2 className="text-lg font-medium">New Post</h2>
            <div className="w-10"></div> {/* Empty space for symmetry */}
          </div>

          {/* Center Upload Button */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="bg-muted-foreground/10 rounded-lg p-10 flex flex-col items-center max-w-xs mx-auto">
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
              <Button onClick={triggerFileSelect}>
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
        </>
      )}
    </div>
  );
};