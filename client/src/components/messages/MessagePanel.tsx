import { useState, useEffect, useRef } from 'react';
import { 
  X, Send, ChevronLeft, Search, MessageSquare, User, Users, Plus,
  MoreHorizontal, Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMessaging } from '@/lib/stores';
import { useAuth } from '@/hooks/use-auth';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Avatar } from '@/components/ui/avatar';
import { AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { DirectMessage, Conversation, User as UserType } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { SheetClose, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Link, useLocation } from 'wouter';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
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
import MessageCard from './MessageCard';

interface MessagePanelProps {
  onClose?: () => void;
}

const MessagePanel = () => {
  const { user } = useAuthStore();
  const [, setLocation] = useLocation();
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserType[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeTab, setActiveTab] = useState('conversations');
  const [groupName, setGroupName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<UserType[]>([]);
  const [conversationToDelete, setConversationToDelete] = useState<number | null>(null);
  const {
    conversations,
    messages,
    selectedConversation,
    isLoading,
    editingMessageId,
    replyingToMessage,
    fetchConversations,
    fetchMessages,
    sendMessage,
    editMessage,
    deleteMessage,
    deleteConversation,
    reactToMessage,
    setSelectedConversation,
    setEditingMessageId,
    setReplyingToMessage,
    markConversationAsRead,
    createConversation,
    closeMessagePanel
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
  
  // Handle user search with debounce
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }
    
    // Require at least 2 characters
    if (trimmedQuery.length < 2) {
      return;
    }
    
    const query = trimmedQuery;
    
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const response = await fetch(`/api/users?search=${encodeURIComponent(query)}`, {
          credentials: 'include'
        });
        
        if (!response.ok) {
          throw new Error(`Error searching users: ${response.status}`);
        }
        
        const data = await response.json();
        // Filter out current user
        if (Array.isArray(data)) {
          const filteredResults = data.filter((u: UserType) => u.id !== user?.id);
          setSearchResults(filteredResults);
        }
      } catch (error) {
        console.error('Error searching users:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    
    return () => clearTimeout(timer);
  }, [searchQuery, user?.id]);

  // Reference for scrolling to bottom
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  // When editing a message, prefill the input field
  useEffect(() => {
    if (editingMessageId) {
      const messageToEdit = messages.find(msg => msg.id === editingMessageId);
      if (messageToEdit) {
        setNewMessage(messageToEdit.content);
      }
    }
  }, [editingMessageId, messages]);
  
  const handleSendMessage = () => {
    if (newMessage.trim() && selectedConversation && user) {
      if (editingMessageId) {
        // If we're editing a message
        editMessage(editingMessageId, newMessage.trim());
        setEditingMessageId(null);
      } else {
        // If we're sending a new message (possibly a reply)
        const replyId = replyingToMessage ? replyingToMessage.id : null;
        sendMessage(selectedConversation, user.id, newMessage, replyId);
        setReplyingToMessage(null);
      }
      setNewMessage('');
    }
  };
  
  const cancelEditing = () => {
    setEditingMessageId(null);
    setNewMessage('');
  };
  
  const cancelReply = () => {
    setReplyingToMessage(null);
  };
  
  const handleStartConversation = async (targetUserId: number) => {
    if (!user) {
      console.error('Cannot start conversation: No authenticated user');
      return;
    }
    
    if (!targetUserId || typeof targetUserId !== 'number') {
      console.error('Cannot start conversation: Invalid target user ID', targetUserId);
      return;
    }
    
    console.log('Starting conversation with user ID:', targetUserId);
    console.log('Current user ID:', user.id);
    
    // Don't allow conversation with self
    if (targetUserId === user.id) {
      console.error('Cannot start conversation with yourself');
      return;
    }
    
    try {
      // Make sure the user IDs are correct and in the right order
      const userIds = [user.id, targetUserId].sort((a, b) => a - b); // Sort to ensure consistent order
      console.log('Creating conversation with userIds:', userIds);
      
      // Check if conversation already exists
      const existingConversation = conversations.find(
        conv => !conv.isGroup && conv.participants && 
        conv.participants.some(p => p.userId === targetUserId) && 
        conv.participants.some(p => p.userId === user.id)
      );
      
      if (existingConversation) {
        console.log('Conversation already exists, using existing:', existingConversation.id);
        setSelectedConversation(existingConversation.id);
      } else {
        // Create a new conversation with selected user
        const conversationId = await createConversation(userIds);
        console.log('Created new conversation with ID:', conversationId);
        
        // Select the newly created conversation
        setSelectedConversation(conversationId);
      }
      
      // Clear search results and query
      setSearchQuery('');
      setSearchResults([]);
      
      // Switch back to conversations tab
      setActiveTab('conversations');
    } catch (error) {
      console.error('Error starting conversation:', error);
      console.error('Error details:', error instanceof Error ? error.message : JSON.stringify(error));
    }
  };
  
  const handleAddUserToGroup = (selectedUser: UserType) => {
    // Check if user is already selected
    if (!selectedUsers.some(u => u.id === selectedUser.id)) {
      setSelectedUsers([...selectedUsers, selectedUser]);
    }
  };
  
  const handleRemoveUserFromGroup = (userId: number) => {
    setSelectedUsers(selectedUsers.filter(u => u.id !== userId));
  };
  
  const handleCreateGroupChat = async () => {
    if (!user || selectedUsers.length === 0 || !groupName.trim()) return;
    
    try {
      // Get user IDs including the current user
      const userIds = [user.id, ...selectedUsers.map(u => u.id)];
      
      // Create a new group conversation
      const conversationId = await createConversation(userIds, groupName.trim());
      
      // Select the newly created conversation
      setSelectedConversation(conversationId);
      
      // Reset group creation form
      setGroupName('');
      setSelectedUsers([]);
      setSearchQuery('');
      setSearchResults([]);
      
      // Switch back to conversations tab
      setActiveTab('conversations');
    } catch (error) {
      console.error('Error creating group chat:', error);
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
  
  // Get the other user ID for direct messages (for profile navigation)
  const getOtherUserIdForDM = (conversation: Conversation) => {
    if (conversation.name) return null; // Group chat, no direct user to navigate to
    
    const otherParticipant = conversation.participants?.find(
      p => p.userId !== user?.id
    );
    
    return otherParticipant?.userId || null;
  };

  // Handle confirming delete conversation
  const handleConfirmDelete = async () => {
    if (conversationToDelete !== null) {
      await deleteConversation(conversationToDelete);
      setConversationToDelete(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-background">
      {/* Delete conversation confirmation dialog */}
      <AlertDialog open={conversationToDelete !== null} onOpenChange={(open) => !open && setConversationToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Conversation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this conversation? This action cannot be undone.
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
              {(() => {
                const conversation = conversations.find(c => c.id === selectedConversation);
                if (!conversation) return 'Chat';
                
                const otherUserId = getOtherUserIdForDM(conversation);
                
                // Only make direct message names clickable (not group chats)
                return otherUserId ? (
                  <span 
                    className="cursor-pointer hover:text-primary hover:underline"
                    onClick={(e) => {
                      e.stopPropagation(); // Prevent triggering other click handlers
                      // Navigate to user profile using client-side routing
                      setLocation(`/profile/${otherUserId}`);
                    }}
                  >
                    {getConversationName(conversation)}
                  </span>
                ) : (
                  getConversationName(conversation)
                );
              })()}
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
              messages.map((message) => {
                const replyToMessage = message.replyToMessageId 
                  ? messages.find(m => m.id === message.replyToMessageId) 
                  : null;
                  
                return (
                  <MessageCard 
                    key={message.id}
                    message={message}
                    replyToMessage={replyToMessage}
                  />
                );
              })
            ) : (
              <div className="flex flex-col items-center justify-center p-8 text-center h-full">
                <p className="text-muted-foreground">No messages yet. Send the first message!</p>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        ) : (
          // Tabs for conversations and search
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="px-4 pt-2">
              <TabsList className="w-full">
                <TabsTrigger value="conversations" className="flex-1">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Conversations
                </TabsTrigger>
                <TabsTrigger value="search" className="flex-1">
                  <Search className="h-4 w-4 mr-2" />
                  Search
                </TabsTrigger>
                <TabsTrigger value="create-group" className="flex-1">
                  <Users className="h-4 w-4 mr-2" />
                  Group
                </TabsTrigger>
              </TabsList>
            </div>
            
            <TabsContent value="conversations" className="mt-0">
              <div className="divide-y">
                {conversations.length > 0 ? (
                  conversations.map((conversation) => (
                    <div 
                      key={conversation.id}
                      className="p-4 hover:bg-muted/50 cursor-pointer relative group"
                    >
                      {/* Three dot menu */}
                      <div className="absolute right-2 top-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-7 w-7 opacity-0 group-hover:opacity-100"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem 
                              className="text-destructive focus:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                setConversationToDelete(conversation.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      
                      <div 
                        className="flex items-center space-x-4"
                        onClick={() => setSelectedConversation(conversation.id)}
                      >
                        {(() => {
                          const otherUserId = getOtherUserIdForDM(conversation);
                          const otherParticipant = conversation.participants?.find(
                            p => p.userId !== user?.id
                          );
                          
                          return otherUserId ? (
                            <Avatar 
                              className="cursor-pointer"
                              onClick={(e) => {
                                e.stopPropagation(); // Don't trigger conversation selection
                                // Close the message panel first
                                closeMessagePanel();
                                // Navigate to user profile
                                setLocation(`/profile/${otherUserId}`);
                              }}
                            >
                              {otherParticipant?.user?.profileImageUrl && (
                                <AvatarImage src={otherParticipant.user.profileImageUrl} />
                              )}
                              <AvatarFallback>
                                {getConversationName(conversation).charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                          ) : (
                            <Avatar>
                              <AvatarFallback className="bg-primary text-primary-foreground">
                                {getConversationName(conversation).charAt(0)}
                              </AvatarFallback>
                            </Avatar>
                          );
                        })()}
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center">
                            <p className="font-medium truncate flex items-center">
                              {conversation.name && <Users className="h-3 w-3 mr-1 text-muted-foreground" />}
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
                              {conversation.lastMessage.senderId === user?.id ? 
                                "You: " : `${conversation.lastMessage.sender?.displayName.split(' ')[0] || 'User'}: `}
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
                  <div className="flex flex-col items-center justify-center p-8 text-center">
                    <p className="font-medium mb-1">No conversations yet</p>
                    <p className="text-muted-foreground text-sm">
                      Search for users to start chatting
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>
            
            <TabsContent value="search" className="mt-0">
              <div className="p-4">
                <div className="mb-4">
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by username"
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Enter a username to search, e.g. john
                  </p>
                </div>
                
                <div className="space-y-2">
                  {isSearching ? (
                    <div className="flex justify-center py-4">
                      <p>Searching...</p>
                    </div>
                  ) : searchResults.length > 0 ? (
                    <div className="divide-y">
                      {searchResults.map((user) => (
                        <div 
                          key={user.id}
                          className="py-3 px-2 hover:bg-muted/50 flex items-center space-x-3 justify-between"
                        >
                          <div className="flex items-center space-x-3 flex-1">
                            <Link href={`/profile/${user.id}`}>
                              <Avatar className="cursor-pointer">
                                <AvatarImage src={user.profileImageUrl || undefined} />
                                <AvatarFallback>{user.displayName.charAt(0)}</AvatarFallback>
                              </Avatar>
                            </Link>
                            <Link href={`/profile/${user.id}`} className="flex-1">
                              <div className="cursor-pointer">
                                <p className="font-medium">{user.displayName}</p>
                                <p className="text-sm text-muted-foreground">@{user.username}</p>
                              </div>
                            </Link>
                          </div>
                          <Button 
                            variant="secondary" 
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              console.log('Message button clicked for user:', user);
                              // Call handleStartConversation with the user ID from search results
                              handleStartConversation(user.id);
                            }}
                          >
                            <MessageSquare className="h-4 w-4 mr-1" />
                            Message
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : searchQuery && searchQuery.length > 1 ? (
                    <div className="text-center py-4">
                      <p>No users found</p>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <Users className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
                      <p className="font-medium mb-1">Find people to chat with</p>
                      <p className="text-sm text-muted-foreground">
                        Search for users by typing their username
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="create-group" className="mt-0">
              <div className="p-4">
                <h3 className="font-medium mb-4">Create Group Chat</h3>
                
                <div className="space-y-4">
                  <div>
                    <label htmlFor="group-name" className="text-sm font-medium">
                      Group Name
                    </label>
                    <Input
                      id="group-name"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      placeholder="Enter group name"
                      className="w-full mt-1"
                    />
                  </div>
                  
                  {/* Selected users */}
                  {selectedUsers.length > 0 && (
                    <div>
                      <label className="text-sm font-medium block mb-2">
                        Selected Users ({selectedUsers.length})
                      </label>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {selectedUsers.map((user) => (
                          <div 
                            key={user.id}
                            className="bg-muted flex items-center rounded-full px-3 py-1 text-sm"
                          >
                            <span className="mr-1">{user.displayName}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={() => handleRemoveUserFromGroup(user.id)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <div>
                    <label className="text-sm font-medium block mb-2">
                      Add Members
                    </label>
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by username"
                      className="w-full mb-2"
                    />
                    
                    {/* Search results for group creation */}
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {isSearching ? (
                        <div className="flex justify-center py-3">
                          <p className="text-sm">Searching...</p>
                        </div>
                      ) : searchResults.length > 0 ? (
                        <div className="divide-y">
                          {searchResults
                            .filter(u => !selectedUsers.some(selected => selected.id === u.id))
                            .map((user) => (
                              <div 
                                key={user.id}
                                className="py-2 px-2 hover:bg-muted/50 flex items-center space-x-3 justify-between cursor-pointer"
                                onClick={() => handleAddUserToGroup(user)}
                              >
                                <div className="flex items-center space-x-3 flex-1">
                                  <Avatar className="h-7 w-7">
                                    <AvatarImage src={user.profileImageUrl || undefined} />
                                    <AvatarFallback>{user.displayName.charAt(0)}</AvatarFallback>
                                  </Avatar>
                                  <div className="flex-1">
                                    <p className="font-medium text-sm">{user.displayName}</p>
                                    <p className="text-xs text-muted-foreground">@{user.username}</p>
                                  </div>
                                </div>
                                <Plus className="h-4 w-4 text-muted-foreground" />
                              </div>
                            ))}
                        </div>
                      ) : searchQuery && searchQuery.length > 1 ? (
                        <div className="text-center py-3">
                          <p className="text-sm">No users found</p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  
                  <Button 
                    className="w-full"
                    disabled={selectedUsers.length === 0 || !groupName.trim()}
                    onClick={handleCreateGroupChat}
                  >
                    Create Group Chat
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </ScrollArea>
      
      {/* Input area for sending messages */}
      {selectedConversation && (
        <div className="p-4 border-t">
          <div className="relative">
            {/* Reply indicator */}
            {replyingToMessage && (
              <div className="mb-2 bg-muted/50 p-2 rounded-md flex items-center justify-between">
                <div className="flex-1 truncate">
                  <span className="text-xs font-medium">
                    Replying to {replyingToMessage.senderId === user?.id ? 'yourself' : replyingToMessage.sender?.displayName}
                  </span>
                  <p className="text-xs text-muted-foreground truncate">{replyingToMessage.content}</p>
                </div>
                <Button variant="ghost" size="sm" className="h-6 px-2" onClick={cancelReply}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
            
            {/* Editing indicator */}
            {editingMessageId && (
              <div className="mb-2 bg-muted/50 p-2 rounded-md flex items-center justify-between">
                <span className="text-xs font-medium">Editing message</span>
                <Button variant="ghost" size="sm" className="h-6 px-2" onClick={cancelEditing}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
            
            <div className="flex items-center gap-2">
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={editingMessageId ? "Edit your message..." : "Type a message..."}
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
              />
              <Button 
                type="submit" 
                size="icon"
                disabled={!newMessage.trim()}
                onClick={handleSendMessage}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MessagePanel;