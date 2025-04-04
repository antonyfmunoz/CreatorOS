import { useState, useEffect, useRef } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatDistanceToNow } from 'date-fns';
import { Send, Heart, MessageCircle, ChevronRight, ChevronDown, Edit, Trash2, MoreHorizontal, X, Check } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Comment, Post, User } from '@/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(comment.content);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Check if the current user is the author of the comment
  const isAuthor = currentUser?.id === comment.userId;
  
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
  
  // State to track if the current user has liked this comment
  const [isLiked, setIsLiked] = useState(comment.likes > 0);
  
  // Mutation for liking a comment
  const likeCommentMutation = useMutation({
    mutationFn: async (commentId: number) => {
      const res = await apiRequest('POST', `/api/comments/${commentId}/like`);
      return res.json();
    },
    onMutate: async (commentId) => {
      // Capture the previous state
      await queryClient.cancelQueries({ queryKey: ['/api/posts', comment.postId, 'comments'] });
      const previousPostComments = queryClient.getQueryData(['/api/posts', comment.postId, 'comments']);
      
      // Capture previous state for replies if this is a reply
      let previousReplies = null;
      if (comment.parentId) {
        await queryClient.cancelQueries({ queryKey: ['/api/comments', comment.parentId, 'replies'] });
        previousReplies = queryClient.getQueryData(['/api/comments', comment.parentId, 'replies']);
      }
      
      // Optimistically update the comment likes
      // For top-level comments
      queryClient.setQueryData(['/api/posts', comment.postId, 'comments'], (old: any) => {
        if (!old) return old;
        return old.map((c: Comment & { user: User }) => 
          c.id === commentId ? { ...c, likes: 1 } : c
        );
      });
      
      // For replies
      if (comment.parentId) {
        queryClient.setQueryData(['/api/comments', comment.parentId, 'replies'], (old: any) => {
          if (!old) return old;
          return old.map((c: Comment & { user: User }) => 
            c.id === commentId ? { ...c, likes: 1 } : c
          );
        });
      }
      
      // Also update directly for replies of the current comment
      queryClient.setQueryData(['/api/comments', commentId, 'replies'], (old: any) => {
        if (!old) return old;
        return old.map((c: Comment & { user: User }) => ({ ...c }));
      });
      
      // Mark as liked
      setIsLiked(true);
      
      return { previousPostComments, previousReplies };
    },
    onSuccess: (updatedComment, _, context) => {
      // We can optionally use the returned data to synchronize our optimistic update
      queryClient.setQueryData(['/api/posts', updatedComment.postId, 'comments'], (old: any) => {
        if (!old) return old;
        return old.map((c: Comment & { user: User }) => 
          c.id === updatedComment.id ? { ...c, likes: updatedComment.likes } : c
        );
      });
      
      if (updatedComment.parentId) {
        queryClient.setQueryData(['/api/comments', updatedComment.parentId, 'replies'], (old: any) => {
          if (!old) return old;
          return old.map((c: Comment & { user: User }) => 
            c.id === updatedComment.id ? { ...c, likes: updatedComment.likes } : c
          );
        });
      }
    },
    onError: (_, __, context: any) => {
      // Revert to the previous state if there was an error
      if (context?.previousPostComments) {
        queryClient.setQueryData(['/api/posts', comment.postId, 'comments'], context.previousPostComments);
      }
      
      if (comment.parentId && context?.previousReplies) {
        queryClient.setQueryData(['/api/comments', comment.parentId, 'replies'], context.previousReplies);
      }
      
      // Revert liked state
      setIsLiked(false);
      
      toast({
        title: 'Error',
        description: 'Failed to like the comment. Please try again.',
        variant: 'destructive',
      });
    }
  });
  
  // Mutation for unliking a comment
  // Mutation for updating a comment
  const updateCommentMutation = useMutation({
    mutationFn: async ({ commentId, content, userId }: { commentId: number; content: string; userId: number }) => {
      const res = await apiRequest('PUT', `/api/comments/${commentId}`, { content, userId });
      return res.json();
    },
    onMutate: async ({ commentId, content }) => {
      // Capture the previous state
      await queryClient.cancelQueries({ queryKey: ['/api/posts', comment.postId, 'comments'] });
      const previousPostComments = queryClient.getQueryData(['/api/posts', comment.postId, 'comments']);
      
      // Capture previous state for replies if this is a reply
      let previousReplies = null;
      if (comment.parentId) {
        await queryClient.cancelQueries({ queryKey: ['/api/comments', comment.parentId, 'replies'] });
        previousReplies = queryClient.getQueryData(['/api/comments', comment.parentId, 'replies']);
      }
      
      // Optimistically update the comment content
      // For top-level comments
      queryClient.setQueryData(['/api/posts', comment.postId, 'comments'], (old: any) => {
        if (!old) return old;
        return old.map((c: Comment & { user: User }) => 
          c.id === commentId ? { ...c, content } : c
        );
      });
      
      // For replies
      if (comment.parentId) {
        queryClient.setQueryData(['/api/comments', comment.parentId, 'replies'], (old: any) => {
          if (!old) return old;
          return old.map((c: Comment & { user: User }) => 
            c.id === commentId ? { ...c, content } : c
          );
        });
      }
      
      return { previousPostComments, previousReplies };
    },
    onSuccess: (updatedComment) => {
      // Use the returned data to ensure the UI is in sync with the server
      queryClient.setQueryData(['/api/posts', updatedComment.postId, 'comments'], (old: any) => {
        if (!old) return old;
        return old.map((c: Comment & { user: User }) => 
          c.id === updatedComment.id ? { ...c, content: updatedComment.content } : c
        );
      });
      
      if (updatedComment.parentId) {
        queryClient.setQueryData(['/api/comments', updatedComment.parentId, 'replies'], (old: any) => {
          if (!old) return old;
          return old.map((c: Comment & { user: User }) => 
            c.id === updatedComment.id ? { ...c, content: updatedComment.content } : c
          );
        });
      }
      
      // Exit edit mode
      setIsEditing(false);
      toast({
        title: 'Success',
        description: 'Comment updated successfully',
      });
    },
    onError: (_, __, context: any) => {
      // Revert to the previous state if there was an error
      if (context?.previousPostComments) {
        queryClient.setQueryData(['/api/posts', comment.postId, 'comments'], context.previousPostComments);
      }
      
      if (comment.parentId && context?.previousReplies) {
        queryClient.setQueryData(['/api/comments', comment.parentId, 'replies'], context.previousReplies);
      }
      
      toast({
        title: 'Error',
        description: 'Failed to update the comment. Please try again.',
        variant: 'destructive',
      });
    }
  });
  
  // Mutation for deleting a comment
  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: number) => {
      // Pass the user ID as a query parameter
      const res = await apiRequest('DELETE', `/api/comments/${commentId}?userId=${currentUser?.id}`);
      return commentId; // Just return the ID as there's no response body for 204
    },
    onMutate: async (commentId) => {
      // Capture the previous state
      await queryClient.cancelQueries({ queryKey: ['/api/posts', comment.postId, 'comments'] });
      const previousPostComments = queryClient.getQueryData(['/api/posts', comment.postId, 'comments']);
      
      // Capture previous state for replies if this is a reply
      let previousReplies = null;
      if (comment.parentId) {
        await queryClient.cancelQueries({ queryKey: ['/api/comments', comment.parentId, 'replies'] });
        previousReplies = queryClient.getQueryData(['/api/comments', comment.parentId, 'replies']);
      }
      
      // Optimistically remove the comment
      // For top-level comments
      queryClient.setQueryData(['/api/posts', comment.postId, 'comments'], (old: any) => {
        if (!old) return old;
        return old.filter((c: Comment & { user: User }) => c.id !== commentId);
      });
      
      // For replies
      if (comment.parentId) {
        queryClient.setQueryData(['/api/comments', comment.parentId, 'replies'], (old: any) => {
          if (!old) return old;
          return old.filter((c: Comment & { user: User }) => c.id !== commentId);
        });
      }
      
      // Clear any replies this comment had
      queryClient.setQueryData(['/api/comments', commentId, 'replies'], []);
      
      // Update the post comment count in the cache
      queryClient.setQueryData(['/api/posts'], (oldData: Post[] | undefined) => {
        if (!oldData) return oldData;
        return oldData.map(p => 
          p.id === comment.postId ? { ...p, comments: Math.max(0, p.comments - 1) } : p
        );
      });
      
      return { previousPostComments, previousReplies };
    },
    onSuccess: () => {
      toast({
        title: 'Success',
        description: 'Comment deleted successfully',
      });
    },
    onError: (_, __, context: any) => {
      // Revert to the previous state if there was an error
      if (context?.previousPostComments) {
        queryClient.setQueryData(['/api/posts', comment.postId, 'comments'], context.previousPostComments);
      }
      
      if (comment.parentId && context?.previousReplies) {
        queryClient.setQueryData(['/api/comments', comment.parentId, 'replies'], context.previousReplies);
      }
      
      toast({
        title: 'Error',
        description: 'Failed to delete the comment. Please try again.',
        variant: 'destructive',
      });
    }
  });
  
  const unlikeCommentMutation = useMutation({
    mutationFn: async (commentId: number) => {
      const res = await apiRequest('POST', `/api/comments/${commentId}/unlike`);
      return res.json();
    },
    onMutate: async (commentId) => {
      // Capture the previous state
      await queryClient.cancelQueries({ queryKey: ['/api/posts', comment.postId, 'comments'] });
      const previousPostComments = queryClient.getQueryData(['/api/posts', comment.postId, 'comments']);
      
      // Capture previous state for replies if this is a reply
      let previousReplies = null;
      if (comment.parentId) {
        await queryClient.cancelQueries({ queryKey: ['/api/comments', comment.parentId, 'replies'] });
        previousReplies = queryClient.getQueryData(['/api/comments', comment.parentId, 'replies']);
      }
      
      // Optimistically update the comment likes
      // For top-level comments
      queryClient.setQueryData(['/api/posts', comment.postId, 'comments'], (old: any) => {
        if (!old) return old;
        return old.map((c: Comment & { user: User }) => 
          c.id === commentId ? { ...c, likes: 0 } : c
        );
      });
      
      // For replies
      if (comment.parentId) {
        queryClient.setQueryData(['/api/comments', comment.parentId, 'replies'], (old: any) => {
          if (!old) return old;
          return old.map((c: Comment & { user: User }) => 
            c.id === commentId ? { ...c, likes: 0 } : c
          );
        });
      }
      
      // Also update directly for replies of the current comment
      queryClient.setQueryData(['/api/comments', commentId, 'replies'], (old: any) => {
        if (!old) return old;
        return old.map((c: Comment & { user: User }) => ({ ...c }));
      });
      
      // Mark as not liked
      setIsLiked(false);
      
      return { previousPostComments, previousReplies };
    },
    onSuccess: (updatedComment, _, context) => {
      // We can optionally use the returned data to synchronize our optimistic update
      queryClient.setQueryData(['/api/posts', updatedComment.postId, 'comments'], (old: any) => {
        if (!old) return old;
        return old.map((c: Comment & { user: User }) => 
          c.id === updatedComment.id ? { ...c, likes: updatedComment.likes } : c
        );
      });
      
      if (updatedComment.parentId) {
        queryClient.setQueryData(['/api/comments', updatedComment.parentId, 'replies'], (old: any) => {
          if (!old) return old;
          return old.map((c: Comment & { user: User }) => 
            c.id === updatedComment.id ? { ...c, likes: updatedComment.likes } : c
          );
        });
      }
    },
    onError: (_, __, context: any) => {
      // Revert to the previous state if there was an error
      if (context?.previousPostComments) {
        queryClient.setQueryData(['/api/posts', comment.postId, 'comments'], context.previousPostComments);
      }
      
      if (comment.parentId && context?.previousReplies) {
        queryClient.setQueryData(['/api/comments', comment.parentId, 'replies'], context.previousReplies);
      }
      
      // Revert liked state
      setIsLiked(true);
      
      toast({
        title: 'Error',
        description: 'Failed to unlike the comment. Please try again.',
        variant: 'destructive',
      });
    }
  });
  
  const handleLike = () => {
    if (!currentUser) return;
    
    if (isLiked) {
      unlikeCommentMutation.mutate(comment.id);
    } else {
      likeCommentMutation.mutate(comment.id);
    }
  };
  
  // Handler for starting edit mode
  const handleEdit = () => {
    setIsEditing(true);
    // Focus the edit textarea when edit mode is activated
    setTimeout(() => {
      editInputRef.current?.focus();
    }, 0);
  };
  
  // Handler for saving an edited comment
  const handleSaveEdit = () => {
    if (!editedContent.trim() || !currentUser) return;
    
    updateCommentMutation.mutate({
      commentId: comment.id,
      content: editedContent,
      userId: currentUser.id
    });
  };
  
  // Handler for canceling edit mode
  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedContent(comment.content); // Reset to original
  };
  
  // Handler for confirming delete
  const handleDelete = () => {
    setIsDeleteDialogOpen(true);
  };
  
  // Handler for confirming delete in the dialog
  const handleConfirmDelete = () => {
    if (!currentUser) return;
    deleteCommentMutation.mutate(comment.id);
    setIsDeleteDialogOpen(false);
  };
  
  const toggleReplies = () => {
    setShowReplies(!showReplies);
  };
  
  // Only allow replies up to 3 levels deep
  const canReply = depth < 2;
  
  return (
    <div className="flex gap-3">
      {/* Delete confirmation dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Comment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this comment? This action cannot be undone.
            </AlertDialogDescription>
            {replies.length > 0 && (
              <div className="mt-2 text-sm font-medium text-red-500">
                This will also delete {replies.length} {replies.length === 1 ? 'reply' : 'replies'}.
              </div>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      <Avatar className="w-8 h-8 shrink-0">
        <AvatarImage src={comment.user.profileImageUrl} alt={comment.user.displayName} />
        <AvatarFallback>{comment.user.displayName.charAt(0)}</AvatarFallback>
      </Avatar>
      <div className="flex-1 space-y-2">
        <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg">
          <div className="flex justify-between">
            <p className="font-medium text-sm">{comment.user.displayName}</p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">
                {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
              </span>
              
              {isAuthor && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleEdit}>
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
          
          {isEditing ? (
            <div className="mt-2">
              <Textarea
                ref={editInputRef}
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                className="min-h-[60px] text-sm resize-none"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSaveEdit();
                  } else if (e.key === 'Escape') {
                    handleCancelEdit();
                  }
                }}
              />
              <div className="flex gap-2 mt-2 justify-end">
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="h-7 text-xs px-2"
                  onClick={handleCancelEdit}
                >
                  <X className="h-3 w-3 mr-1" />
                  Cancel
                </Button>
                <Button 
                  size="sm" 
                  className="h-7 text-xs px-2"
                  onClick={handleSaveEdit}
                  disabled={!editedContent.trim() || updateCommentMutation.isPending}
                >
                  <Check className="h-3 w-3 mr-1" />
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm mt-1">{comment.content}</p>
          )}
        </div>
        
        <div className="flex items-center gap-3 ml-1">
          <Button 
            variant="ghost"
            size="sm"
            className="flex items-center gap-1 px-2 h-6"
            onClick={handleLike}
            disabled={likeCommentMutation.isPending || unlikeCommentMutation.isPending}
          >
            <Heart className={`h-4 w-4 ${isLiked ? 'fill-rose-500 text-rose-500' : ''}`} />
            <span className="text-xs">{isLiked ? (comment.likes > 0 ? comment.likes : 1) : 'Like'}</span>
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
      <h3 className="font-medium mb-4">
        {post.comments > 0 ? `Comments (${post.comments})` : 'Comments'} 
      </h3>
      
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