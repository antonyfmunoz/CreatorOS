import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { X, Check, Upload, ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { User } from "@shared/schema";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

// Define the form schema
const profileSchema = z.object({
  displayName: z.string().min(2, {
    message: "Display name must be at least 2 characters.",
  }).max(30, {
    message: "Display name cannot exceed 30 characters."
  }),
  username: z.string().min(2, {
    message: "Username must be at least 2 characters.",
  }).max(20, {
    message: "Username cannot exceed 20 characters."
  }).regex(/^[a-zA-Z0-9_]+$/, {
    message: "Username can only contain letters, numbers, and underscores."
  }).transform(val => val.toLowerCase()),
  bio: z.string().max(150, {
    message: "Bio cannot exceed 150 characters."
  }).optional().nullable(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

interface InstagramEditProfileProps {
  user: User;
  isOpen: boolean;
  onClose: () => void;
}

export default function InstagramEditProfile({ 
  user, 
  isOpen, 
  onClose 
}: InstagramEditProfileProps) {
  const { updateProfileMutation, uploadProfileImageMutation } = useAuth();
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(user.profileImageUrl || undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showImagePicker, setShowImagePicker] = useState(false);

  // Set up form with default values from user data
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: user.displayName,
      username: user.username,
      bio: user.bio || "",
    },
  });
  
  const isFormDirty = form.formState.isDirty || !!selectedImage;

  // Trigger file input click
  const handleChooseImage = () => {
    fileInputRef.current?.click();
  };

  // Handle image selection
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedImage(file);
      
      // Create preview URL
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-white">
      {/* Header - Sticky */}
      <div className="sticky top-0 flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white z-10">
        <button 
          onClick={onClose}
          className="text-black"
          aria-label="Back"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-lg font-semibold text-center flex-1">Edit Profile</h1>
        <button 
          onClick={form.handleSubmit(onSubmit)}
          className={`text-blue-500 font-semibold ${!isFormDirty ? 'opacity-50' : 'opacity-100'}`}
          disabled={!isFormDirty || form.formState.isSubmitting || uploadProfileImageMutation.isPending}
          aria-label="Save"
        >
          {form.formState.isSubmitting || uploadProfileImageMutation.isPending ? 
            "Saving..." : "Done"}
        </button>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Profile Image - Centered */}
        <div className="flex flex-col items-center mb-6">
          <Avatar className="w-24 h-24 mb-2">
            <AvatarImage src={previewUrl} alt={user.displayName} />
            <AvatarFallback className="text-lg">
              {user.displayName?.charAt(0) || "U"}
            </AvatarFallback>
          </Avatar>
          <button 
            onClick={handleChooseImage}
            className="text-blue-500 text-sm font-medium"
          >
            Change profile photo
          </button>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            accept="image/*"
            onChange={handleImageChange}
          />
        </div>

        {/* Form */}
        <Form {...form}>
          <form className="space-y-4">
            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-gray-700">Name</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Name" 
                      className="rounded-sm border-gray-300" 
                      {...field} 
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
                  <FormLabel className="text-gray-700">Username</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Username" 
                      className="rounded-sm border-gray-300" 
                      {...field} 
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
                  <FormLabel className="text-gray-700">Bio</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Write a short bio..." 
                      className="resize-none rounded-sm border-gray-300"
                      rows={4}
                      value={typeof field.value === 'string' ? field.value : ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                      ref={field.ref}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="pt-4">
              <Button
                type="submit"
                onClick={form.handleSubmit(onSubmit)}
                disabled={!isFormDirty || form.formState.isSubmitting || uploadProfileImageMutation.isPending}
                className="w-full"
              >
                {form.formState.isSubmitting || uploadProfileImageMutation.isPending ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Saving Changes
                  </span>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}