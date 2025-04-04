import { useState, useEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatDistanceToNow } from 'date-fns';
import { Send, Heart, MessageCircle, ChevronRight, ChevronDown } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Comment, Post, User } from '@/types';

interface CommentSectionProps {
  post: Post;
  currentUser?: User;
}

const SingleComment = ({ 
  comment, 
  currentUser, 
  onReply,
  depth = 0,
  forceShowReplies = false,
  replyingTo = null
}: { 
  comment: Comment & { user: User }, 
  currentUser?: User,
  onReply: (parentId: number) => void,
  depth?: number,
  forceShowReplies?: boolean,
  replyingTo?: number | null
}) => {
  const [showReplies, setShowReplies] = useState(forceShowReplies);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Fetch replies for this comment
  const { data: replies = [], isLoading: isLoadingReplies } = useQuery({
    queryKey: ['/api/comments', comment.id, 'replies'],
    queryFn: async () => {
      const res = await fetch(`/api/comments/${comment.id}/replies`);
      if (!res.ok) throw new Error('Failed to fetch replies');
      return res.json();
    }
  }) as { data: (Comment & { user: User })[], isLoading: boolean };
  
  // Update showReplies when forceShowReplies changes or when we get replies
  useEffect(() => {
    if (forceShowReplies || (replies && replies.length > 0)) {
      setShowReplies(true);
    }
  }, [forceShowReplies, replies]);
  
  // Mutation for liking a comment
  const likeCommentMutation = useMutation({
    mutationFn: async (commentId: number) => {
      const res = await apiRequest('POST', `/api/comments/${commentId}/like`);
      return res.json();
    },
    onSuccess: (updatedComment) => {
      // Update the comment likes in the cache
      queryClient.invalidateQueries({ queryKey: ['/api/posts', updatedComment.postId, 'comments'] });
      if (comment.parentId) {
        queryClient.invalidateQueries({ queryKey: ['/api/comments', comment.parentId, 'replies'] });
      }
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'Failed to like the comment. Please try again.',
        variant: 'destructive',
      });
    }
  });
  
  const handleLike = () => {
    if (!currentUser) return;
    likeCommentMutation.mutate(comment.id);
  };
  
  const toggleReplies = () => {
    setShowReplies(!showReplies);
  };
  
  // Only allow replies up to 3 levels deep
  const canReply = depth < 2;
  
  return (
    <div className="flex gap-3">
      <Avatar className="w-8 h-8 shrink-0">
        <AvatarImage src={comment.user.profileImageUrl} alt={comment.user.displayName} />
        <AvatarFallback>{comment.user.displayName.charAt(0)}</AvatarFallback>
      </Avatar>
      <div className="flex-1 space-y-2">
        <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg">
          <div className="flex justify-between">
            <p className="font-medium text-sm">{comment.user.displayName}</p>
            <span className="text-xs text-gray-500">
              {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
            </span>
          </div>
          <p className="text-sm mt-1">{comment.content}</p>
        </div>
        
        <div className="flex items-center gap-3 ml-1">
          <Button 
            variant="ghost"
            size="sm"
            className="flex items-center gap-1 px-2 h-6"
            onClick={handleLike}
          >
            <Heart className={`h-4 w-4 ${comment.likes > 0 ? 'fill-rose-500 text-rose-500' : ''}`} />
            <span className="text-xs">{comment.likes > 0 ? comment.likes : 'Like'}</span>
          </Button>
          
          {canReply && (
            <Button 
              variant="ghost"
              size="sm"
              className="flex items-center gap-1 px-2 h-6"
              onClick={() => onReply(comment.id)}
            >
              <MessageCircle className="h-4 w-4" />
              <span className="text-xs">Reply</span>
            </Button>
          )}
          
          {replies.length > 0 ? (
            <Button 
              variant="ghost"
              size="sm"
              className="flex items-center gap-1 px-2 h-6"
              onClick={toggleReplies}
            >
              {showReplies ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              <span className="text-xs">{replies.length} {replies.length === 1 ? 'reply' : 'replies'}</span>
            </Button>
          ) : null}
        </div>
        
        {showReplies && (
          <div className="ml-4 space-y-4 mt-2">
            {isLoadingReplies ? (
              <div className="text-center py-2 text-sm">Loading replies...</div>
            ) : (
              replies.map((reply: Comment & { user: User }) => (
                <SingleComment 
                  key={reply.id} 
                  comment={reply} 
                  currentUser={currentUser} 
                  onReply={onReply}
                  depth={depth + 1}
                  replyingTo={replyingTo}
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const CommentSection = ({ post, currentUser }: CommentSectionProps) => {
  const [commentText, setCommentText] = useState('');
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
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
    mutationFn: async (newComment: { postId: number; userId: number; content: string; parentId?: number }) => {
      const res = await apiRequest('POST', '/api/comments', newComment);
      return res.json();
    },
    onSuccess: (data) => {
      // Clear the input field
      setCommentText('');
      setReplyingTo(null);
      
      // Invalidate the comments query to refetch
      if (data.parentId) {
        // If this is a reply, invalidate the parent's replies
        queryClient.invalidateQueries({ queryKey: ['/api/comments', data.parentId, 'replies'] });
      } else {
        // Otherwise, invalidate the post's comments
        queryClient.invalidateQueries({ queryKey: ['/api/posts', post.id, 'comments'] });
      }
      
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
      content: commentText,
      ...(replyingTo ? { parentId: replyingTo } : {})
    };
    console.log('Submitting comment:', comment);
    createCommentMutation.mutate(comment);
  };
  
  const handleReply = (parentId: number) => {
    setReplyingTo(parentId);
    // Focus the comment input
    document.querySelector('textarea')?.focus();
  };

  return (
    <div className="mt-4 border-t pt-4">
      <h3 className="font-medium mb-4">Comments ({post.comments})</h3>
      
      {replyingTo && (
        <div className="mb-4 bg-gray-50 dark:bg-gray-900 p-2 rounded-md border border-primary/20">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium">Replying to a comment</span>
            <Button 
              variant="ghost" 
              size="sm"
              className="h-6 px-2"
              onClick={() => setReplyingTo(null)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
      
      {isLoading ? (
        <div className="text-center py-4">Loading comments...</div>
      ) : (
        <div className="space-y-4 mb-4 max-h-80 overflow-y-auto">
          {comments.length === 0 ? (
            <p className="text-gray-500 text-center py-2">No comments yet. Be the first to comment!</p>
          ) : (
            comments.map((comment: Comment & { user: User }) => (
              <SingleComment 
                key={comment.id} 
                comment={comment} 
                currentUser={currentUser} 
                onReply={handleReply}
                forceShowReplies={replyingTo === comment.id}
                replyingTo={replyingTo}
              />
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