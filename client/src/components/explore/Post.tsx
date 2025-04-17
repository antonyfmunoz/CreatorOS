import { useState, useEffect, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { 
  Heart, MessageSquare, Share2, MoreHorizontal, Check, Copy, Link, Send, Search, 
  User as UserIcon, Users, X, Pencil, Trash, Bookmark, Edit, Save 
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Post as ImportedPostType, Conversation } from '@/types';

// Extend the PostType to include taggedUsers
interface PostType extends ImportedPostType {
  taggedUsers?: TaggedUser[];
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
import { parseUserTagsToJSX, parseUserTags } from '@/lib/textParser';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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

interface PostProps {
  post: PostType;
}

const Post = ({ post }: PostProps) => {
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
  
  // Use local storage to remember liked posts across refreshes
  const [likedPosts, setLikedPosts] = useState<number[]>(() => {
    const saved = localStorage.getItem('likedPosts');
    return saved ? JSON.parse(saved) : [];
  });
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(post.content);
  const [showTags, setShowTags] = useState(false);
  const [savedPosts, setSavedPosts] = useState<number[]>(() => {
    const saved = localStorage.getItem('savedPosts');
    return saved ? JSON.parse(saved) : [];
  });
  
  const isLiked = likedPosts.includes(post.id);
  const isSaved = savedPosts.includes(post.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { createConversation, sendMessage } = useMessaging();
  const [, setLocation] = useLocation();

  // Get the current user
  const { data: users } = useQuery<User[]>({
    queryKey: ['/api/users'],
    queryFn: async () => {
      const res = await fetch('/api/users');
      if (!res.ok) throw new Error('Failed to fetch users');
      return res.json();
    }
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

  // Save liked posts to local storage
  useEffect(() => {
    localStorage.setItem('likedPosts', JSON.stringify(likedPosts));
  }, [likedPosts]);
  
  // Save saved posts to local storage
  useEffect(() => {
    localStorage.setItem('savedPosts', JSON.stringify(savedPosts));
  }, [savedPosts]);

  const likePostMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/posts/${post.id}/like`, null);
      return res.json();
    },
    onSuccess: (updatedPost) => {
      // Update the post in the cache directly without refetching
      queryClient.setQueryData(['/api/posts'], (oldData: PostType[] | undefined) => {
        if (!oldData) return oldData;
        // Maintain the same array order while updating the specific post
        return oldData.map(p => p.id === post.id ? { ...p, likes: updatedPost.likes } : p);
      });
      
      // Remember this post was liked by adding it to likedPosts
      setLikedPosts(prev => [...prev, post.id]);
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
      // Update the post in the cache directly without refetching
      queryClient.setQueryData(['/api/posts'], (oldData: PostType[] | undefined) => {
        if (!oldData) return oldData;
        // Maintain the same array order while updating the specific post
        return oldData.map(p => p.id === post.id ? { ...p, likes: updatedPost.likes } : p);
      });
      
      // Remove this post from the liked posts list
      setLikedPosts(prev => prev.filter(id => id !== post.id));
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
  
  const copyPostLink = () => {
    // Create a shareable link for the post
    const postLink = `${window.location.origin}/post/${post.id}`;
    navigator.clipboard.writeText(postLink).then(() => {
      setCopied(true);
      
      // Show success toast notification
      toast({
        title: "Link Copied",
        description: "Post link copied to clipboard.",
      });
      
      // Reset the copied state after 2 seconds
      setTimeout(() => setCopied(false), 2000);
    });
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
      // Update the post in the cache directly without refetching
      queryClient.setQueryData(['/api/posts'], (oldData: PostType[] | undefined) => {
        if (!oldData) return oldData;
        return oldData.map(p => p.id === post.id ? { ...p, content: updatedPost.content } : p);
      });
      
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

  // Delete post mutation
  const deletePostMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('DELETE', `/api/posts/${post.id}`, null);
    },
    onSuccess: () => {
      // Remove the post from the cache
      queryClient.setQueryData(['/api/posts'], (oldData: PostType[] | undefined) => {
        if (!oldData) return oldData;
        return oldData.filter(p => p.id !== post.id);
      });
      
      toast({
        title: "Post Deleted",
        description: "Your post has been deleted successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete the post. Please try again.",
        variant: "destructive",
      });
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
      // Add the post to saved posts
      setSavedPosts(prev => [...prev, post.id]);
      
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
      // Remove the post from saved posts
      setSavedPosts(prev => prev.filter(id => id !== post.id));
      
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

  // Handle delete post with confirmation
  const handleDeletePost = () => {
    if (confirm('Are you sure you want to delete this post? This action cannot be undone.')) {
      deletePostMutation.mutate();
    }
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
  const isPending = likePostMutation.isPending || unlikePostMutation.isPending || 
                   updatePostMutation.isPending || deletePostMutation.isPending || 
                   savePostMutation.isPending || unsavePostMutation.isPending;

  return (
    <Card id={`post-${post.id}`} className="mb-4 overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center mb-3">
          <Avatar 
            className="w-10 h-10 mr-3 cursor-pointer hover:ring-2 hover:ring-primary transition-all"
            onClick={() => setLocation(`/profile/${post.user.id}`)}
          >
            <AvatarImage src={post.user.profileImageUrl || undefined} alt={post.user.displayName} />
            <AvatarFallback>{post.user.displayName.charAt(0)}</AvatarFallback>
          </Avatar>
          <div>
            <p 
              className="font-semibold cursor-pointer hover:text-primary hover:underline" 
              onClick={() => setLocation(`/profile/${post.user.id}`)}
            >
              {post.user.displayName}
            </p>
            <p className="text-xs text-gray-500">{formattedDate}</p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="ml-auto">
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
          <p 
            className="mb-4" 
            dangerouslySetInnerHTML={{ __html: parseUserTags(post.content) }}
          />
        )}
        
        {post.imageUrl && (
          <div className="relative mb-4">
            <img 
              src={post.imageUrl} 
              alt="Post content" 
              className={`w-full object-contain rounded-lg cursor-pointer ${post.taggedUsers && post.taggedUsers.length > 0 ? 'hover:opacity-95' : ''}`}
              onClick={() => {
                console.log("Image clicked, toggling tags. Tagged users:", post.taggedUsers);
                setShowTags(!showTags);
              }}
            />
            
            {/* Tagged users overlay - only show username fab when clicked */}
            {showTags && taggedUsers.length > 0 && (
              <div className="absolute inset-0 z-10">
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
                        setLocation(`/profile/${taggedUser.username}`);
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
        
        <div className="flex items-center justify-between text-gray-500">
          <div className="flex space-x-4">
            <Button 
              variant="ghost" 
              size="sm" 
              className="flex items-center gap-1 px-2"
              onClick={handleLikeToggle}
              disabled={isPending}
            >
              <Heart className={`h-5 w-5 ${isLiked ? 'fill-red-500 text-red-500' : ''}`} />
              <span>{post.likes}</span>
            </Button>
            
            <Button 
              variant="ghost" 
              size="sm" 
              className="flex items-center gap-1 px-2"
              onClick={toggleComments}
            >
              <MessageSquare className={`h-5 w-5 ${showComments ? 'text-blue-500' : ''}`} />
              <span>{totalCommentCount}</span>
            </Button>
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
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm" className="flex items-center px-2" onClick={handleShare}>
                <Share2 className="h-5 w-5" />
              </Button>
            </DialogTrigger>
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
