import { useState, useRef } from "react";
import { ArrowLeft, Camera, Link2, Loader2, Plus, Trash2 } from "lucide-react";
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
  }).transform(val => val.toLowerCase()),
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
  const initialLinks = user.profileLinks ?? [];
  const [profileLinks, setProfileLinks] = useState<Array<{ label: string; url: string }>>(initialLinks);
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
  const linksChanged = JSON.stringify(profileLinks) !== JSON.stringify(initialLinks);
  const linksValid = profileLinks.every((link) => {
    try {
      const url = new URL(link.url);
      return Boolean(link.label.trim()) && (url.protocol === "https:" || url.protocol === "http:");
    } catch {
      return false;
    }
  });
  const isDirty = form.formState.isDirty || selectedImage !== null || linksChanged;
  
  // Handle image file selection 
  const handleImageUpload = (file: File) => {
    setSelectedImage(file);
  };
  
  // Trigger file input click
  const triggerUpload = () => {
    fileInputRef.current?.click();
  };
  
  function onSubmit(values: ProfileFormValues) {
    // Ensure username is always lowercase
    const lowercaseUsername = values.username.toLowerCase();
    
    // Check if username has changed and if it's different from the current username
    if (lowercaseUsername !== user.username.toLowerCase()) {
      // Add username validation in the future if needed
      toast({
        title: "Changing username",
        description: "Your username will be updated",
      });
    }
    
    // First update the profile text fields with lowercase username
    updateProfileMutation.mutate({
      id: user.id,
      username: lowercaseUsername,
      displayName: values.displayName,
      bio: values.bio || null,
      profileLinks: profileLinks.map((link) => ({ label: link.label.trim(), url: link.url.trim() })),
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
    <div className="flex h-screen flex-col bg-black text-white">
      {/* Sticky Header - Instagram-style */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-800 bg-black px-4 py-3">
        <button 
          onClick={onClose}
          className="p-1 text-zinc-400 transition-colors hover:text-white"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-base font-semibold">Edit Profile</h1>
        <Button
          disabled={!isDirty || isSaving || !linksValid}
          onClick={form.handleSubmit(onSubmit)}
          className="h-auto bg-transparent px-0 py-0 font-semibold text-[#1d9bf0] hover:bg-transparent hover:text-[#1d9bf0]/80 disabled:text-zinc-600"
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
        {/* Profile Image Section - Centered like Instagram */}
        <section className="flex flex-col items-center py-6">
          <div className="flex flex-col items-center">
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
            
            {/* Avatar display with overlay - centered */}
            <div 
              className="relative cursor-pointer group mx-auto"
              onClick={triggerUpload}
            >
              <Avatar className="h-[77px] w-[77px] border border-zinc-700">
                <AvatarImage 
                  src={previewUrl} 
                  alt="Profile" 
                  className="object-cover" 
                />
                <AvatarFallback className="bg-zinc-900">
                  <Camera className="h-8 w-8 text-zinc-500" />
                </AvatarFallback>
              </Avatar>
              
              {/* Overlay with camera icon on hover */}
              <div className="absolute inset-0 bg-black bg-opacity-30 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <Camera className="h-8 w-8 text-white" />
              </div>
            </div>
            
            <button 
              className="mt-3 text-center text-sm font-medium text-[#1d9bf0]"
              onClick={triggerUpload}
            >
              Change profile photo
            </button>
          </div>
        </section>

        {/* Form - Instagram-style */}
        <Form {...form}>
          <form className="px-4 space-y-6">
            <FormField
              control={form.control}
              name="displayName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="mb-1 block text-base font-normal text-white">Name</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Name" 
                      {...field} 
                      className="border-zinc-800 bg-zinc-900 px-3 py-2 text-white placeholder:text-zinc-500 focus-visible:ring-[#1d9bf0]"
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
                  <FormLabel className="mb-1 block text-base font-normal text-white">Username</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="Username" 
                      {...field}
                      className="border-zinc-800 bg-zinc-900 px-3 py-2 lowercase text-white placeholder:text-zinc-500 focus-visible:ring-[#1d9bf0]"
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
                  <FormLabel className="mb-1 block text-base font-normal text-white">Bio</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Bio" 
                      className="min-h-[100px] resize-none border-zinc-800 bg-zinc-900 px-3 py-2 text-white placeholder:text-zinc-500 focus-visible:ring-[#1d9bf0]"
                      {...field} 
                      maxLength={150}
                    />
                  </FormControl>
                  <div className="text-right text-xs text-zinc-500">
                    {field.value?.length || 0}/150
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <section aria-labelledby="profile-links-heading" className="space-y-3 pb-8">
              <div className="flex items-center justify-between">
                <div>
                  <h2 id="profile-links-heading" className="text-base font-normal text-white">Links</h2>
                  <p className="mt-1 text-xs text-zinc-500">Add up to five public destinations.</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={profileLinks.length >= 5}
                  onClick={() => setProfileLinks((links) => [...links, { label: "", url: "https://" }])}
                  className="text-[#1d9bf0] hover:bg-zinc-900 hover:text-[#1d9bf0]"
                >
                  <Plus className="mr-1 h-4 w-4" /> Add link
                </Button>
              </div>
              {profileLinks.length === 0 && (
                <button
                  type="button"
                  onClick={() => setProfileLinks([{ label: "", url: "https://" }])}
                  className="flex w-full items-center rounded-xl border border-dashed border-zinc-800 px-4 py-4 text-left text-sm text-zinc-400 hover:border-zinc-600 hover:text-white"
                >
                  <Link2 className="mr-3 h-5 w-5" /> Add your website, storefront, or social profile
                </button>
              )}
              {profileLinks.map((link, index) => (
                <div key={index} className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                  <div className="flex gap-2">
                    <Input
                      aria-label={`Link ${index + 1} label`}
                      value={link.label}
                      maxLength={40}
                      placeholder="Label"
                      onChange={(event) => setProfileLinks((links) => links.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))}
                      className="border-zinc-800 bg-zinc-900 text-white"
                    />
                    <Button type="button" variant="ghost" size="icon" aria-label={`Remove link ${index + 1}`} onClick={() => setProfileLinks((links) => links.filter((_, itemIndex) => itemIndex !== index))} className="shrink-0 text-zinc-400 hover:bg-zinc-900 hover:text-red-300">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <Input
                    aria-label={`Link ${index + 1} URL`}
                    type="url"
                    value={link.url}
                    maxLength={2000}
                    placeholder="https://example.com"
                    onChange={(event) => setProfileLinks((links) => links.map((item, itemIndex) => itemIndex === index ? { ...item, url: event.target.value } : item))}
                    className="mt-2 border-zinc-800 bg-zinc-900 text-white"
                  />
                </div>
              ))}
              {!linksValid && profileLinks.length > 0 && <p role="alert" className="text-xs text-red-300">Every link needs a label and a complete http or https URL.</p>}
            </section>
          </form>
        </Form>
      </div>
    </div>
  );
}
