import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ChannelMessage as ChannelMessageType } from '@/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ThumbsUp, MessageSquare, Share2, Pin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface ChatMessageProps {
  message: ChannelMessageType;
  isPinned?: boolean;
}

const ChatMessage = ({ message, isPinned = false }: ChatMessageProps) => {
  const [isLiked, setIsLiked] = useState(false);
  const queryClient = useQueryClient();
  
  const likeMessageMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/channel-messages/${message.id}/like`, null);
      return res.json();
    },
    onSuccess: () => {
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
    if (!isLiked) {
      likeMessageMutation.mutate();
      setIsLiked(true);
    }
  };
  
  const handlePin = () => {
    pinMessageMutation.mutate();
  };
  
  const formattedTime = formatDistanceToNow(new Date(message.createdAt), { addSuffix: true });
  
  if (isPinned) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
        <div className="flex items-center mb-2">
          <Pin className="h-4 w-4 text-yellow-500 mr-1" />
          <span className="text-xs text-yellow-700">Pinned Message</span>
        </div>
        <div className="flex">
          <Avatar className="w-8 h-8 mr-2">
            <AvatarImage src={message.user.profileImageUrl} alt={message.user.displayName} />
            <AvatarFallback>{message.user.displayName.charAt(0)}</AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center">
              <span className="font-semibold text-sm">{message.user.displayName}</span>
              <span className="ml-2 text-xs text-gray-500">{message.user.role}</span>
            </div>
            <p className="text-sm">{message.content}</p>
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex mb-6">
      <Avatar className="w-10 h-10 rounded-full mr-3">
        <AvatarImage src={message.user.profileImageUrl} alt={message.user.displayName} />
        <AvatarFallback>{message.user.displayName.charAt(0)}</AvatarFallback>
      </Avatar>
      <div>
        <div className="flex items-center">
          <span className="font-semibold">{message.user.displayName}</span>
          <span className="ml-2 text-xs text-gray-500">{formattedTime}</span>
          <Badge variant="outline" className="ml-2 px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded text-xs">
            Lvl {message.user.level}
          </Badge>
        </div>
        <p className="mt-1">{message.content}</p>
        <div className="mt-2 flex space-x-2">
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-xs text-gray-500 flex items-center hover:bg-gray-100 rounded px-2 py-1 h-auto"
            onClick={handleLike}
          >
            <ThumbsUp className="h-4 w-4 mr-1" />
            {message.likes + (isLiked ? 1 : 0)}
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-xs text-gray-500 flex items-center hover:bg-gray-100 rounded px-2 py-1 h-auto"
          >
            <MessageSquare className="h-4 w-4 mr-1" />
            Reply
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-xs text-gray-500 flex items-center hover:bg-gray-100 rounded px-2 py-1 h-auto"
          >
            <Share2 className="h-4 w-4 mr-1" />
            Share
          </Button>
          {message.user.role === 'admin' && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-gray-500 flex items-center hover:bg-gray-100 rounded px-2 py-1 h-auto"
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
