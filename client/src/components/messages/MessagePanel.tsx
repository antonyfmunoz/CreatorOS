import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  X, 
  Send, 
  Search,
  MoreVertical, 
  ChevronLeft,
  User as UserIcon
} from 'lucide-react';
import { 
  Button,
  Avatar,
  Input, 
  AvatarFallback, 
  AvatarImage,
  Separator,
  Textarea,
} from '@/components/ui';
import { formatDistanceToNow } from 'date-fns';
import { Conversation, ConversationParticipant, DirectMessage, User } from '@/types';
import { getInitials } from '@/lib/utils';
import { useAuthStore } from '@/lib/stores';
import { ScrollArea } from '@/components/ui/scroll-area';

interface MessagePanelProps {
  onClose?: () => void;
}

const MessagePanel = ({ onClose }: MessagePanelProps) => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const messageEndRef = useRef<HTMLDivElement>(null);
  const [messageInput, setMessageInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedConversation, setSelectedConversation] = useState<number | null>(null);
  const [isComposing, setIsComposing] = useState(false);
  const [newMessageRecipient, setNewMessageRecipient] = useState<number | null>(null);
  
  // Get conversations
  const { data: conversations, isLoading: conversationsLoading } = useQuery({
    queryKey: ['/api/conversations', user?.id],
    queryFn: async () => {
      if (!user) return [];
      
      try {
        const response = await fetch(`/api/users/${user.id}/conversations`);
        if (!response.ok) {
          throw new Error('Failed to fetch conversations');
        }
        return response.json();
      } catch (error) {
        console.error('Error fetching conversations:', error);
        return [];
      }
    },
    enabled: !!user,
  });
  
  // Get messages for the selected conversation
  const { data: messages, isLoading: messagesLoading } = useQuery({
    queryKey: ['/api/messages', selectedConversation],
    queryFn: async () => {
      if (!selectedConversation) return [];
      
      try {
        const response = await fetch(`/api/conversations/${selectedConversation}/messages`);
        if (!response.ok) {
          throw new Error('Failed to fetch messages');
        }
        return response.json();
      } catch (error) {
        console.error('Error fetching messages:', error);
        return [];
      }
    },
    enabled: !!selectedConversation,
  });
  
  // Get users for new message
  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['/api/users'],
    queryFn: async () => {
      try {
        const response = await fetch('/api/users');
        if (!response.ok) {
          throw new Error('Failed to fetch users');
        }
        return response.json();
      } catch (error) {
        console.error('Error fetching users:', error);
        return [];
      }
    },
  });
  
  // Create a new conversation
  const createConversation = useMutation({
    mutationFn: async (recipientId: number) => {
      if (!user) throw new Error('User not authenticated');
      
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          participantIds: [user.id, recipientId],
          isGroup: false,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create conversation');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/conversations', user?.id] });
      setSelectedConversation(data.id);
      setIsComposing(false);
    },
  });
  
  // Send a message
  const sendMessage = useMutation({
    mutationFn: async (message: string) => {
      if (!user || !selectedConversation) 
        throw new Error('Cannot send message');
      
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversationId: selectedConversation,
          senderId: user.id,
          content: message,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to send message');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/messages', selectedConversation] });
      setMessageInput('');
    },
  });
  
  // Mark messages as read
  const markAsRead = useMutation({
    mutationFn: async () => {
      if (!user || !selectedConversation) return;
      
      const response = await fetch(`/api/conversations/${selectedConversation}/read`, {
        method: 'PATCH',
      });
      
      if (!response.ok) {
        throw new Error('Failed to mark messages as read');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/messages/unread-count', user?.id] });
    },
  });
  
  // Effect to scroll to bottom of messages
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  // Effect to mark messages as read when conversation is selected
  useEffect(() => {
    if (selectedConversation && user) {
      markAsRead.mutate();
      
      // Get the latest messages every few seconds
      const interval = setInterval(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/messages', selectedConversation] });
      }, 5000);
      
      return () => clearInterval(interval);
    }
  }, [selectedConversation, user]);
  
  // Handle sending a message
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim()) return;
    
    if (isComposing && newMessageRecipient) {
      createConversation.mutate(newMessageRecipient);
    } else if (selectedConversation) {
      sendMessage.mutate(messageInput);
    }
  };
  
  // Filter conversations based on search
  const filteredConversations = conversations
    ? conversations.filter((c: Conversation) => {
        if (!searchQuery) return true;
        
        // If it's a group conversation, search by the group name
        if (c.isGroup && c.name) {
          return c.name.toLowerCase().includes(searchQuery.toLowerCase());
        }
        
        // Otherwise, search by the other participant's name
        const otherParticipant = c.participants?.find(
          (p: ConversationParticipant) => p.userId !== user?.id
        )?.user;
        
        return otherParticipant?.displayName.toLowerCase().includes(searchQuery.toLowerCase());
      })
    : [];
  
  // Get the conversation title
  const getConversationTitle = (conversation: Conversation) => {
    if (conversation.isGroup) return conversation.name || 'Group Chat';
    
    const otherParticipant = conversation.participants?.find(
      (p: ConversationParticipant) => p.userId !== user?.id
    )?.user;
    
    return otherParticipant?.displayName || 'Chat';
  };
  
  // Get the conversation avatar
  const getConversationAvatar = (conversation: Conversation) => {
    if (conversation.isGroup) return conversation.icon || null;
    
    const otherParticipant = conversation.participants?.find(
      (p: ConversationParticipant) => p.userId !== user?.id
    )?.user;
    
    return otherParticipant?.profileImageUrl || null;
  };

  // Get the conversation initials
  const getConversationInitials = (conversation: Conversation) => {
    if (conversation.isGroup) return conversation.name ? getInitials(conversation.name) : 'GC';
    
    const otherParticipant = conversation.participants?.find(
      (p: ConversationParticipant) => p.userId !== user?.id
    )?.user;
    
    return otherParticipant?.displayName ? getInitials(otherParticipant.displayName) : '?';
  };
  
  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between">
        {selectedConversation || isComposing ? (
          <>
            <Button variant="ghost" size="icon" onClick={() => {
              setSelectedConversation(null);
              setIsComposing(false);
            }}>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h2 className="font-semibold">
              {isComposing ? 'New Message' : (
                conversations?.find((c: Conversation) => c.id === selectedConversation)
                  ? getConversationTitle(conversations.find((c: Conversation) => c.id === selectedConversation))
                  : 'Chat'
              )}
            </h2>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </>
        ) : (
          <>
            <h2 className="font-semibold text-lg">Messages</h2>
            <div className="flex gap-2">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setIsComposing(true)}
              >
                <Send className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-5 w-5" />
              </Button>
            </div>
          </>
        )}
      </div>
      
      {/* Main content */}
      {selectedConversation ? (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Messages */}
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {messagesLoading ? (
                <div className="text-center text-gray-500">Loading messages...</div>
              ) : messages && messages.length > 0 ? (
                messages.map((message: DirectMessage) => (
                  <div
                    key={message.id}
                    className={`flex ${
                      message.senderId === user?.id ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <div
                      className={`max-w-[75%] rounded-lg px-4 py-2 ${
                        message.senderId === user?.id
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-200 text-gray-800'
                      }`}
                    >
                      <p>{message.content}</p>
                      <p className={`text-xs mt-1 ${
                        message.senderId === user?.id
                          ? 'text-blue-100'
                          : 'text-gray-500'
                      }`}>
                        {formatDistanceToNow(new Date(message.sentAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-gray-500">No messages yet</div>
              )}
              <div ref={messageEndRef} />
            </div>
          </ScrollArea>
          
          {/* Message input */}
          <div className="p-4 border-t">
            <form onSubmit={handleSendMessage} className="flex items-end gap-2">
              <Textarea
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 resize-none"
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage(e);
                  }
                }}
              />
              <Button type="submit" size="icon" disabled={!messageInput.trim()}>
                <Send className="h-5 w-5" />
              </Button>
            </form>
          </div>
        </div>
      ) : isComposing ? (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* User selection */}
          <div className="p-4 border-b">
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="mb-4"
              prefix={<Search className="h-4 w-4 text-gray-400" />}
            />
          </div>
          
          <ScrollArea className="flex-1">
            <div className="p-1">
              {usersLoading ? (
                <div className="text-center text-gray-500 p-4">Loading users...</div>
              ) : (
                users
                  ?.filter((u: User) => 
                    u.id !== user?.id && 
                    u.displayName.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  .map((u: User) => (
                    <Button
                      key={u.id}
                      variant="ghost"
                      className="w-full justify-start p-3 h-auto"
                      onClick={() => {
                        setNewMessageRecipient(u.id);
                        setSelectedConversation(null);
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar>
                          <AvatarImage src={u.profileImageUrl} />
                          <AvatarFallback>{getInitials(u.displayName)}</AvatarFallback>
                        </Avatar>
                        <div className="text-left">
                          <div className="font-medium">{u.displayName}</div>
                          <div className="text-sm text-gray-500">@{u.username}</div>
                        </div>
                      </div>
                    </Button>
                  ))
              )}
            </div>
          </ScrollArea>
          
          {newMessageRecipient && (
            <div className="p-4 border-t">
              <form onSubmit={handleSendMessage} className="flex items-end gap-2">
                <Textarea
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 resize-none"
                  rows={1}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage(e);
                    }
                  }}
                />
                <Button type="submit" size="icon" disabled={!messageInput.trim()}>
                  <Send className="h-5 w-5" />
                </Button>
              </form>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Search */}
          <div className="p-4 border-b">
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              prefix={<Search className="h-4 w-4 text-gray-400" />}
            />
          </div>
          
          {/* Conversations list */}
          <ScrollArea className="flex-1">
            <div className="p-1">
              {conversationsLoading ? (
                <div className="text-center text-gray-500 p-4">Loading conversations...</div>
              ) : filteredConversations && filteredConversations.length > 0 ? (
                filteredConversations.map((conversation: Conversation) => (
                  <Button
                    key={conversation.id}
                    variant="ghost"
                    className="w-full justify-start p-3 h-auto"
                    onClick={() => {
                      setSelectedConversation(conversation.id);
                      setIsComposing(false);
                    }}
                  >
                    <div className="flex items-center gap-3 w-full">
                      <Avatar>
                        <AvatarImage src={getConversationAvatar(conversation)} />
                        <AvatarFallback>{getConversationInitials(conversation)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 text-left">
                        <div className="font-medium">{getConversationTitle(conversation)}</div>
                        <div className="text-sm text-gray-500 truncate">
                          {conversation.lastMessage?.content || 'No messages yet'}
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        {conversation.lastMessage?.sentAt && (
                          <div className="text-xs text-gray-500">
                            {formatDistanceToNow(new Date(conversation.lastMessage.sentAt), { addSuffix: true })}
                          </div>
                        )}
                        {conversation.unreadCount > 0 && (
                          <div className="bg-blue-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center mt-1">
                            {conversation.unreadCount}
                          </div>
                        )}
                      </div>
                    </div>
                  </Button>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center text-gray-500">
                  <UserIcon className="h-12 w-12 mb-4 text-gray-300" />
                  <p className="font-medium mb-1">No conversations yet</p>
                  <p className="text-sm">Start a new message to connect with creators</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
};

export default MessagePanel;