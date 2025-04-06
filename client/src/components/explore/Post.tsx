import { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Heart, MessageSquare, Share2, MoreHorizontal, Check, Copy, Link, Send, Search, User as UserIcon } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Post as PostType, User } from '@/types';
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
  };
  
  const copyPostLink = () => {
    // Create a shareable link for the post
    const postLink = `${window.location.origin}/post/${post.id}`;
    navigator.clipboard.writeText(postLink).then(() => {
      setCopied(true);
      toast({
        title: "Link copied",
        description: "Post link copied to clipboard",
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
      
      // Create post share message
      const postLink = `${window.location.origin}/post/${post.id}`;
      const messageContent = `Check out this post: ${post.content.substring(0, 30)}${post.content.length > 30 ? '...' : ''}\n${postLink}`;
      
      // Send message
      await sendMessage(conversationId, user.id, messageContent);
      
      // Show success message
      toast({
        title: "Post shared",
        description: `Post shared with ${targetUser.displayName} via message`,
      });
      
      // Close dialog and clear search
      setShareDialogOpen(false);
      setSearchQuery('');
      setSearchResults([]);
      
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
    <Card className="mb-4 overflow-hidden">
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
          
          <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
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
                    <span>Message</span>
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
