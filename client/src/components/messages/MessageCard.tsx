import { useState, useRef, useEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { formatDistanceToNow } from 'date-fns';
import { Heart, Reply, Edit, Trash2, MoreHorizontal, X, Check } from 'lucide-react';
import { useAuthStore, useMessaging } from '@/lib/stores';
import { DirectMessage, User } from '@/types';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface MessageCardProps {
  message: DirectMessage & { sender?: User };
  replyToMessage?: (DirectMessage & { sender?: User }) | null;
}

const MessageCard = ({ message, replyToMessage }: MessageCardProps) => {
  const { user } = useAuthStore();
  const { 
    reactToMessage, 
    setEditingMessageId, 
    setReplyingToMessage, 
    deleteMessage,
    messages
  } = useMessaging();
  
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(message.content);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  
  // Focus textarea when editing starts
  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [isEditing]);

  // Check if the current user is the sender of the message
  const isOwnMessage = message.senderId === user?.id;
  
  // Check if message has reactions
  const hasReactions = (() => {
    if (!message.reactions) return false;
    try {
      const reactionsObj = typeof message.reactions === 'string'
        ? JSON.parse(message.reactions as string)
        : message.reactions;
      return Object.keys(reactionsObj).length > 0;
    } catch (e) {
      return false;
    }
  })();
  
  // Handler for editing a message
  const handleEdit = () => {
    setIsEditing(true);
    setEditedContent(message.content);
  };
  
  // Handler for saving edited message
  const handleSaveEdit = () => {
    if (!editedContent.trim()) return;
    useMessaging.getState().editMessage(message.id, editedContent.trim());
    setIsEditing(false);
  };
  
  // Handler for canceling edit mode
  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedContent(message.content); // Reset to original
  };
  
  // Handler for toggling like reaction
  const handleReaction = () => {
    if (user) {
      reactToMessage(message.id, user.id, "❤️");
    }
  };
  
  // Handler for replying to a message
  const handleReply = () => {
    setReplyingToMessage(message);
  };
  
  // Handler for deleting a message
  const handleDelete = () => {
    setIsDeleteDialogOpen(true);
  };
  
  // Handler for confirming delete in the dialog
  const handleConfirmDelete = () => {
    deleteMessage(message.id);
    setIsDeleteDialogOpen(false);
  };
  
  // Check if message has user reaction
  const hasUserReaction = () => {
    if (!user || !message.reactions) return false;
    try {
      const reactionsObj = typeof message.reactions === 'string' 
        ? JSON.parse(message.reactions as string) 
        : message.reactions;
      return !!reactionsObj[user.id.toString()];
    } catch (e) {
      return false;
    }
  };
  
  return (
    <div className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} mb-4`}>
      {/* Delete confirmation dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Message</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this message? This action cannot be undone.
            </AlertDialogDescription>
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
      
      <div className={`flex ${isOwnMessage ? 'flex-row-reverse' : 'flex-row'} max-w-[80%] gap-2`}>
        {!isOwnMessage && (
          <Avatar className="h-8 w-8 mt-1">
            <AvatarImage src={message.sender?.profileImageUrl} />
            <AvatarFallback>{message.sender?.displayName?.charAt(0) || 'U'}</AvatarFallback>
          </Avatar>
        )}
        
        <div className="flex flex-col">
          {/* Reply reference */}
          {replyToMessage && (
            <div 
              className={`text-xs mb-1 ${isOwnMessage ? 'text-right' : 'text-left'} 
                px-3 py-1 rounded-md bg-muted/70 max-w-[200px] truncate
                ${isOwnMessage ? 'mr-1' : 'ml-1'}`}
            >
              <span className="font-medium">
                {replyToMessage.senderId === user?.id ? 'You' : replyToMessage.sender?.displayName}:
              </span> {replyToMessage.content}
            </div>
          )}
          
          <div className="space-y-1">
            {!isOwnMessage && (
              <div className="text-xs text-muted-foreground ml-2">
                {message.sender?.displayName || 'Unknown'}
              </div>
            )}
            
            <div 
              className={`rounded-lg p-3 ${
                isOwnMessage 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-muted'
              } relative group`}
            >
              {isEditing ? (
                <div>
                  <Textarea
                    ref={editInputRef}
                    value={editedContent}
                    onChange={(e) => setEditedContent(e.target.value)}
                    className="min-h-[60px] text-sm resize-none mb-2 bg-background text-foreground"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSaveEdit();
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        handleCancelEdit();
                      }
                    }}
                  />
                  <div className="flex justify-end gap-2">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={handleCancelEdit}
                      className="h-7"
                    >
                      <X className="h-3 w-3 mr-1" />
                      Cancel
                    </Button>
                    <Button 
                      variant={isOwnMessage ? "secondary" : "default"}
                      size="sm" 
                      onClick={handleSaveEdit} 
                      className="h-7"
                      disabled={!editedContent.trim()}
                    >
                      <Check className="h-3 w-3 mr-1" />
                      Save
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <p>{message.content}</p>
                  
                  <div className="flex items-center justify-between mt-1">
                    <p className={`text-xs ${isOwnMessage ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                      {formatDistanceToNow(new Date(message.sentAt), { addSuffix: true })}
                      {message.isEdited && (
                        <span className="ml-1 italic">· edited</span>
                      )}
                    </p>
                    
                    {/* Reaction count */}
                    {hasReactions && (
                      <div 
                        className={`flex items-center text-xs ml-2 px-1.5 py-0.5 rounded-full
                          ${isOwnMessage ? 'bg-primary-foreground/10 text-primary-foreground' : 'bg-muted-foreground/10 text-foreground'}
                        `}
                      >
                        <Heart className={`h-3 w-3 mr-0.5 ${hasUserReaction() ? 'fill-rose-500 text-rose-500' : ''}`} />
                        <span>{
                          (() => {
                            try {
                              const reactionsObj = typeof message.reactions === 'string' 
                                ? JSON.parse(message.reactions as string) 
                                : (message.reactions || {});
                              return Object.keys(reactionsObj).length;
                            } catch (e) {
                              return 0;
                            }
                          })()
                        }</span>
                      </div>
                    )}
                  </div>
                </>
              )}
              
              {/* Message actions (visible on hover) */}
              {!isEditing && (
                <div className={`absolute ${isOwnMessage ? 'left-0' : 'right-0'} -translate-x-full top-1/2 -translate-y-1/2 
                  ${!isOwnMessage && 'translate-x-full'} opacity-0 group-hover:opacity-100 transition-opacity
                  flex items-center bg-background shadow-sm rounded-full p-1 border space-x-1`}>
                  
                  {/* React button */}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7" 
                          onClick={handleReaction}
                        >
                          <Heart className={`h-3.5 w-3.5 ${hasUserReaction() ? 'fill-rose-500 text-rose-500' : ''}`} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Like</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  
                  {/* Reply button */}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7"
                          onClick={handleReply}
                        >
                          <Reply className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Reply</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  
                  {/* Edit/Delete (only for own messages) */}
                  {isOwnMessage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-32">
                        <DropdownMenuItem onClick={handleEdit}>
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={handleDelete}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MessageCard;