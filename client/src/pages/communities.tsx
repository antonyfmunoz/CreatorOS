import { useQuery } from "@tanstack/react-query";
import { useCommunitiesStore } from "@/lib/stores";
import { 
  Channel as ChannelType, 
  Community as CommunityType, 
  ChannelMessage as ChannelMessageType 
} from "@/types";
import { Search, Bell, MoreHorizontal, Hash, Send, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import ChannelSidebar from "@/components/communities/ChannelSidebar";
import ChatMessage from "@/components/communities/ChatMessage";
import { useState } from "react";
import { 
  Sheet, 
  SheetContent, 
  SheetTrigger 
} from "@/components/ui/sheet";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/lib/stores";

const Communities = () => {
  const { activeCommunityId, activeChannelId } = useCommunitiesStore();
  const { currentUser } = useAppStore();
  const queryClient = useQueryClient();
  const [messageInput, setMessageInput] = useState("");
  
  const { data: community, isLoading: isLoadingCommunity } = useQuery<CommunityType>({
    queryKey: ['/api/communities', activeCommunityId],
    enabled: activeCommunityId !== null,
  });
  
  const { data: channels, isLoading: isLoadingChannels } = useQuery<ChannelType[]>({
    queryKey: ['/api/communities', activeCommunityId, 'channels'],
    enabled: activeCommunityId !== null,
  });
  
  const { data: activeChannel } = useQuery<ChannelType>({
    queryKey: ['/api/channels', activeChannelId],
    enabled: activeChannelId !== null,
  });
  
  const { data: messages, isLoading: isLoadingMessages } = useQuery<ChannelMessageType[]>({
    queryKey: ['/api/channels', activeChannelId, 'messages'],
    enabled: activeChannelId !== null,
  });
  
  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser || !activeChannelId) throw new Error('Not ready to send message');
      
      const message = {
        channelId: activeChannelId,
        userId: currentUser.id,
        content: messageInput,
        isPinned: false,
      };
      
      const res = await apiRequest('POST', '/api/channel-messages', message);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/channels', activeChannelId, 'messages'] });
      setMessageInput("");
    },
  });
  
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (messageInput.trim() && !sendMessageMutation.isPending) {
      sendMessageMutation.mutate();
    }
  };
  
  // Find pinned messages
  const pinnedMessages = messages?.filter(msg => msg.isPinned) || [];
  
  return (
    <div className="flex h-screen pb-16">
      {/* Mobile sidebar using Sheet component */}
      <Sheet>
        <SheetTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon" 
            className="md:hidden absolute left-4 top-4 z-10"
          >
            <Menu className="h-6 w-6" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 bg-gray-800 text-white w-4/5">
          <div className="p-4">
            <h2 className="text-xl font-bold mb-6">Communities</h2>
            {/* Same content as ChannelSidebar but formatted for mobile */}
            {/* This is intentionally simplified for this example */}
          </div>
        </SheetContent>
      </Sheet>
      
      {/* Desktop Sidebar */}
      <ChannelSidebar />
      
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Top Bar */}
        <div className="p-4 border-b border-gray-200 flex items-center">
          <div className="md:hidden w-6"></div> {/* Spacer for mobile */}
          <h2 className="text-lg font-semibold ml-2 md:ml-0">
            {activeChannel ? `#${activeChannel.name}` : 'Select a channel'}
          </h2>
          <div className="ml-auto flex space-x-2">
            <Button variant="ghost" size="icon" className="rounded-full">
              <Search className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" className="rounded-full">
              <Bell className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" className="rounded-full">
              <MoreHorizontal className="h-5 w-5" />
            </Button>
          </div>
        </div>
        
        {/* Channel List */}
        {channels && channels.length > 0 && (
          <div className="p-4 border-b border-gray-200">
            <div className="flex overflow-x-auto scrollbar-hide space-x-4">
              {isLoadingChannels ? (
                Array(5).fill(0).map((_, i) => (
                  <Skeleton key={i} className="w-24 h-8 rounded-full" />
                ))
              ) : (
                channels.map(channel => (
                  <Button
                    key={channel.id}
                    variant={channel.id === activeChannelId ? "default" : "outline"}
                    className="px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap"
                    onClick={() => useCommunitiesStore.getState().setActiveChannel(channel.id)}
                  >
                    <Hash className="h-4 w-4 mr-1" />
                    {channel.name}
                  </Button>
                ))
              )}
            </div>
          </div>
        )}
        
        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Day Divider */}
          <div className="flex items-center">
            <div className="flex-1 border-t border-gray-200"></div>
            <span className="px-2 text-sm text-gray-500">Today</span>
            <div className="flex-1 border-t border-gray-200"></div>
          </div>
          
          {/* Pinned Messages */}
          {pinnedMessages.map(message => (
            <ChatMessage key={`pinned-${message.id}`} message={message} isPinned={true} />
          ))}
          
          {/* Messages */}
          {isLoadingMessages ? (
            Array(3).fill(0).map((_, i) => (
              <div key={i} className="flex mb-6">
                <Skeleton className="w-10 h-10 rounded-full mr-3" />
                <div className="flex-1">
                  <Skeleton className="h-5 w-40 mb-2" />
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-3/4 mb-2" />
                  <div className="flex space-x-2 mt-2">
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="h-8 w-16" />
                  </div>
                </div>
              </div>
            ))
          ) : (
            messages?.map(message => (
              <ChatMessage key={message.id} message={message} />
            ))
          )}
          
          {messages?.length === 0 && !isLoadingMessages && (
            <div className="text-center py-10">
              <p className="text-gray-500">No messages yet. Start the conversation!</p>
            </div>
          )}
        </div>
        
        {/* Message Input */}
        <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-200">
          <div className="flex">
            <div className="flex-1 bg-gray-100 rounded-lg flex items-center p-2">
              <Button type="button" variant="ghost" size="icon" className="p-1 text-gray-500">
                <Plus className="h-5 w-5" />
              </Button>
              <Input
                type="text"
                placeholder={`Message ${activeChannel ? `#${activeChannel.name}` : 'channel'}`}
                className="flex-1 bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                disabled={!activeChannelId || !currentUser}
              />
              <Button type="button" variant="ghost" size="icon" className="p-1 text-gray-500">
                <Smile className="h-5 w-5" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="p-1 text-gray-500">
                <Image className="h-5 w-5" />
              </Button>
            </div>
            <Button 
              type="submit" 
              className="ml-2 p-2 rounded-lg" 
              size="icon"
              disabled={!messageInput.trim() || sendMessageMutation.isPending || !activeChannelId || !currentUser}
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Missing imports from the code above
import { Plus, Smile, Image } from 'lucide-react';

export default Communities;
