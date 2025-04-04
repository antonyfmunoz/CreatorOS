import { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Heart, MessageSquare, Share2, MoreHorizontal } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { Post as PostType, User } from '@/types';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import CommentSection from './CommentSection';

interface PostProps {
  post: PostType;
}

const Post = ({ post }: PostProps) => {
  const [showComments, setShowComments] = useState(false);
  // Use local storage to remember liked posts across refreshes
  const [likedPosts, setLikedPosts] = useState<number[]>(() => {
    const saved = localStorage.getItem('likedPosts');
    return saved ? JSON.parse(saved) : [];
  });
  
  const isLiked = likedPosts.includes(post.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
              <span>{comments.length}</span>
            </Button>
          </div>
          
          <Button variant="ghost" size="sm" className="flex items-center gap-1 px-2">
            <Share2 className="h-5 w-5" />
            <span>Share</span>
          </Button>
        </div>

        {showComments && currentUser && (
          <CommentSection 
            post={{...post, comments: comments.length}} 
            currentUser={currentUser} 
          />
        )}
      </CardContent>
    </Card>
  );
};

export default Post;
