import { useState, useEffect } from 'react';
import { X, Send, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore, useMessaging } from '@/lib/stores';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Avatar } from '@/components/ui/avatar';
import { AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { DirectMessage, Conversation } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { SheetClose, SheetTitle } from '@/components/ui/sheet';

interface MessagePanelProps {
  onClose?: () => void;
}

const MessagePanel = ({ onClose }: MessagePanelProps) => {
  const { user } = useAuthStore();
  const [newMessage, setNewMessage] = useState('');
  const {
    conversations,
    messages,
    selectedConversation,
    isLoading,
    fetchConversations,
    fetchMessages,
    sendMessage,
    setSelectedConversation,
    markConversationAsRead
  } = useMessaging();

  // Fetch conversations when component mounts
  useEffect(() => {
    if (user) {
      fetchConversations(user.id);
    }
  }, [user, fetchConversations]);

  // Fetch messages when selected conversation changes
  useEffect(() => {
    if (selectedConversation) {
      fetchMessages(selectedConversation);
      markConversationAsRead(selectedConversation);
    }
  }, [selectedConversation, fetchMessages, markConversationAsRead]);

  const handleSendMessage = () => {
    if (newMessage.trim() && selectedConversation && user) {
      sendMessage(selectedConversation, user.id, newMessage);
      setNewMessage('');
    }
  };

  const getConversationName = (conversation: Conversation) => {
    if (conversation.name) return conversation.name;
    
    // For direct messages, show the other user's name
    const otherParticipant = conversation.participants?.find(
      p => p.userId !== user?.id
    );
    
    return otherParticipant?.user?.displayName || 'Unknown User';
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between">
        {selectedConversation ? (
          <>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setSelectedConversation(null)}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <SheetTitle className="font-semibold">
              {conversations.find(c => c.id === selectedConversation)
                ? getConversationName(conversations.find(c => c.id === selectedConversation)!)
                : 'Chat'}
            </SheetTitle>
            <SheetClose asChild>
              <Button variant="ghost" size="icon">
                <X className="h-5 w-5" />
              </Button>
            </SheetClose>
          </>
        ) : (
          <>
            <SheetTitle className="font-semibold text-lg">Messages</SheetTitle>
            <SheetClose asChild>
              <Button variant="ghost" size="icon">
                <X className="h-5 w-5" />
              </Button>
            </SheetClose>
          </>
        )}
      </div>
      
      {/* Content */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex justify-center items-center h-full p-4">
            <p>Loading...</p>
          </div>
        ) : selectedConversation ? (
          // Message view
          <div className="flex flex-col p-4 space-y-4">
            {messages.length > 0 ? (
              messages.map((message) => (
                <div 
                  key={message.id}
                  className={`flex ${message.senderId === user?.id ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`flex ${message.senderId === user?.id ? 'flex-row-reverse' : 'flex-row'} max-w-[80%] gap-2`}>
                    {message.senderId !== user?.id && (
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={message.sender?.profileImageUrl} />
                        <AvatarFallback>{message.sender?.displayName.charAt(0)}</AvatarFallback>
                      </Avatar>
                    )}
                    <div 
                      className={`rounded-lg p-3 ${
                        message.senderId === user?.id 
                          ? 'bg-primary text-primary-foreground' 
                          : 'bg-muted'
                      }`}
                    >
                      <p>{message.content}</p>
                      <p className={`text-xs ${message.senderId === user?.id ? 'text-primary-foreground/70' : 'text-muted-foreground'} mt-1`}>
                        {formatDistanceToNow(new Date(message.sentAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center p-8 text-center h-full">
                <p className="text-muted-foreground">No messages yet. Send the first message!</p>
              </div>
            )}
          </div>
        ) : (
          // Conversation list view
          <div className="divide-y">
            {conversations.length > 0 ? (
              conversations.map((conversation) => (
                <div 
                  key={conversation.id}
                  className="p-4 hover:bg-muted/50 cursor-pointer"
                  onClick={() => setSelectedConversation(conversation.id)}
                >
                  <div className="flex items-center space-x-4">
                    <Avatar>
                      <AvatarFallback>
                        {getConversationName(conversation).charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between">
                        <p className="font-medium truncate">
                          {getConversationName(conversation)}
                        </p>
                        {conversation.lastMessage && (
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(conversation.lastMessage.sentAt), { addSuffix: true })}
                          </p>
                        )}
                      </div>
                      {conversation.lastMessage && (
                        <p className="text-sm text-muted-foreground truncate">
                          {conversation.lastMessage.content}
                        </p>
                      )}
                    </div>
                    {conversation.unreadCount && conversation.unreadCount > 0 && (
                      <div className="bg-primary text-primary-foreground rounded-full h-5 min-w-5 flex items-center justify-center px-1 text-xs font-medium">
                        {conversation.unreadCount}
                      </div>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center p-8 text-center h-full">
                <p className="font-medium mb-1">No conversations yet</p>
                <p className="text-muted-foreground text-sm">
                  Start a new conversation from user profiles
                </p>
              </div>
            )}
          </div>
        )}
      </ScrollArea>
      
      {/* Message input */}
      {selectedConversation && (
        <div className="p-4 border-t">
          <div className="flex space-x-2">
            <Input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
            />
            <Button 
              size="icon" 
              onClick={handleSendMessage}
              disabled={!newMessage.trim()}
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MessagePanel;