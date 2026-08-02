import { useQuery } from "@tanstack/react-query";
import { useCommunitiesStore } from "@/lib/stores";
import { 
  Channel as ChannelType, 
  Community as CommunityType, 
  ChannelMessage as ChannelMessageType 
} from "@/types";
import { Search, Bell, MoreHorizontal, Hash, Send, Menu, Check, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import ChannelSidebar from "@/components/communities/ChannelSidebar";
import ChatMessage from "@/components/communities/ChatMessage";
import { useEffect, useState } from "react";
import { 
  Sheet, 
  SheetContent, 
  SheetTrigger 
} from "@/components/ui/sheet";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/lib/stores";
import { useRoute } from "wouter";

const Communities = () => {
  const { activeCommunityId, activeChannelId, setActiveCommunity } = useCommunitiesStore();
  const [, routeParams] = useRoute("/communities/:id");
  const { currentUser } = useAppStore();
  const queryClient = useQueryClient();
  const [messageInput, setMessageInput] = useState("");

  // A marketplace card can open its selected community directly, while the
  // sidebar remains the source of truth for later in-community navigation.
  useEffect(() => {
    const requestedId = Number(routeParams?.id);
    if (Number.isInteger(requestedId) && requestedId > 0 && requestedId !== activeCommunityId) {
      setActiveCommunity(requestedId);
    }
  }, [activeCommunityId, routeParams?.id, setActiveCommunity]);
  
  const { data: community, isLoading: isLoadingCommunity } = useQuery<CommunityType>({
    queryKey: ['/api/communities', activeCommunityId],
    enabled: activeCommunityId !== null,
    queryFn: async () => {
      const response = await fetch(`/api/communities/${activeCommunityId}`);
      if (!response.ok) throw new Error("Failed to load community");
      return response.json();
    },
  });
  
  const { data: channels, isLoading: isLoadingChannels } = useQuery<ChannelType[]>({
    queryKey: ['/api/communities', activeCommunityId, 'channels'],
    enabled: activeCommunityId !== null,
    queryFn: async () => {
      const response = await fetch(`/api/communities/${activeCommunityId}/channels`);
      if (!response.ok) throw new Error("Failed to load channels");
      return response.json();
    },
  });

  const activeChannel = channels?.find(channel => channel.id === activeChannelId);
  const { data: membership, isLoading: isLoadingMembership } = useQuery<{ isMember: boolean }>({
    queryKey: ['/api/communities', activeCommunityId, 'membership'],
    enabled: activeCommunityId !== null,
    queryFn: async () => {
      const response = await fetch(`/api/communities/${activeCommunityId}/membership`);
      if (!response.ok) throw new Error("Failed to load community membership");
      return response.json();
    },
  });
  const isMember = membership?.isMember === true;

  useEffect(() => {
    if (channels?.length && activeChannelId === null) {
      useCommunitiesStore.getState().setActiveChannel(channels[0].id);
    }
  }, [activeChannelId, channels]);

  const joinCommunityMutation = useMutation({
    mutationFn: async () => {
      if (!activeCommunityId) throw new Error("Choose a community first");
      const response = await apiRequest('POST', `/api/communities/${activeCommunityId}/join`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/communities', activeCommunityId, 'membership'] });
    },
  });
  
  const { data: messages, isLoading: isLoadingMessages } = useQuery<ChannelMessageType[]>({
    queryKey: ['/api/channels', activeChannelId, 'messages'],
    enabled: activeChannelId !== null,
    queryFn: async () => {
      const response = await fetch(`/api/channels/${activeChannelId}/messages`);
      if (!response.ok) throw new Error("Failed to load channel messages");
      return response.json();
    },
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
          <ChannelSidebar isMobile />
        </SheetContent>
      </Sheet>
      
      {/* Desktop Sidebar */}
      <ChannelSidebar />
      
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-zinc-950 text-white">
        {/* Top Bar */}
        <div className="p-4 border-b border-zinc-800 flex items-center">
          <div className="md:hidden w-6"></div> {/* Spacer for mobile */}
          <h2 className="text-lg font-semibold ml-2 md:ml-0">
            {activeChannel ? `#${activeChannel.name}` : 'Select a channel'}
          </h2>
          <div className="ml-auto flex items-center space-x-1">
            {activeCommunityId && (
              <Button
                variant={isMember ? "secondary" : "outline"}
                className="h-8 rounded-full border-zinc-700 bg-zinc-900 px-3 text-xs text-white hover:bg-zinc-800"
                disabled={isLoadingMembership || isMember || joinCommunityMutation.isPending}
                onClick={() => joinCommunityMutation.mutate()}
              >
                {isMember ? <><Check className="mr-1 h-3.5 w-3.5" /> Joined</> : <><UserPlus className="mr-1 h-3.5 w-3.5" /> {joinCommunityMutation.isPending ? "Joining…" : "Join"}</>}
              </Button>
            )}
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
          <div className="p-4 border-b border-zinc-800">
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
            <div className="flex-1 border-t border-zinc-800"></div>
            <span className="px-2 text-sm text-zinc-500">Today</span>
            <div className="flex-1 border-t border-zinc-800"></div>
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
        <form onSubmit={handleSendMessage} className="p-4 border-t border-zinc-800">
          <div className="flex">
            <div className="flex-1 rounded-lg bg-zinc-900 flex items-center p-2">
              <Input
                type="text"
                placeholder={isMember ? `Message ${activeChannel ? `#${activeChannel.name}` : 'channel'}` : "Join this community to send messages"}
                className="flex-1 border-none bg-transparent text-white placeholder:text-zinc-500 focus-visible:ring-0 focus-visible:ring-offset-0"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                disabled={!activeChannelId || !currentUser || !isMember}
              />
            </div>
            <Button 
              type="submit" 
              className="ml-2 p-2 rounded-lg" 
              size="icon"
              disabled={!messageInput.trim() || sendMessageMutation.isPending || !activeChannelId || !currentUser || !isMember}
              aria-label="Send community message"
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default Communities;
