import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Heart, MessageSquare, Share2, MoreHorizontal } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Post as PostType } from '@/types';
import { apiRequest } from '@/lib/queryClient';

interface PostProps {
  post: PostType;
}

const Post = ({ post }: PostProps) => {
  const [isLiked, setIsLiked] = useState(false);
  const queryClient = useQueryClient();

  const likePostMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/posts/${post.id}/like`, null);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/posts'] });
    },
  });

  const handleLike = () => {
    if (!isLiked) {
      likePostMutation.mutate();
      setIsLiked(true);
    }
  };

  const formattedDate = formatDistanceToNow(new Date(post.createdAt), { addSuffix: true });

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
            <p className="text-xs text-gray-500">{post.user.bio} • {formattedDate}</p>
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
              onClick={handleLike}
            >
              <Heart className={`h-5 w-5 ${isLiked ? 'fill-red-500 text-red-500' : ''}`} />
              <span>{post.likes + (isLiked ? 1 : 0)}</span>
            </Button>
            
            <Button variant="ghost" size="sm" className="flex items-center gap-1 px-2">
              <MessageSquare className="h-5 w-5" />
              <span>{post.comments}</span>
            </Button>
          </div>
          
          <Button variant="ghost" size="sm" className="flex items-center gap-1 px-2">
            <Share2 className="h-5 w-5" />
            <span>Share</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default Post;
