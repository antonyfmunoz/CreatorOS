import { useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ChannelMessage as ChannelMessageType } from '@/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ThumbsUp, Pin, Reply } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface ChatMessageProps {
  message: ChannelMessageType;
  isPinned?: boolean;
  isReply?: boolean;
  canPin?: boolean;
  onReply?: (message: ChannelMessageType) => void;
}

const ChatMessage = ({ message, isPinned = false, isReply = false, canPin = false, onReply }: ChatMessageProps) => {
  const [isLiked, setIsLiked] = useState(Boolean(message.likedByCurrentUser));
  const queryClient = useQueryClient();

  useEffect(() => setIsLiked(Boolean(message.likedByCurrentUser)), [message.likedByCurrentUser]);
  
  const likeMessageMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/channel-messages/${message.id}/like`, null);
      return res.json();
    },
    onSuccess: (result: { liked: boolean }) => {
      setIsLiked(result.liked);
      queryClient.invalidateQueries({ queryKey: ['/api/channels', message.channelId, 'messages'] });
    },
  });
  
  const pinMessageMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/channel-messages/${message.id}/pin`, null);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/channels', message.channelId, 'messages'] });
    },
  });
  
  const handleLike = () => {
    if (!likeMessageMutation.isPending) likeMessageMutation.mutate();
  };
  
  const handlePin = () => {
    pinMessageMutation.mutate();
  };
  
  const formattedTime = formatDistanceToNow(new Date(message.createdAt), { addSuffix: true });
  
  if (isPinned) {
    return (
      <div className="mb-4 rounded-xl border border-zinc-700 bg-zinc-900 p-3 text-white">
        <div className="flex items-center mb-2">
          <Pin className="mr-1 h-4 w-4 text-white" />
          <span className="text-xs text-zinc-300">Pinned Message</span>
        </div>
        <div className="flex">
          <Avatar className="w-8 h-8 mr-2">
            <AvatarImage src={message.user.profileImageUrl ?? undefined} alt={message.user.displayName} />
            <AvatarFallback>{message.user.displayName.charAt(0)}</AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center">
              <span className="font-semibold text-sm">{message.user.displayName}</span>
              <span className="ml-2 text-xs text-zinc-500">{message.user.role}</span>
            </div>
            <p className="text-sm">{message.content}</p>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className={`flex ${isReply ? "mb-4 border-l border-zinc-800 pl-4" : "mb-6"}`}>
      <Avatar className="w-10 h-10 rounded-full mr-3">
        <AvatarImage src={message.user.profileImageUrl ?? undefined} alt={message.user.displayName} />
        <AvatarFallback>{message.user.displayName.charAt(0)}</AvatarFallback>
      </Avatar>
      <div>
        <div className="flex items-center">
          <span className="font-semibold">{message.user.displayName}</span>
          <span className="ml-2 text-xs text-zinc-500">{formattedTime}</span>
          <Badge variant="outline" className="ml-2 rounded border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-xs text-zinc-400">
            Lvl {message.user.level}
          </Badge>
        </div>
        <p className="mt-1">{message.content}</p>
        <div className="mt-2 flex space-x-2">
          <Button 
            variant="ghost" 
            size="sm" 
            className={`flex h-auto items-center rounded px-2 py-1 text-xs hover:bg-zinc-900 hover:text-white ${isLiked ? 'bg-zinc-800 text-white' : 'text-zinc-500'}`}
            onClick={handleLike}
            disabled={likeMessageMutation.isPending}
          >
            <ThumbsUp className="h-4 w-4 mr-1" />
            {message.likes}
          </Button>
          {!isReply && onReply && (
            <Button
              variant="ghost"
              size="sm"
              className="flex h-auto items-center rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-900 hover:text-white"
              onClick={() => onReply(message)}
            >
              <Reply className="mr-1 h-4 w-4" /> Reply
            </Button>
          )}
          {canPin && (
            <Button
              variant="ghost"
              size="sm"
              className="flex h-auto items-center rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-900 hover:text-white"
              onClick={handlePin}
            >
              <Pin className="h-4 w-4 mr-1" />
              {message.isPinned ? 'Unpin' : 'Pin'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;
