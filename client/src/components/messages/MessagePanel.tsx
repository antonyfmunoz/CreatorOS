import { useState, useEffect } from 'react';
import { X, Send, ChevronLeft, Search, MessageSquare, User, Users, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore, useMessaging } from '@/lib/stores';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Avatar } from '@/components/ui/avatar';
import { AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { DirectMessage, Conversation, User as UserType } from '@/types';
import { formatDistanceToNow } from 'date-fns';
import { SheetClose, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Link } from 'wouter';

interface MessagePanelProps {
  onClose?: () => void;
}

const MessagePanel = () => {
  const { user } = useAuthStore();
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserType[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeTab, setActiveTab] = useState('conversations');
  const [groupName, setGroupName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<UserType[]>([]);
  const {
    conversations,
    messages,
    selectedConversation,
    isLoading,
    fetchConversations,
    fetchMessages,
    sendMessage,
    setSelectedConversation,
    markConversationAsRead,
    createConversation
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
    
    // Only search if query starts with @
    if (!trimmedQuery.startsWith('@')) {
      return;
    }
    
    const query = trimmedQuery.substring(1); // Remove @ prefix
    if (query.length < 2) {
      return; // Require at least 2 characters after @
    }
    
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

  const handleSendMessage = () => {
    if (newMessage.trim() && selectedConversation && user) {
      sendMessage(selectedConversation, user.id, newMessage);
      setNewMessage('');
    }
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
                      className="p-4 hover:bg-muted/50 cursor-pointer"
                      onClick={() => setSelectedConversation(conversation.id)}
                    >
                      <div className="flex items-center space-x-4">
                        <Avatar>
                          <AvatarFallback className={conversation.name ? "bg-primary text-primary-foreground" : ""}>
                            {getConversationName(conversation).charAt(0)}
                          </AvatarFallback>
                        </Avatar>
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
                    placeholder="Search with @username"
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Enter @ followed by username, e.g. @john
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
                  ) : searchQuery && searchQuery.startsWith('@') && searchQuery.length > 2 ? (
                    <div className="text-center py-4">
                      <p>No users found</p>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <Users className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
                      <p className="font-medium mb-1">Find people to chat with</p>
                      <p className="text-sm text-muted-foreground">
                        Search for users by typing @username
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
                      placeholder="Search with @username"
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
                      ) : searchQuery && searchQuery.startsWith('@') && searchQuery.length > 2 ? (
                        <div className="text-center py-3">
                          <p className="text-sm">No users found</p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  
                  <Button 
                    className="w-full mt-4"
                    disabled={!groupName.trim() || selectedUsers.length === 0}
                    onClick={handleCreateGroupChat}
                  >
                    Create Group
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
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