import { useState } from "react";
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
import { Loader2, Upload } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import InstagramImagePicker from "./InstagramImagePicker";

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
  const [showImagePicker, setShowImagePicker] = useState(false);
  
  // Set up form with default values from user data
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: user.displayName,
      bio: user.bio || "",
    },
  });

  // Handle selected image from picker
  const handleImageSelected = (file: File) => {
    setSelectedImage(file);
    
    // Create preview URL for the cropped image
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };
  
  // Open image picker
  const handleChooseImage = () => {
    setShowImagePicker(true);
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
    <>
      <Dialog open={isOpen} onOpenChange={onClose} modal={true}>
        <DialogContent className="w-full h-[100dvh] max-w-full p-0 rounded-none border-none overflow-auto">
          <div className="p-4 sm:p-6 max-w-3xl mx-auto">
            <DialogHeader className="mb-6">
              <DialogTitle className="text-2xl">Edit Profile</DialogTitle>
              <DialogDescription className="text-base">
                Update your personal information
              </DialogDescription>
            </DialogHeader>
            
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
                      onClick={handleChooseImage}
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
                    
                    <div className="text-center">
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm"
                        onClick={handleChooseImage}
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
          </div>
        </DialogContent>
      </Dialog>

      {/* Instagram-style image picker */}
      <InstagramImagePicker 
        isOpen={showImagePicker}
        onClose={() => setShowImagePicker(false)}
        onImageSelected={handleImageSelected}
      />
    </>
  );
}