import { useState, useRef, useCallback } from "react";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { User } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, Upload, X, Check } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import ReactCrop, { type Crop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

// Define the form schema
const profileSchema = z.object({
  displayName: z.string().min(2, {
    message: "Display name must be at least 2 characters.",
  }),
  bio: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

interface ProfileEditFormProps {
  user: User;
  isOpen: boolean;
  onClose: () => void;
}

export default function ProfileEditForm({ user, isOpen, onClose }: ProfileEditFormProps) {
  const { updateProfileMutation, uploadProfileImageMutation } = useAuth();
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(user.profileImageUrl || undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  
  // Cropping state
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<Crop>();
  const [isCropping, setIsCropping] = useState(false);
  const [imgSrc, setImgSrc] = useState<string>("");
  
  // Set up form with default values from user data
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: user.displayName,
      bio: user.bio || "",
    },
  });

  // Center and create initial crop with aspect ratio
  const centerAspectCrop = useCallback(
    (mediaWidth: number, mediaHeight: number, aspect: number) => {
      return centerCrop(
        makeAspectCrop(
          {
            unit: '%',
            width: 90,
          },
          aspect,
          mediaWidth,
          mediaHeight,
        ),
        mediaWidth,
        mediaHeight,
      )
    },
    [],
  );

  // When image loads, set up initial crop
  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget;
    // Initialize with a centered circular crop
    setCrop(centerAspectCrop(width, height, 1));
  }

  // Handle image selection
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedImage(file);
      
      // Create a src URL for the cropper
      const reader = new FileReader();
      reader.onloadend = () => {
        setImgSrc(reader.result as string);
        setIsCropping(true); // Show cropping interface
      };
      reader.readAsDataURL(file);
    }
  };
  
  // Convert the cropped area to a File object
  const getCroppedImg = useCallback(() => {
    if (!imgRef.current || !completedCrop) return;
    
    const image = imgRef.current;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Calculate pixel values from percentages
    const scaleX = image.naturalWidth / 100;
    const scaleY = image.naturalHeight / 100;
    
    // Set canvas size to the cropped size
    canvas.width = completedCrop.width * scaleX;
    canvas.height = completedCrop.height * scaleY;
    
    // Draw the cropped image onto the canvas
    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY
    );
    
    // Convert canvas to blob
    return new Promise<File>((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) return;
        const file = new File([blob], "cropped-profile.png", { 
          type: "image/png" 
        });
        resolve(file);
      }, 'image/png');
    });
  }, [completedCrop]);

  // Handle saving the cropped image
  const handleCropSave = async () => {
    if (!completedCrop) return;
    
    try {
      const croppedFile = await getCroppedImg();
      if (croppedFile) {
        setSelectedImage(croppedFile);
        
        // Create preview URL for the cropped image
        const reader = new FileReader();
        reader.onloadend = () => {
          setPreviewUrl(reader.result as string);
          setIsCropping(false); // Hide cropping interface
        };
        reader.readAsDataURL(croppedFile);
      }
    } catch (error) {
      console.error('Error cropping image:', error);
    }
  };
  
  // Cancel cropping
  const handleCropCancel = () => {
    setIsCropping(false);
    if (!previewUrl) {
      setSelectedImage(null);
    }
  };
  
  // Trigger file input click
  const handleImageClick = () => {
    fileInputRef.current?.click();
  };
  
  function onSubmit(values: ProfileFormValues) {
    // First update the profile text fields
    updateProfileMutation.mutate({
      id: user.id,
      displayName: values.displayName,
      bio: values.bio || null,
    }, {
      onSuccess: () => {
        // If there's an image selected, upload it after updating profile
        if (selectedImage) {
          uploadProfileImageMutation.mutate({
            id: user.id,
            imageFile: selectedImage
          }, {
            onSuccess: () => {
              onClose();
            }
          });
        } else {
          onClose();
        }
      }
    });
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose} modal={true}>
      <DialogContent className="w-full h-[100dvh] max-w-full p-0 rounded-none border-none overflow-auto">
        <div className="p-4 sm:p-6 max-w-3xl mx-auto">
          <DialogHeader className="mb-6">
            <DialogTitle className="text-2xl">{isCropping ? "Crop Profile Image" : "Edit Profile"}</DialogTitle>
            <DialogDescription className="text-base">
              {isCropping ? "Adjust the crop area for your profile picture" : "Update your personal information"}
            </DialogDescription>
          </DialogHeader>
        
          {isCropping ? (
            <div className="space-y-4">
              <div className="flex flex-col items-center">
                {!!imgSrc && (
                  <ReactCrop
                    crop={crop}
                    onChange={(c) => setCrop(c)}
                    onComplete={(c) => setCompletedCrop(c)}
                    aspect={1}
                    circularCrop
                    className="max-h-[300px] object-contain"
                  >
                    <img
                      ref={imgRef}
                      alt="Upload"
                      src={imgSrc}
                      onLoad={onImageLoad}
                      className="max-w-full h-auto"
                    />
                  </ReactCrop>
                )}
                <div className="text-center mt-2 text-sm text-muted-foreground">
                  Drag to reposition. Resize using the corners.
                </div>
              </div>
              
              <div className="flex justify-end gap-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleCropCancel}
                  className="flex items-center"
                >
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
                <Button 
                  type="button" 
                  onClick={handleCropSave}
                  className="flex items-center"
                >
                  <Check className="mr-2 h-4 w-4" />
                  Apply Crop
                </Button>
              </div>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="displayName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display name</FormLabel>
                      <FormControl>
                        <Input placeholder="Your display name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="bio"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bio</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Tell us about yourself" 
                          className="resize-none"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="space-y-2">
                  <FormLabel>Profile Image</FormLabel>
                  <div className="flex flex-col items-center gap-4">
                    <div 
                      className="relative cursor-pointer group"
                      onClick={handleImageClick}
                    >
                      <Avatar className="w-24 h-24">
                        <AvatarImage src={previewUrl ? previewUrl : undefined} alt={user.displayName} />
                        <AvatarFallback className="text-xl">
                          {user.displayName?.charAt(0) || "U"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="absolute inset-0 bg-black bg-opacity-50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Upload className="h-8 w-8 text-white" />
                      </div>
                    </div>
                    
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept="image/*"
                      onChange={handleImageChange}
                    />
                    
                    <div className="text-center">
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm"
                        onClick={handleImageClick}
                      >
                        Choose Image
                      </Button>
                      <FormDescription className="text-xs mt-1">
                        Tap to upload a profile picture from your device
                      </FormDescription>
                    </div>
                  </div>
                </div>
                
                <DialogFooter>
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={onClose}
                    disabled={updateProfileMutation.isPending || uploadProfileImageMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit"
                    disabled={updateProfileMutation.isPending || uploadProfileImageMutation.isPending}
                  >
                    {updateProfileMutation.isPending || uploadProfileImageMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save changes"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}