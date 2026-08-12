import { useState, useEffect, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { 
  Heart, MessageSquare, Share2, Repeat2, BarChart3, MoreHorizontal, Check, Copy, Send, Search,
  User as UserIcon, Users, X, Pencil, Trash, Bookmark, Edit, Save, Play, Pause, Volume2, VolumeX, Maximize2, PictureInPicture2, Flag
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Post as ImportedPostType, Conversation } from '@/types';

// Extend the PostType to include taggedUsers
interface PostType extends ImportedPostType {
  taggedUsers?: TaggedUser[];
  repostOfId?: number | null;
}

// Define a local User interface to avoid dependency issues
interface User {
  id: number;
  username: string;
  displayName: string;
  profileImageUrl?: string;
  bio?: string;
  role: string;
  xpPoints: number;
  level: number;
  createdAt: string;
}

// Define a local TaggedUser interface
interface TaggedUser {
  id: number;
  username: string;
  displayName: string;
  profileImageUrl?: string;
  positionX: number;
  positionY: number;
}
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import CommentSection from './CommentSection';
import { useMessaging } from '@/lib/stores';
import { useAuth } from '@/hooks/use-auth';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { useLocation } from 'wouter';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose
} from "@/components/ui/dialog";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface PostProps {
  post: PostType;
  surface?: 'light' | 'dark';
  onDeleted?: () => void;
}

type PostPoll = {
  id: number;
  question: string;
  totalVotes: number;
  viewerOptionId: number | null;
  options: Array<{ id: number; body: string; position: number; votes: number }>;
};

const Post = ({ post, surface = 'light', onDeleted }: PostProps) => {
  const isDark = surface === 'dark';
  const [showComments, setShowComments] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [selectedTab, setSelectedTab] = useState('message'); // Default to message tab
  const [groupConversations, setGroupConversations] = useState<Conversation[]>([]);
  const [filteredGroupConversations, setFilteredGroupConversations] = useState<Conversation[]>([]);
  const [groupSearchQuery, setGroupSearchQuery] = useState('');
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [createGroupDialogOpen, setCreateGroupDialogOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<User[]>([]);
  
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [showTags, setShowTags] = useState(false);
  const [mediaViewerOpen, setMediaViewerOpen] = useState(false);
  const [isMediaPlaying, setIsMediaPlaying] = useState(false);
  const [isMediaMuted, setIsMediaMuted] = useState(true);
  const mediaViewerRef = useRef<HTMLVideoElement>(null);
  
  const mediaUrl = post.videoUrl || post.imageUrl;
  const isVideoPost = Boolean(post.videoUrl) || post.mediaType === 'video';
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { createConversation, sendMessage } = useMessaging();
  const [, setLocation] = useLocation();
  const isOwnRepost = Boolean(user && post.userId === user.id && post.repostOfId);
  const { data: persistedSavedPosts = [] } = useQuery<ImportedPostType[]>({
    queryKey: [`/api/users/${user?.id}/saved-posts`],
    enabled: !!user,
    queryFn: async () => {
      const response = await fetch(`/api/users/${user!.id}/saved-posts`);
      if (!response.ok) throw new Error('Failed to fetch saved posts');
      return response.json();
    },
  });
  const { data: persistedLikedPosts = [] } = useQuery<ImportedPostType[]>({
    queryKey: [`/api/users/${user?.id}/liked-posts`],
    enabled: !!user,
    queryFn: async () => {
      const response = await fetch(`/api/users/${user!.id}/liked-posts`);
      if (!response.ok) throw new Error('Failed to fetch liked posts');
      return response.json();
    },
  });
  const { data: myPosts = [] } = useQuery<ImportedPostType[]>({
    queryKey: ['/api/users', user?.id, 'posts'],
    enabled: !!user,
    queryFn: async () => {
      const response = await fetch(`/api/users/${user!.id}/posts`);
      if (!response.ok) throw new Error('Failed to fetch your posts');
      return response.json();
    },
  });
  const isSaved = persistedSavedPosts.some((savedPost) => savedPost.id === post.id);
  const isLiked = persistedLikedPosts.some((likedPost) => likedPost.id === post.id);
  const repostContent = `Reposted @${post.user.username}: ${post.content}`;
  const isReposted = myPosts.some((candidate) => candidate.repostOfId === post.id);
  const { data: postPoll = null } = useQuery<PostPoll | null>({
    queryKey: ['/api/posts', post.id, 'poll'],
    enabled: !!user,
    queryFn: async () => {
      const response = await fetch(`/api/posts/${post.id}/poll`);
      if (!response.ok) throw new Error('Failed to load poll');
      return response.json();
    },
  });
  const mentionedUsernames = Array.from(
    new Set((post.content.match(/@[A-Za-z0-9_]+/g) ?? []).map((mention) => mention.slice(1).toLowerCase())),
  ).slice(0, 10);

  useEffect(() => {
    if (!user || post.userId === user.id) return;
    void apiRequest('POST', `/api/posts/${post.id}/view`).catch(() => undefined);
  }, [post.id, post.userId, user]);

  // Resolve only the accounts explicitly mentioned in this post. This keeps
  // profile links functional without downloading the entire user directory.
  const { data: mentionedUsers = [] } = useQuery<User[]>({
    queryKey: ['/api/posts', post.id, 'mentioned-users', mentionedUsernames],
    enabled: mentionedUsernames.length > 0,
    queryFn: async () => {
      const resultSets = await Promise.all(mentionedUsernames.map(async (username) => {
        const res = await fetch(`/api/users?search=${encodeURIComponent(username)}`);
        if (!res.ok) return [] as User[];
        return res.json() as Promise<User[]>;
      }));
      const uniqueUsers = new Map<number, User>();
      for (const candidate of resultSets.flat()) {
        if (mentionedUsernames.includes(candidate.username.toLowerCase())) uniqueUsers.set(candidate.id, candidate);
      }
      return Array.from(uniqueUsers.values());
    },
  });
  
  // Fetch the comments for this post - always fetch to get accurate count
  const { data: comments = [] } = useQuery({
    queryKey: ['/api/posts', post.id, 'comments'],
    queryFn: async () => {
      const res = await fetch(`/api/posts/${post.id}/comments`);
      if (!res.ok) throw new Error('Failed to fetch comments');
      return res.json();
    }
  });
  
  // Fetch the total comment count (including all replies)
  const { data: commentCountData } = useQuery({
    queryKey: ['/api/posts', post.id, 'comment-count'],
    queryFn: async () => {
      const res = await fetch(`/api/posts/${post.id}/comment-count`);
      if (!res.ok) throw new Error('Failed to fetch comment count');
      return res.json();
    }
  });
  
  // Fetch the tagged users for this post
  const { data: taggedUsers = [] } = useQuery<TaggedUser[]>({
    queryKey: ['/api/posts', post.id, 'tagged-users'],
    queryFn: async () => {
      const res = await fetch(`/api/posts/${post.id}/tagged-users`);
      if (!res.ok) throw new Error('Failed to fetch tagged users');
      return res.json();
    },
    // Run this query when post has image and when we're showing tags or the post already has tags
    enabled: !!post.imageUrl && ((post.taggedUsers?.length ?? 0) > 0 || showTags)
  });
  
  // Use the total comment count from the database for the UI
  // This includes both top-level comments and all replies
  const totalCommentCount = commentCountData?.count || 0;

  const likePostMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/posts/${post.id}/like`, null);
      return res.json();
    },
    onSuccess: (updatedPost) => {
      queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
      
      queryClient.invalidateQueries({ queryKey: [`/api/users/${user?.id}/liked-posts`] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to like the post. Please try again.",
        variant: "destructive",
      });
    }
  });

  const unlikePostMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/posts/${post.id}/unlike`, null);
      return res.json();
    },
    onSuccess: (updatedPost) => {
      queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
      
      queryClient.invalidateQueries({ queryKey: [`/api/users/${user?.id}/liked-posts`] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to unlike the post. Please try again.",
        variant: "destructive",
      });
    }
  });

  const handleLikeToggle = () => {
    if (isLiked) {
      unlikePostMutation.mutate();
    } else {
      likePostMutation.mutate();
    }
  };

  const toggleComments = () => {
    setShowComments(!showComments);
  };

  const handleShare = () => {
    setShareDialogOpen(true);
    
    // Fetch user's group conversations when the share dialog opens
    if (user && user.id) {
      fetchGroupConversations();
    }
  };
  
  // Fetch the user's group chat conversations
  const fetchGroupConversations = async () => {
    if (!user) return;
    
    setIsLoadingGroups(true);
    
    try {
      const response = await fetch(`/api/users/${user.id}/conversations`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch user conversations');
      }
      
      const allConversations = await response.json();
      
      // Filter to only include group conversations
      const groups = allConversations.filter((conversation: Conversation) => 
        conversation.isGroup === true
      );
      
      setGroupConversations(groups);
      setFilteredGroupConversations(groups); // Initialize filtered list with all groups
    } catch (error) {
      console.error('Error fetching group conversations:', error);
      toast({
        title: "Error",
        description: "Failed to load your group chats. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingGroups(false);
    }
  };
  
  // Handle group search
  const handleGroupSearch = (query: string) => {
    setGroupSearchQuery(query);
    
    if (!query.trim()) {
      // If query is empty, show all group conversations
      setFilteredGroupConversations(groupConversations);
      return;
    }
    
    // Filter group conversations by name
    const filtered = groupConversations.filter(conversation => {
      const name = conversation.name || 'Group Chat';
      return name.toLowerCase().includes(query.toLowerCase());
    });
    
    setFilteredGroupConversations(filtered);
  };
  
  // Update filtered groups when groupConversations changes
  useEffect(() => {
    setFilteredGroupConversations(groupConversations);
  }, [groupConversations]);
  
  // Share post to a group conversation
  const shareWithGroup = async (conversation: Conversation) => {
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to share with groups.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      // Create a rich post share message with card-like format
      const postLink = `${window.location.origin}/post/${post.id}`;
      // JSON structure containing post details for the frontend to render as a card
      const postPreview = {
        type: 'post_share',
        postId: post.id,
        content: post.content.substring(0, 60) + (post.content.length > 60 ? '...' : ''),
        imageUrl: post.imageUrl || null,
        authorName: post.user.displayName,
        authorImage: post.user.profileImageUrl,
        likes: post.likes,
        comments: totalCommentCount,
        link: postLink
      };
      
      // Stringify the JSON to send as message content
      // The message component will parse this and render it as a card
      const messageContent = JSON.stringify(postPreview);
      
      // Send message to the group
      await sendMessage(conversation.id, user.id, messageContent);
      
      // Show success toast notification
      toast({
        title: "Post Shared",
        description: `Post successfully shared with ${conversation.name || 'the group'}.`,
      });
      
      // Close dialog and clear all search states
      setShareDialogOpen(false);
      setSearchQuery('');
      setSearchResults([]);
      setGroupSearchQuery('');
      setFilteredGroupConversations(groupConversations);
    } catch (error) {
      console.error('Error sharing post to group:', error);
      toast({
        title: "Error",
        description: "Failed to share post with the group. Please try again.",
        variant: "destructive",
      });
    }
  };
  
  const copyPostLink = async () => {
    // Create a shareable link for the post
    const postLink = `${window.location.origin}/post/${post.id}`;
    try {
      await navigator.clipboard.writeText(postLink);
      setCopied(true);
      
      // Show success toast notification
      toast({
        title: "Link Copied",
        description: "Post link copied to clipboard.",
      });
      
      // Reset the copied state after 2 seconds
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: "Post link",
        description: postLink,
      });
    }
  };
  
  // Search for users to share with
  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    
    try {
      const response = await fetch(`/api/users?search=${encodeURIComponent(query)}`);
      
      if (!response.ok) {
        throw new Error('Failed to search users');
      }
      
      const users = await response.json();
      
      // Filter out the current user if present
      setSearchResults(users.filter((u: User) => u.id !== user?.id));
    } catch (error) {
      console.error('Error searching users:', error);
      toast({
        title: "Error",
        description: "Failed to search for users. Please try again.",
        variant: "destructive",
      });
    }
  };
  
  // Share a post with another user via direct message
  const shareWithUser = async (targetUser: User) => {
    if (!user) {
      toast({
        title: "Error",
        description: "You must be logged in to share with others.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      console.log('Attempting to share post with users:', user.id, targetUser.id);
      
      // Create or get existing conversation with user
      // The server will check if a conversation already exists and return it
      // The client store will also check for existing conversations
      const conversationId = await createConversation([user.id, targetUser.id]);
      
      console.log('Got conversation ID:', conversationId);
      
      // Create a rich post share message with card-like format
      const postLink = `${window.location.origin}/post/${post.id}`;
      // JSON structure containing post details for the frontend to render as a card
      const postPreview = {
        type: 'post_share',
        postId: post.id,
        content: post.content.substring(0, 60) + (post.content.length > 60 ? '...' : ''),
        imageUrl: post.imageUrl || null,
        authorName: post.user.displayName,
        authorImage: post.user.profileImageUrl,
        likes: post.likes,
        comments: totalCommentCount,
        link: postLink
      };
      
      // Stringify the JSON to send as message content
      // The message component will parse this and render it as a card
      const messageContent = JSON.stringify(postPreview);
      
      // Send message
      await sendMessage(conversationId, user.id, messageContent);
      
      // Show success toast notification
      toast({
        title: "Post Shared",
        description: `Post successfully shared with ${targetUser.displayName}.`,
      });
      
      // Close dialog and clear all search states
      setShareDialogOpen(false);
      setSearchQuery('');
      setSearchResults([]);
      setGroupSearchQuery('');
      setFilteredGroupConversations(groupConversations);
      
    } catch (error) {
      console.error('Error sharing post:', error);
      toast({
        title: "Error",
        description: "Failed to share post. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Update post mutation
  const updatePostMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('PATCH', `/api/posts/${post.id}`, { content: editContent });
      return res.json();
    },
    onSuccess: (updatedPost) => {
      queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
      
      // Exit editing mode and show success toast
      setIsEditing(false);
      toast({
        title: "Post Updated",
        description: "Your post has been updated successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update the post. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Delete post mutation - only for the API call
  const deletePostMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('DELETE', `/api/posts/${post.id}`, null);
    },
    onSuccess: () => {
      // Invalidate the stories query when a post is deleted
      // This ensures that the stories bar and stories display are refreshed
      queryClient.invalidateQueries({ queryKey: ['/api/stories'] });
      
      // Show success toast
      toast({
        title: "Success",
        description: "Post deleted successfully.",
      });
      onDeleted?.();
    },
    onError: () => {
      // Only show toast for errors
      toast({
        title: "Error",
        description: "Failed to delete the post. Please try again.",
        variant: "destructive",
      });
      
      // Restore the post in the cache if deletion fails
      queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
    }
  });

  // Save post mutation
  const savePostMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('User not authenticated');
      // We don't need to send userId in the body as the server extracts it from the session
      await apiRequest('POST', `/api/posts/${post.id}/save`, {});
    },
    onSuccess: () => {
      // Update the global cache to reflect that this post is saved
      queryClient.invalidateQueries({queryKey: [`/api/users/${user?.id}/saved-posts`]});
      
      toast({
        title: "Post Saved",
        description: "This post has been added to your saved items.",
      });
    },
    onError: (error) => {
      console.error('Error saving post:', error);
      toast({
        title: "Error",
        description: "Failed to save the post. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Unsave post mutation
  const unsavePostMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('User not authenticated');
      // We don't need to send userId in the body as the server extracts it from the session
      await apiRequest('POST', `/api/posts/${post.id}/unsave`, {});
    },
    onSuccess: () => {
      // Update the global cache to reflect that this post is unsaved
      queryClient.invalidateQueries({queryKey: [`/api/users/${user?.id}/saved-posts`]});
      
      toast({
        title: "Post Unsaved",
        description: "This post has been removed from your saved items.",
      });
    },
    onError: (error) => {
      console.error('Error unsaving post:', error);
      toast({
        title: "Error",
        description: "Failed to unsave the post. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Handle edit post
  const handleEditPost = () => {
    setIsEditing(true);
  };

  // Handle save post changes
  const handleSavePostChanges = () => {
    if (editContent.trim().length === 0) {
      toast({
        title: "Error",
        description: "Post content cannot be empty.",
        variant: "destructive",
      });
      return;
    }
    updatePostMutation.mutate();
  };

  // Handle cancel edit
  const handleCancelEdit = () => {
    setEditContent(post.content);
    setIsEditing(false);
  };

  const handleDeletePost = () => {
    setIsDeleteConfirmOpen(true);
  };

  // A repost is a real new feed item from the active creator, rather than a
  // decorative counter. It keeps the MVP's repost control useful without
  // pretending we have a separate federation layer yet.
  const repostMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('You must be signed in to repost');
      const res = await apiRequest('POST', '/api/posts', {
        content: repostContent,
        imageUrl: post.imageUrl ?? null,
        mediaType: post.imageUrl ? 'photo' : 'text',
        repostOfId: post.id,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/users', user?.id, 'posts'] });
      toast({ title: 'Reposted', description: 'The post is now on your feed.' });
    },
    onError: () => {
      toast({ title: 'Could not repost', description: 'Please try again.', variant: 'destructive' });
    },
  });

  const votePostPollMutation = useMutation({
    mutationFn: async (optionId: number) => (await apiRequest('POST', `/api/posts/${post.id}/poll/vote`, { optionId })).json() as Promise<PostPoll>,
    onSuccess: (poll) => queryClient.setQueryData(['/api/posts', post.id, 'poll'], poll),
    onError: () => toast({ title: 'Vote not saved', description: 'Please try again.', variant: 'destructive' }),
  });

  const reportPostMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("User not authenticated");
      await apiRequest("POST", `/api/posts/${post.id}/report`, { reason: "safety_concern" });
    },
    onSuccess: () => toast({ title: "Report received", description: "Thanks. Our moderation team can now review this post." }),
    onError: () => toast({ title: "Could not submit report", description: "Please try again.", variant: "destructive" }),
  });

  const handleRepost = () => {
    if (!isReposted && !isOwnRepost) repostMutation.mutate();
  };

  const renderPostContent = () => post.content.split(/(@[A-Za-z0-9_]+)/g).map((part, index) => {
    if (!part.startsWith('@')) return part;

    const username = part.slice(1);
    const mentionedUser = mentionedUsers.find((candidate) => candidate.username.toLowerCase() === username.toLowerCase());
    if (!mentionedUser) {
      return <span key={`${part}-${index}`} className="font-medium text-[#1d9bf0]">{part}</span>;
    }

    return (
      <button
        key={`${part}-${index}`}
        type="button"
        className="font-medium text-[#1d9bf0] hover:underline"
        aria-label={`Open @${mentionedUser.username}'s profile`}
        onClick={() => setLocation(`/profile/${mentionedUser.id}`)}
      >
        {part}
      </button>
    );
  });

  const confirmDeletePost = () => {
    setIsDeleteConfirmOpen(false);
    const postElement = document.getElementById(`post-${post.id}`);
    if (postElement) {
      postElement.style.display = 'none';
    }

    queryClient.setQueryData(['/api/posts'], (oldData: PostType[] | undefined) => {
      if (!oldData) return oldData;
      return oldData.filter(p => p.id !== post.id);
    });

    deletePostMutation.mutate();
  };

  // Handle save/unsave post toggle
  const handleSaveToggle = () => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "You must be logged in to save posts.",
        variant: "destructive",
      });
      return;
    }
    
    if (isSaved) {
      unsavePostMutation.mutate();
    } else {
      savePostMutation.mutate();
    }
  };

  const formattedDate = formatDistanceToNow(new Date(post.createdAt), { addSuffix: true });
  const isPending = likePostMutation.isPending || unlikePostMutation.isPending || repostMutation.isPending ||
                   updatePostMutation.isPending || deletePostMutation.isPending || 
                   savePostMutation.isPending || unsavePostMutation.isPending;

  return (
    <Card id={`post-${post.id}`} className={`mb-0 overflow-hidden rounded-none border-x-0 border-t-0 shadow-none ${isDark ? 'border-zinc-800 bg-black text-white' : 'border-zinc-100 bg-white text-black'}`}>
      <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this post?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeletePost}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete post
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <CardContent className="p-4">
        <div className="flex items-center mb-3">
          <Avatar 
            className="w-10 h-10 mr-3 cursor-pointer hover:ring-2 hover:ring-primary transition-all"
            onClick={() => setLocation(`/profile/${post.user.id}`)}
          >
            <AvatarImage src={post.user.profileImageUrl || undefined} alt={post.user.displayName} />
            <AvatarFallback>{post.user.displayName.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p 
              className={`cursor-pointer font-semibold hover:text-primary hover:underline ${isDark ? 'text-white' : 'text-black'}`}
              onClick={() => setLocation(`/profile/${post.user.id}`)}
            >
              {post.user.displayName}
            </p>
            <p className="truncate text-xs text-zinc-500">@{post.user.username} · {formattedDate}</p>
            {post.location && <p className="mt-0.5 truncate text-xs text-zinc-400">{post.location}</p>}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="ml-auto" aria-label="Post options">
                <MoreHorizontal className="h-5 w-5 text-gray-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {user && user.id === post.userId ? (
                // Post owner menu options
                <>
                  <DropdownMenuItem className="cursor-pointer" onClick={handleEditPost}>
                    <Edit className="mr-2 h-4 w-4" />
                    <span>Edit Post</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    className="cursor-pointer text-destructive" 
                    onClick={handleDeletePost}
                    disabled={deletePostMutation.isPending}
                  >
                    <Trash className="mr-2 h-4 w-4" />
                    <span>Delete Post</span>
                  </DropdownMenuItem>
                </>
              ) : (
                // Viewer menu options
                <>
                  <DropdownMenuItem 
                    className="cursor-pointer" 
                    onClick={handleSaveToggle}
                    disabled={savePostMutation.isPending || unsavePostMutation.isPending}
                  >
                    {isSaved ? (
                      <>
                        <Bookmark className="mr-2 h-4 w-4 fill-primary text-primary" />
                        <span>Unsave Post</span>
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        <span>Save Post</span>
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="cursor-pointer text-destructive" disabled={reportPostMutation.isPending} onClick={() => reportPostMutation.mutate()}>
                    <Flag className="mr-2 h-4 w-4" />
                    <span>{reportPostMutation.isPending ? "Sending report…" : "Report post"}</span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        
        {isEditing ? (
          <div className="mb-4">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="mb-3 min-h-[100px]"
              placeholder="Edit your post content..."
            />
            <div className="flex justify-end gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleCancelEdit}
              >
                Cancel
              </Button>
              <Button 
                variant="default" 
                size="sm" 
                onClick={handleSavePostChanges}
                disabled={updatePostMutation.isPending}
              >
                {updatePostMutation.isPending ? (
                  <>
                    <span className="animate-spin mr-2">○</span>
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </div>
          </div>
        ) : (
          <p className={`mb-4 text-[15px] leading-6 ${isDark ? 'text-white' : 'text-black'}`}>{renderPostContent()}</p>
        )}

        {postPoll && <section className="mb-4 rounded-xl border border-zinc-800 bg-zinc-950 p-3" aria-label={`Poll: ${postPoll.question}`}><h3 className="text-sm font-bold text-white">{postPoll.question}</h3><div className="mt-3 space-y-2">{postPoll.options.map((option) => { const percentage = postPoll.totalVotes ? Math.round((option.votes / postPoll.totalVotes) * 100) : 0; const selected = postPoll.viewerOptionId === option.id; return <button key={option.id} type="button" aria-pressed={selected} disabled={votePostPollMutation.isPending} onClick={() => votePostPollMutation.mutate(option.id)} className={`relative flex w-full overflow-hidden rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${selected ? 'border-[#1d9bf0] text-white' : 'border-zinc-700 text-zinc-200 hover:border-zinc-500'}`}><span className="absolute inset-y-0 left-0 bg-[#1d9bf0]/15" style={{ width: `${percentage}%` }} /><span className="relative z-10 flex-1 font-medium">{option.body}</span><span className="relative z-10 ml-3 text-xs text-zinc-400">{percentage}%</span></button>; })}</div><p className="mt-3 text-xs text-zinc-500">{postPoll.totalVotes.toLocaleString()} vote{postPoll.totalVotes === 1 ? '' : 's'} · Select an option to vote or change your vote</p></section>}
        
        {mediaUrl && (
          <div className="relative mb-4">
            {isVideoPost ? (
              <button type="button" className="group relative block w-full overflow-hidden rounded-xl bg-black text-left" onClick={() => setMediaViewerOpen(true)} aria-label="Open video">
                <video src={mediaUrl} muted playsInline preload="metadata" className="aspect-square w-full object-cover" />
                <span className="absolute inset-0 grid place-items-center bg-black/20 transition-colors group-hover:bg-black/35"><span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-black"><Play className="ml-0.5 h-5 w-5 fill-current" /></span></span>
              </button>
            ) : (
              <button type="button" className="block w-full" onClick={() => setMediaViewerOpen(true)} aria-label="Open image">
                <img
                  src={mediaUrl}
                  alt="Post content"
                  loading="lazy"
                  decoding="async"
                  className={`aspect-square w-full rounded-xl object-cover ${post.taggedUsers && post.taggedUsers.length > 0 ? 'hover:opacity-95' : ''}`}
                />
              </button>
            )}
            
            {/* Tagged users overlay - only show username fab when clicked */}
            {showTags && taggedUsers.length > 0 && (
              <div 
                className="absolute inset-0 z-10"
                onClick={() => setShowTags(false)}
              >
                {taggedUsers.map((taggedUser: TaggedUser, index: number) => (
                  <div 
                    key={index}
                    className="absolute"
                    style={{
                      left: `${taggedUser.positionX * 100}%`,
                      top: `${taggedUser.positionY * 100}%`,
                    }}
                  >
                    <div 
                      className="bg-primary text-white rounded-full py-1 px-3 flex items-center text-xs transform -translate-x-1/2 -translate-y-1/2 shadow-lg cursor-pointer hover:bg-primary-dark"
                      onClick={(e) => {
                        e.stopPropagation(); // Prevent toggling tags
                        setLocation(`/profile/${taggedUser.id}`);
                      }}
                    >
                      <span className="font-medium">@{taggedUser.username}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {/* Tag indicator button and tooltip */}
            {taggedUsers.length > 0 && !showTags && (
              <div className="absolute bottom-2 left-2 flex items-center">
                <button 
                  type="button"
                  aria-label={`View ${taggedUsers.length} tagged ${taggedUsers.length === 1 ? 'person' : 'people'}`}
                  className="bg-primary text-white rounded-full p-2 shadow-md animate-pulse"
                  onClick={() => setShowTags(true)}
                >
                  <UserIcon className="h-5 w-5" />
                </button>
                <div className="ml-2 text-xs bg-black bg-opacity-75 text-white py-1 px-2 rounded">
                  Tap to view {taggedUsers.length} tagged {taggedUsers.length === 1 ? 'person' : 'people'}
                </div>
              </div>
            )}
          </div>
        )}

        <Dialog open={mediaViewerOpen} onOpenChange={setMediaViewerOpen}>
          <DialogContent className="h-dvh max-w-none overflow-hidden border-0 bg-black p-0 text-white sm:rounded-none">
            <DialogTitle className="sr-only">{isVideoPost ? 'Video post' : 'Image post'} by {post.user.displayName}</DialogTitle>
            <button type="button" onClick={() => setMediaViewerOpen(false)} className="absolute right-4 top-4 z-30 rounded-full bg-black/45 p-2 text-white transition-colors hover:bg-black/70" aria-label="Close media viewer"><X className="h-6 w-6" /></button>
            <button type="button" className="absolute left-4 top-4 z-30 rounded-full bg-black/45 p-2 text-white transition-colors hover:bg-black/70" aria-label="More media options"><MoreHorizontal className="h-6 w-6" /></button>
            <div className="relative flex h-full items-center justify-center bg-black">
              {isVideoPost ? (
                <video ref={mediaViewerRef} src={mediaUrl} playsInline muted={isMediaMuted} onPlay={() => setIsMediaPlaying(true)} onPause={() => setIsMediaPlaying(false)} className="h-full w-full object-contain" />
              ) : (
                <img src={mediaUrl} alt={`Post by ${post.user.displayName}`} className="h-full w-full object-contain" />
              )}
              {isVideoPost && !isMediaPlaying && <button type="button" onClick={() => void mediaViewerRef.current?.play()} className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-black" aria-label="Play video"><Play className="ml-1 h-7 w-7 fill-current" /></button>}
            </div>
            <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black via-black/75 to-transparent px-4 pb-5 pt-20">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => { setMediaViewerOpen(false); setLocation(`/profile/${post.user.id}`); }} className="flex min-w-0 items-center gap-2 text-left"><Avatar className="h-9 w-9 border border-white/70"><AvatarImage src={post.user.profileImageUrl || undefined} /><AvatarFallback>{post.user.displayName.charAt(0)}</AvatarFallback></Avatar><span className="min-w-0"><span className="block truncate text-sm font-bold">{post.user.displayName}</span><span className="block truncate text-xs text-zinc-300">@{post.user.username}</span></span></button>
                <button type="button" onClick={() => { setMediaViewerOpen(false); setLocation(`/profile/${post.user.id}`); }} className="ml-auto rounded-full border border-white/80 px-3 py-1.5 text-xs font-bold text-white hover:bg-white hover:text-black">View profile</button>
              </div>
              <p className="mt-3 line-clamp-3 text-sm leading-5 text-white">{post.content}</p>
              <div className="mt-4 flex items-center gap-4 text-sm text-white">
                <button type="button" onClick={handleLikeToggle} className="flex items-center gap-1.5"><Heart className={`h-5 w-5 ${isLiked ? 'fill-rose-500 text-rose-500' : ''}`} /><span>{post.likes}</span></button>
                <button type="button" onClick={() => { setMediaViewerOpen(false); toggleComments(); }} className="flex items-center gap-1.5"><MessageSquare className="h-5 w-5" /><span>{totalCommentCount}</span></button>
                <button type="button" onClick={handleRepost} disabled={isReposted || isOwnRepost} className="flex items-center gap-1.5 disabled:opacity-50"><Repeat2 className="h-5 w-5" /><span>Repost</span></button>
                <button type="button" onClick={handleShare} className="ml-auto" aria-label="Share post"><Share2 className="h-5 w-5" /></button>
              </div>
              {isVideoPost && <div className="mt-4 flex items-center justify-between border-t border-white/20 pt-3"><button type="button" onClick={() => isMediaPlaying ? mediaViewerRef.current?.pause() : void mediaViewerRef.current?.play()} className="rounded-full p-1.5 hover:bg-white/10" aria-label={isMediaPlaying ? 'Pause video' : 'Play video'}>{isMediaPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current" />}</button><button type="button" onClick={() => setIsMediaMuted((muted) => !muted)} className="rounded-full p-1.5 hover:bg-white/10" aria-label={isMediaMuted ? 'Unmute video' : 'Mute video'}>{isMediaMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}</button><span className="flex-1 text-center text-xs text-zinc-300">Video post</span><button type="button" onClick={() => void mediaViewerRef.current?.requestPictureInPicture?.()} className="rounded-full p-1.5 hover:bg-white/10" aria-label="Picture in picture"><PictureInPicture2 className="h-5 w-5" /></button><button type="button" onClick={() => void mediaViewerRef.current?.requestFullscreen?.()} className="rounded-full p-1.5 hover:bg-white/10" aria-label="Fullscreen"><Maximize2 className="h-5 w-5" /></button></div>}
            </div>
          </DialogContent>
        </Dialog>
        
        <div className="flex items-center justify-between text-zinc-500">
          <div className="flex flex-1 items-center justify-between">
            <Button 
              variant="ghost" 
              size="sm" 
              className={`flex items-center gap-1 px-2 ${isLiked ? 'bg-rose-500/10 text-rose-500 hover:bg-rose-500/15 hover:text-rose-500' : ''}`}
              onClick={handleLikeToggle}
              disabled={isPending}
              aria-label={isLiked ? "Unlike post" : "Like post"}
            >
              <Heart className={`h-5 w-5 ${isLiked ? 'fill-red-500 text-red-500' : ''}`} />
              <span>{post.likes}</span>
            </Button>
            
            <Button 
              variant="ghost" 
              size="sm" 
              className="flex items-center gap-1 px-2"
              onClick={toggleComments}
              aria-label="Show comments"
            >
              <MessageSquare className={`h-5 w-5 ${showComments ? 'text-blue-500' : ''}`} />
              <span>{totalCommentCount}</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              className={`flex items-center gap-1 px-2 ${isReposted ? 'bg-[#1d9bf0]/10 text-[#1d9bf0] hover:bg-[#1d9bf0]/15 hover:text-[#1d9bf0]' : ''}`}
              onClick={handleRepost}
              disabled={isPending || isReposted || isOwnRepost}
              aria-label={isOwnRepost ? "Your repost" : isReposted ? "Reposted" : "Repost"}
              title={isOwnRepost ? "You cannot repost your own repost" : undefined}
            >
              <Repeat2 className={`h-5 w-5 ${isReposted ? 'fill-[#1d9bf0]' : ''}`} />
            </Button>

            <Button variant="ghost" size="sm" className="flex items-center gap-1 px-2" onClick={() => setLocation(`/posts/${post.id}/analytics`)} aria-label="View post analytics"><BarChart3 className="h-5 w-5" /></Button>
          </div>
          
          <Dialog 
            open={shareDialogOpen} 
            onOpenChange={(open) => {
              setShareDialogOpen(open);
              if (!open) {
                // Reset search states when dialog is closed
                setSearchQuery('');
                setSearchResults([]);
                setGroupSearchQuery('');
                setFilteredGroupConversations(groupConversations);
              }
            }}
          >
            <Button variant="ghost" size="sm" className="ml-1 flex items-center px-2" onClick={handleShare} aria-label="Share post">
              <Share2 className="h-5 w-5" />
            </Button>
            <DialogContent className="sm:max-w-md rounded-lg">
              <DialogHeader>
                <DialogTitle>Share post</DialogTitle>
              </DialogHeader>
              
              <div className="flex justify-between items-center mt-4 mb-3">
                <div className="flex gap-2">
                  <Button
                    variant={selectedTab === 'message' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedTab('message')}
                    className="gap-1"
                  >
                    <MessageSquare className="h-4 w-4" />
                    <span>Direct</span>
                  </Button>
                  
                  <Button
                    variant={selectedTab === 'group' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedTab('group')}
                    className="gap-1"
                  >
                    <Users className="h-4 w-4" />
                    <span>Groups</span>
                  </Button>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={copyPostLink}
                    className="gap-1"
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    <span className="sr-only">Copy link</span>
                  </Button>
                </div>
              </div>
                
              {selectedTab === 'message' && (
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search users..."
                      className="pl-9"
                      value={searchQuery}
                      onChange={(e) => handleSearch(e.target.value)}
                    />
                  </div>
                  
                  <ScrollArea className="h-60">
                    {searchResults.length > 0 ? (
                      <div className="space-y-2">
                        {searchResults.map((user) => (
                          <div
                            key={user.id}
                            className="flex items-center p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
                            onClick={() => shareWithUser(user)}
                          >
                            <Avatar className="h-9 w-9 mr-2">
                              <AvatarImage src={user.profileImageUrl || undefined} alt={user.displayName} />
                              <AvatarFallback>
                                <UserIcon className="h-5 w-5" />
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{user.displayName}</p>
                              <p className="text-xs text-gray-500 truncate lowercase">{user.username}</p>
                            </div>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                              <Send className="h-4 w-4" />
                              <span className="sr-only">Send</span>
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : searchQuery ? (
                      <p className="text-center py-4 text-gray-500">
                        No users found matching "{searchQuery}"
                      </p>
                    ) : (
                      <p className="text-center py-4 text-gray-500">
                        Search for users to share this post with
                      </p>
                    )}
                  </ScrollArea>
                </div>
              )}
              
              {selectedTab === 'group' && (
                <div className="space-y-4">
                  <div className="flex gap-2 items-center">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search group chats..."
                        className="pl-9"
                        value={groupSearchQuery}
                        onChange={(e) => handleGroupSearch(e.target.value)}
                      />
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => setCreateGroupDialogOpen(true)}
                    >
                      <Users className="h-4 w-4 mr-1" />
                      <span>New</span>
                    </Button>
                  </div>
                  
                  <ScrollArea className="h-60">
                    {isLoadingGroups ? (
                      <div className="flex justify-center items-center py-6">
                        <p className="text-muted-foreground">Loading your group chats...</p>
                      </div>
                    ) : groupConversations.length > 0 ? (
                      filteredGroupConversations.length > 0 ? (
                        <div className="space-y-2">
                          {filteredGroupConversations.map((conversation) => (
                            <div
                              key={conversation.id}
                              className="flex items-center p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
                              onClick={() => shareWithGroup(conversation)}
                            >
                              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center mr-2">
                                <Users className="h-5 w-5 text-primary" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium">{conversation.name || 'Group Chat'}</p>
                                <p className="text-xs text-gray-500 truncate">
                                  {conversation.participants && 
                                    `${conversation.participants.length} members`}
                                </p>
                              </div>
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                                <Send className="h-4 w-4" />
                                <span className="sr-only">Send</span>
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-center py-4 text-gray-500">
                          No groups found matching "{groupSearchQuery}"
                        </p>
                      )
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <Users className="h-12 w-12 text-muted-foreground mb-4" />
                        <p className="font-medium mb-1">No group chats found</p>
                        <p className="text-sm text-muted-foreground max-w-xs mb-4">
                          You haven't created any group chats yet.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={() => setCreateGroupDialogOpen(true)}
                        >
                          <Users className="h-4 w-4" />
                          <span>Create a group chat</span>
                        </Button>
                      </div>
                    )}
                  </ScrollArea>
                </div>
              )}
              
              <DialogFooter className="sm:justify-start mt-4">
                <DialogClose asChild>
                  <Button type="button" variant="secondary">
                    Close
                  </Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Create Group Chat Dialog */}
        <Dialog 
          open={createGroupDialogOpen} 
          onOpenChange={(open) => {
            setCreateGroupDialogOpen(open);
            if (!open) {
              // Reset states when dialog is closed
              setNewGroupName('');
              setSelectedUsers([]);
              setUserSearchQuery('');
              setUserSearchResults([]);
            }
          }}
        >
          <DialogContent className="sm:max-w-md rounded-lg">
            <DialogHeader>
              <DialogTitle>Create group chat</DialogTitle>
            </DialogHeader>
            
            <div className="space-y-4 mt-4">
              <div>
                <label htmlFor="group-name" className="text-sm font-medium mb-1 block">
                  Group name
                </label>
                <Input
                  id="group-name"
                  placeholder="Enter group name"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                />
              </div>
              
              <div>
                <label className="text-sm font-medium mb-1 block">
                  Add members ({selectedUsers.length} selected)
                </label>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search users..."
                    className="pl-9"
                    value={userSearchQuery}
                    onChange={async (e) => {
                      const query = e.target.value;
                      setUserSearchQuery(query);
                      
                      if (!query.trim()) {
                        setUserSearchResults([]);
                        return;
                      }
                      
                      try {
                        const response = await fetch(`/api/users?search=${encodeURIComponent(query)}`);
                        
                        if (!response.ok) {
                          throw new Error('Failed to search users');
                        }
                        
                        const users = await response.json();
                        
                        // Filter out already selected users and current user
                        setUserSearchResults(users.filter((u: User) => 
                          u.id !== user?.id && !selectedUsers.some(selected => selected.id === u.id)
                        ));
                      } catch (error) {
                        console.error('Error searching users:', error);
                      }
                    }}
                  />
                </div>
                
                {/* Display search results */}
                {userSearchResults.length > 0 && (
                  <ScrollArea className="h-36 mb-2 border rounded-md">
                    <div className="p-1">
                      {userSearchResults.map((foundUser) => (
                        <div
                          key={foundUser.id}
                          className="flex items-center p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
                          onClick={() => {
                            setSelectedUsers([...selectedUsers, foundUser]);
                            setUserSearchResults(userSearchResults.filter(u => u.id !== foundUser.id));
                            setUserSearchQuery('');
                          }}
                        >
                          <Avatar className="h-8 w-8 mr-2">
                            <AvatarImage src={foundUser.profileImageUrl || undefined} alt={foundUser.displayName} />
                            <AvatarFallback>{foundUser.displayName.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{foundUser.displayName}</p>
                            <p className="text-xs text-gray-500 truncate lowercase">{foundUser.username}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
                
                {/* Display selected users */}
                {selectedUsers.length > 0 && (
                  <div className="border rounded-md p-2">
                    <ScrollArea className="max-h-24">
                      <div className="flex flex-wrap gap-2">
                        {selectedUsers.map((selectedUser) => (
                          <div 
                            key={selectedUser.id} 
                            className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-full px-2 py-1"
                          >
                            <Avatar className="h-5 w-5">
                              <AvatarImage src={selectedUser.profileImageUrl || undefined} alt={selectedUser.displayName} />
                              <AvatarFallback>{selectedUser.displayName.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <span className="text-xs">{selectedUser.displayName}</span>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="h-4 w-4 p-0 rounded-full"
                              onClick={() => setSelectedUsers(selectedUsers.filter(u => u.id !== selectedUser.id))}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </div>
            </div>
            
            <DialogFooter className="flex justify-between mt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setCreateGroupDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!newGroupName.trim() || selectedUsers.length < 1}
                onClick={async () => {
                  if (!user) return;
                  
                  try {
                    // Create a new group with the current user and selected users
                    const userIds = [user.id, ...selectedUsers.map(u => u.id)];
                    const conversationId = await createConversation(userIds, newGroupName);
                    
                    // Close the dialog
                    setCreateGroupDialogOpen(false);
                    
                    // Refresh the group conversation list
                    await fetchGroupConversations();
                    
                    // Share the post to the newly created group
                    const postLink = `${window.location.origin}/post/${post.id}`;
                    const postPreview = {
                      type: 'post_share',
                      postId: post.id,
                      content: post.content.substring(0, 60) + (post.content.length > 60 ? '...' : ''),
                      imageUrl: post.imageUrl || null,
                      authorName: post.user.displayName,
                      authorImage: post.user.profileImageUrl || '',
                      likes: post.likes,
                      comments: totalCommentCount,
                      link: postLink
                    };
                    
                    // Stringify the JSON to send as message content
                    const messageContent = JSON.stringify(postPreview);
                    
                    // Send message to the group
                    await sendMessage(conversationId, user.id, messageContent);
                    
                    // Close share dialog and clear all search states
                    setShareDialogOpen(false);
                    setSearchQuery('');
                    setSearchResults([]);
                    setGroupSearchQuery('');
                    setFilteredGroupConversations(groupConversations);
                  } catch (error) {
                    console.error('Error creating group chat:', error);
                    toast({
                      title: "Error",
                      description: "Failed to create group chat. Please try again.",
                      variant: "destructive",
                    });
                  }
                }}
              >
                Create & Share
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {showComments && user && (
          <CommentSection 
            post={{...post, comments: totalCommentCount}} 
            currentUser={user} 
          />
        )}
      </CardContent>
    </Card>
  );
};

export default Post;
