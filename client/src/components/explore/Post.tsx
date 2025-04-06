import { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Heart, MessageSquare, Share2, MoreHorizontal, Check, Copy, Link, Send, Search, User as UserIcon, Users, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Post as PostType, User, Conversation } from '@/types';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import CommentSection from './CommentSection';
import { useAuthStore, useMessaging } from '@/lib/stores';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose
} from "@/components/ui/dialog";

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
  
  const isLiked = likedPosts.includes(post.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const { createConversation, sendMessage } = useMessaging();

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
  
  // Use the total comment count from the database for the UI
  // This includes both top-level comments and all replies
  const totalCommentCount = commentCountData?.count || 0;
  
  // For demo purposes, use the first user as the current user
  const currentUser = users?.[0];

  // Save liked posts to local storage
  useEffect(() => {
    localStorage.setItem('likedPosts', JSON.stringify(likedPosts));
  }, [likedPosts]);

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

  const formattedDate = formatDistanceToNow(new Date(post.createdAt), { addSuffix: true });
  const isPending = likePostMutation.isPending || unlikePostMutation.isPending;

  return (
    <Card id={`post-${post.id}`} className="mb-4 overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center mb-3">
          <Avatar className="w-10 h-10 mr-3">
            <AvatarImage src={post.user.profileImageUrl} alt={post.user.displayName} />
            <AvatarFallback>{post.user.displayName.charAt(0)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold">{post.user.displayName}</p>
            <p className="text-xs text-gray-500">{post.user.bio || 'Creator'} • {formattedDate}</p>
          </div>
          <Button variant="ghost" size="icon" className="ml-auto">
            <MoreHorizontal className="h-5 w-5 text-gray-400" />
          </Button>
        </div>
        
        <p className="mb-4">{post.content}</p>
        
        {post.imageUrl && (
          <img 
            src={post.imageUrl} 
            alt="Post content" 
            className="w-full h-64 object-cover rounded-lg mb-4" 
          />
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
                              <AvatarImage src={user.profileImageUrl} alt={user.displayName} />
                              <AvatarFallback>
                                <UserIcon className="h-5 w-5" />
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{user.displayName}</p>
                              <p className="text-xs text-gray-500 truncate">{user.username}</p>
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
                            <AvatarImage src={foundUser.profileImageUrl} alt={foundUser.displayName} />
                            <AvatarFallback>{foundUser.displayName.charAt(0)}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{foundUser.displayName}</p>
                            <p className="text-xs text-gray-500 truncate">{foundUser.username}</p>
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
                              <AvatarImage src={selectedUser.profileImageUrl} alt={selectedUser.displayName} />
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
                      authorImage: post.user.profileImageUrl,
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

        {showComments && currentUser && (
          <CommentSection 
            post={{...post, comments: totalCommentCount}} 
            currentUser={currentUser} 
          />
        )}
      </CardContent>
    </Card>
  );
};

export default Post;
