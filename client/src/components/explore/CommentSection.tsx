import { useState, useEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatDistanceToNow } from 'date-fns';
import { Send } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Comment, Post, User } from '@/types';

interface CommentSectionProps {
  post: Post;
  currentUser?: User;
}

const CommentSection = ({ post, currentUser }: CommentSectionProps) => {
  const [commentText, setCommentText] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch the comments for this post
  const { data: comments = [], isLoading } = useQuery({
    queryKey: ['/api/posts', post.id, 'comments'],
    queryFn: async () => {
      const res = await fetch(`/api/posts/${post.id}/comments`);
      if (!res.ok) throw new Error('Failed to fetch comments');
      return res.json();
    }
  });

  // Mutation for creating a new comment
  const createCommentMutation = useMutation({
    mutationFn: async (newComment: { postId: number; userId: number; content: string }) => {
      const res = await apiRequest('POST', '/api/comments', newComment);
      return res.json();
    },
    onSuccess: () => {
      // Clear the input field
      setCommentText('');
      
      // Invalidate the comments query to refetch
      queryClient.invalidateQueries({ queryKey: ['/api/posts', post.id, 'comments'] });
      
      // Update the post comment count in the cache
      queryClient.setQueryData(['/api/posts'], (oldData: Post[] | undefined) => {
        if (!oldData) return oldData;
        return oldData.map(p => 
          p.id === post.id ? { ...p, comments: p.comments + 1 } : p
        );
      });
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to post your comment. Please try again.',
        variant: 'destructive',
      });
    }
  });

  const handleSubmitComment = () => {
    if (!commentText.trim() || !currentUser) return;
    
    const comment = {
      postId: post.id,
      userId: currentUser.id,
      content: commentText
    };
    console.log('Submitting comment:', comment);
    createCommentMutation.mutate(comment);
  };

  return (
    <div className="mt-4 border-t pt-4">
      <h3 className="font-medium mb-4">Comments ({post.comments})</h3>
      
      {isLoading ? (
        <div className="text-center py-4">Loading comments...</div>
      ) : (
        <div className="space-y-4 mb-4 max-h-80 overflow-y-auto">
          {comments.length === 0 ? (
            <p className="text-gray-500 text-center py-2">No comments yet. Be the first to comment!</p>
          ) : (
            comments.map((comment: Comment & { user: User }) => (
              <div key={comment.id} className="flex gap-3">
                <Avatar className="w-8 h-8">
                  <AvatarImage src={comment.user.profileImageUrl} alt={comment.user.displayName} />
                  <AvatarFallback>{comment.user.displayName.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg">
                    <div className="flex justify-between">
                      <p className="font-medium text-sm">{comment.user.displayName}</p>
                      <span className="text-xs text-gray-500">
                        {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="text-sm mt-1">{comment.content}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {currentUser && (
        <div className="flex gap-2 items-center mt-2">
          <Avatar className="w-8 h-8">
            <AvatarImage src={currentUser.profileImageUrl} alt={currentUser.displayName} />
            <AvatarFallback>{currentUser.displayName.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="flex-1 relative">
            <Textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="Write a comment..."
              className="min-h-[60px] resize-none pr-12"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmitComment();
                }
              }}
            />
            <Button
              size="sm"
              variant="ghost"
              className="absolute right-2 bottom-2"
              onClick={handleSubmitComment}
              disabled={!commentText.trim() || createCommentMutation.isPending}
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CommentSection;