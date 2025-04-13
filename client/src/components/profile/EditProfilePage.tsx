import { useState, useRef } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
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
} from "@/components/ui/form";
import { User } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera, Upload } from "lucide-react";

// Define the form schema
const profileSchema = z.object({
  displayName: z.string().min(2, {
    message: "Name must be at least 2 characters.",
  }).max(30, {
    message: "Name cannot be more than 30 characters."
  }),
  username: z.string().min(3, {
    message: "Username must be at least 3 characters."
  }).max(20, {
    message: "Username cannot be more than 20 characters."
  }).regex(/^[a-z0-9_.]+$/, {
    message: "Username can only contain lowercase letters, numbers, periods and underscores."
  }),
  bio: z.string().max(150, {
    message: "Bio cannot be more than 150 characters."
  }).optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

interface EditProfilePageProps {
  user: User;
  onClose: () => void;
}

export default function EditProfilePage({ user, onClose }: EditProfilePageProps) {
  const { updateProfileMutation, uploadProfileImageMutation } = useAuth();
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(user.profileImageUrl || undefined);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Set up form with default values from user data
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: user.displayName,
      username: user.username,
      bio: user.bio || "",
    },
  });

  // Track if form is dirty (has changes)
  const isDirty = form.formState.isDirty || selectedImage !== null;
  
  // Handle image file selection 
  const handleImageUpload = (file: File) => {
    setSelectedImage(file);
  };
  
  // Trigger file input click
  const triggerUpload = () => {
    fileInputRef.current?.click();
  };
  
  function onSubmit(values: ProfileFormValues) {
    // Check if username has changed and if it's different from the current username
    if (values.username !== user.username) {
      // Add username validation in the future if needed
      toast({
        title: "Changing username",
        description: "Your username will be updated",
      });
    }
    
    // First update the profile text fields
    updateProfileMutation.mutate({
      id: user.id,
      displayName: values.displayName,
      bio: values.bio || null,
    }, {
      onSuccess: () => {
        // If there's an image selected, upload it after updating profile
        if (selectedImage) {
          toast({
            title: "Uploading image",
            description: "Updating your profile picture...",
          });
          
          uploadProfileImageMutation.mutate({
            id: user.id,
            imageFile: selectedImage
          }, {
            onSuccess: () => {
              toast({
                title: "Success",
                description: "Your profile has been updated successfully!",
              });
              onClose();
            },
            onError: (error) => {
              toast({
                title: "Image upload failed",
                description: error.message,
                variant: "destructive",
              });
            }
          });
        } else {
          toast({
            title: "Success",
            description: "Your profile has been updated successfully!",
          });
          onClose();
        }
      },
      onError: (error) => {
        toast({
          title: "Update failed",
          description: error.message,
          variant: "destructive",
        });
      }
    });
  }

  // Saving state
  const isSaving = updateProfileMutation.isPending || uploadProfileImageMutation.isPending;

  return (
    <div className="flex flex-col h-screen bg-white">
      {/* Sticky Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b sticky top-0 bg-white z-10">
        <button 
          onClick={onClose}
          className="text-black p-1"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-lg font-semibold">Edit Profile</h1>
        <Button
          disabled={!isDirty || isSaving}
          onClick={form.handleSubmit(onSubmit)}
          className="text-blue-500 font-semibold bg-transparent hover:bg-transparent hover:text-blue-600"
          variant="ghost"
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Done"
          )}
        </Button>
      </header>

      <div className="flex-1 overflow-auto">
        {/* Profile Image Section */}
        <section className="flex flex-col items-center py-6">
          <div className="relative">
            {/* Hidden file input */}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              ref={fileInputRef}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                
                // Create a preview URL
                const reader = new FileReader();
                reader.onloadend = () => {
                  if (typeof reader.result === 'string') {
                    setPreviewUrl(reader.result);
                  }
                  // Set file for uploading
                  setSelectedImage(file);
                };
                reader.readAsDataURL(file);
              }}
            />
            
            {/* Avatar display with overlay */}
            <div 
              className="relative cursor-pointer group"
              onClick={triggerUpload}
            >
              <Avatar className="w-24 h-24 border border-gray-200">
                <AvatarImage 
                  src={previewUrl} 
                  alt="Profile" 
                  className="object-cover" 
                />
                <AvatarFallback className="bg-gray-100">
                  <Camera className="h-8 w-8 text-gray-500" />
                </AvatarFallback>
              </Avatar>
              
              {/* Overlay with camera icon on hover */}
              <div className="absolute inset-0 bg-black bg-opacity-30 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <Camera className="h-8 w-8 text-white" />
              </div>
            </div>
            
            <button 
              className="text-blue-500 text-sm font-medium mt-3"
              onClick={triggerUpload}
            >
              Change profile photo
            </button>
          </div>
        </section>

        {/* Form */}
        <Form {...form}>
          <form className="px-4 space-y-5">
            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-gray-500 font-medium">Name</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Your name" 
                      {...field} 
                      className="rounded-sm border-gray-300"
                      maxLength={30}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-gray-500 font-medium">Username</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="username" 
                      {...field}
                      className="rounded-sm border-gray-300 lowercase"
                      onChange={(e) => field.onChange(e.target.value.toLowerCase())}
                      maxLength={20}
                    />
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
                  <FormLabel className="text-gray-500 font-medium">Bio</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Add a bio to your profile..." 
                      className="resize-none rounded-sm border-gray-300 min-h-[100px]"
                      {...field} 
                      maxLength={150}
                    />
                  </FormControl>
                  <div className="text-xs text-gray-500 text-right">
                    {field.value?.length || 0}/150
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
      </div>
    </div>
  );
}