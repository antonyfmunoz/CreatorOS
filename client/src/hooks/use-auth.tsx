import { createContext, ReactNode, useContext } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { insertUserSchema, User as SelectUser, InsertUser } from "@shared/schema";
import { getQueryFn, apiRequest, queryClient } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type AuthContextType = {
  user: SelectUser | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: UseMutationResult<SelectUser, Error, LoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
  registerMutation: UseMutationResult<SelectUser, Error, InsertUser>;
  updateProfileMutation: UseMutationResult<SelectUser, Error, UpdateProfileData>;
  uploadProfileImageMutation: UseMutationResult<{ user: SelectUser, imageUrl: string }, Error, UploadProfileImageData>;
};

type LoginData = Pick<InsertUser, "username" | "password">;

type UpdateProfileData = {
  id: number;
  username?: string;
  displayName?: string;
  bio?: string | null;
  profileImageUrl?: string | null;
};

type UploadProfileImageData = {
  id: number;
  imageFile: File;
};

export const AuthContext = createContext<AuthContextType | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const {
    data: user,
    error,
    isLoading,
  } = useQuery<SelectUser | null, Error>({
    queryKey: ["/api/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      try {
        const res = await apiRequest("POST", "/api/login", credentials);
        return await res.json();
      } catch (error) {
        // Extract the actual error message from the error
        const errorMessage = error instanceof Error 
          ? error.message.includes(':') 
            ? error.message.split(':')[1].trim() 
            : error.message
          : 'Unknown error';
        throw new Error(errorMessage);
      }
    },
    onSuccess: (user: SelectUser) => {
      queryClient.setQueryData(["/api/user"], user);
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (credentials: InsertUser) => {
      try {
        const res = await apiRequest("POST", "/api/register", credentials);
        return await res.json();
      } catch (error) {
        // Extract the actual error message from the error
        const errorMessage = error instanceof Error 
          ? error.message.includes(':') 
            ? error.message.split(':')[1].trim() 
            : error.message
          : 'Unknown error';
        throw new Error(errorMessage);
      }
    },
    onSuccess: (user: SelectUser) => {
      queryClient.setQueryData(["/api/user"], user);
    },
    onError: (error: Error) => {
      toast({
        title: "Registration failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/logout");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/user"], null);
    },
    onError: (error: Error) => {
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: UpdateProfileData) => {
      const { id, ...updateData } = data;
      const res = await apiRequest("PATCH", `/api/users/${id}`, updateData);
      return await res.json();
    },
    onSuccess: (updatedUser: SelectUser) => {
      queryClient.setQueryData(["/api/user"], updatedUser);
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Profile updated",
        description: "Your profile has been successfully updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const uploadProfileImageMutation = useMutation({
    mutationFn: async (data: UploadProfileImageData) => {
      const { id, imageFile } = data;
      
      // Create form data for the file upload
      const formData = new FormData();
      formData.append('image', imageFile);
      
      // Use fetch directly as the apiRequest helper doesn't support FormData
      const res = await fetch(`/api/users/${id}/profile-image`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to upload image");
      }
      
      return await res.json();
    },
    onSuccess: (data) => {
      // Update user in cache with the image URL that came back
      queryClient.setQueryData(["/api/user"], data.user);
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Profile image updated",
        description: "Your profile image has been successfully updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Image upload failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        error,
        loginMutation,
        logoutMutation,
        registerMutation,
        updateProfileMutation,
        uploadProfileImageMutation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}