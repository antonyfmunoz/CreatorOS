import { createContext, ReactNode, useContext, useEffect } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { User as SelectUser } from "@shared/schema";
import { getQueryFn, apiRequest, queryClient } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import { useAppStore } from "@/lib/stores";

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

type AuthContextType = {
  user: SelectUser | null;
  isLoading: boolean;
  error: Error | null;
  isSignedIn: boolean;
  updateProfileMutation: UseMutationResult<SelectUser, Error, UpdateProfileData>;
  uploadProfileImageMutation: UseMutationResult<{ user: SelectUser; imageUrl: string }, Error, UploadProfileImageData>;
};

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const { isSignedIn, isLoaded } = useClerkAuth();

  const {
    data: user,
    error,
    isLoading: isUserLoading,
  } = useQuery<SelectUser | null, Error>({
    queryKey: ["/api/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    enabled: isLoaded && !!isSignedIn,
  });

  // Bridge the Clerk-backed DB user into the global app store so components and
  // stores that read `useAppStore.currentUser` (feed, messaging, profile, etc.)
  // see the real numeric user. Clears on sign-out.
  const setCurrentUser = useAppStore((s) => s.setCurrentUser);
  useEffect(() => {
    setCurrentUser((user ?? null) as any);
  }, [user, setCurrentUser]);

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
      const formData = new FormData();
      formData.append("image", imageFile);

      const res = await fetch(`/api/users/${id}/profile-image`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to upload image");
      }

      return await res.json();
    },
    onSuccess: (data) => {
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

  const isLoading = !isLoaded || (!!isSignedIn && isUserLoading);

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        error,
        isSignedIn: !!isSignedIn,
        updateProfileMutation,
        uploadProfileImageMutation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Local-only identity bridge used by `npm run dev:demo`. It exercises the same
 * API and ownership paths as production without embedding test credentials in
 * the client or requiring a Clerk session.
 */
export function DemoAuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const setCurrentUser = useAppStore((s) => s.setCurrentUser);
  const {
    data: user,
    error,
    isLoading,
  } = useQuery<SelectUser | null, Error>({
    queryKey: ["/api/user"],
    queryFn: getQueryFn({ on401: "throw" }),
  });

  useEffect(() => {
    setCurrentUser((user ?? null) as any);
  }, [user, setCurrentUser]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: UpdateProfileData) => {
      const { id, ...updateData } = data;
      const res = await apiRequest("PATCH", `/api/users/${id}`, updateData);
      return await res.json();
    },
    onSuccess: (updatedUser: SelectUser) => {
      queryClient.setQueryData(["/api/user"], updatedUser);
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Profile updated", description: "Your profile has been successfully updated." });
    },
  });

  const uploadProfileImageMutation = useMutation({
    mutationFn: async (data: UploadProfileImageData) => {
      const formData = new FormData();
      formData.append("image", data.imageFile);
      const res = await fetch(`/api/users/${data.id}/profile-image`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to upload image");
      }
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/user"], data.user);
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({ title: "Profile image updated", description: "Your profile image has been successfully updated." });
    },
  });

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        error: error ?? null,
        isSignedIn: true,
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
