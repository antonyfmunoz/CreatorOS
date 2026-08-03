import { useQuery } from "@tanstack/react-query";
import { useCommunitiesStore } from "@/lib/stores";
import { 
  Channel as ChannelType, 
  Community as CommunityType, 
  ChannelMessage as ChannelMessageType 
} from "@/types";
import { Search, Bell, MoreHorizontal, Hash, Send, Menu, Check, UserPlus, ChevronLeft, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { HorizontalRail } from "@/components/ui/horizontal-rail";
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
import { useLocation, useRoute } from "wouter";

const Communities = () => {
  const { activeCommunityId, activeChannelId, setActiveCommunity } = useCommunitiesStore();
  const [, routeParams] = useRoute("/communities/:id");
  const [, setLocation] = useLocation();
  const { currentUser } = useAppStore();
  const queryClient = useQueryClient();
  const [messageInput, setMessageInput] = useState("");
  const { data: allCommunities = [] } = useQuery<CommunityType[]>({ queryKey: ["/api/communities"] });

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

  const { data: channels, isLoading: isLoadingChannels } = useQuery<ChannelType[]>({
    queryKey: ['/api/communities', activeCommunityId, 'channels'],
    enabled: activeCommunityId !== null && isMember,
    queryFn: async () => {
      const response = await fetch(`/api/communities/${activeCommunityId}/channels`);
      if (!response.ok) throw new Error("Failed to load channels");
      return response.json();
    },
  });

  const activeChannel = channels?.find(channel => channel.id === activeChannelId);

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
    enabled: activeChannelId !== null && isMember,
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

  if (isLoadingCommunity || isLoadingMembership) {
    return <main className="flex min-h-dvh items-center justify-center bg-black px-6 text-center text-sm text-zinc-500">Loading community access…</main>;
  }

  if (!isMember) {
    return (
      <main className="flex min-h-dvh flex-col bg-black px-5 pb-24 pt-5 text-white">
        <header className="flex items-center justify-between">
          <Button variant="ghost" size="icon" className="-ml-2 rounded-full text-white hover:bg-zinc-900 hover:text-white" onClick={() => setLocation("/marketplace")} aria-label="Back to marketplace"><ChevronLeft className="h-7 w-7" /></Button>
          <span className="text-lg font-bold">CreatorOS</span>
          <span className="w-10" />
        </header>
        <section className="m-auto w-full max-w-sm rounded-3xl border border-zinc-800 bg-zinc-950 p-7 text-center shadow-2xl shadow-black">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-zinc-900"><LockKeyhole className="h-7 w-7 text-zinc-300" /></span>
          <h1 className="mt-6 text-2xl font-bold">Join {community?.name ?? "this community"}</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-500">{community?.description ?? "Community conversations, channels, and live rooms are available to members."}</p>
          <Button className="mt-7 h-11 w-full rounded-full bg-[#1d9bf0] font-bold text-white hover:bg-[#1a8cd8]" disabled={joinCommunityMutation.isPending || !activeCommunityId} onClick={() => joinCommunityMutation.mutate()}>
            <UserPlus className="mr-2 h-4 w-4" /> {joinCommunityMutation.isPending ? "Joining…" : "Join community"}
          </Button>
          <button className="mt-4 text-sm font-semibold text-zinc-400 hover:text-white" onClick={() => setLocation("/marketplace")}>Browse other communities</button>
        </section>
      </main>
    );
  }
  
  return (
    <div className="flex h-screen overflow-hidden bg-black pb-14">
      {/* Mobile sidebar using Sheet component */}
      <Sheet>
        <SheetTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon" 
            className="absolute left-4 top-4 z-10 text-zinc-400 hover:bg-zinc-900 hover:text-white md:hidden"
          >
            <Menu className="h-6 w-6" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-4/5 border-r border-zinc-800 bg-black p-0 text-white">
          <ChannelSidebar isMobile isMember={isMember} />
        </SheetContent>
      </Sheet>
      
      <aside className="hidden w-16 shrink-0 flex-col items-center gap-4 border-r border-zinc-800 bg-[#111113] py-4 md:flex" aria-label="Community switcher">
        {allCommunities.map((item) => (
          <button key={item.id} onClick={() => setActiveCommunity(item.id)} className={`flex h-11 w-11 items-center justify-center rounded-full border text-sm font-bold transition-transform hover:scale-105 ${item.id === activeCommunityId ? "border-white text-white" : "border-zinc-700 text-zinc-400"}`} style={{ backgroundColor: item.id === activeCommunityId ? item.iconColor : "#242426" }} aria-label={`Open ${item.name}`}>
            {item.name.slice(0, 2).toUpperCase()}
          </button>
        ))}
      </aside>

      {/* Desktop Sidebar */}
      <ChannelSidebar isMember={isMember} />
      
      {/* Main Chat Area */}
      <div className="flex min-w-0 flex-1 flex-col bg-black text-white">
        {/* Top Bar */}
        <div className="flex h-16 items-center border-b border-zinc-800 px-4">
          <div className="md:hidden w-6"></div> {/* Spacer for mobile */}
          <h2 className="min-w-0 flex-1 truncate text-2xl font-bold">
            {activeChannel ? `# ${activeChannel.name}` : community?.name ?? 'Select a community'}
          </h2>
          <h2 className="sr-only">
            {community ? `${community.name} ›` : 'Select a community'}
          </h2>
          <div className="ml-auto flex shrink-0 items-center space-x-1">
            {false && activeCommunityId && (
              <Button
                variant={isMember ? "secondary" : "outline"}
                className="h-8 rounded-full border-zinc-700 bg-zinc-900 px-3 text-xs text-white hover:bg-zinc-800"
                disabled={isLoadingMembership || isMember || joinCommunityMutation.isPending}
                onClick={() => joinCommunityMutation.mutate()}
              >
                {isMember ? <><Check className="mr-1 h-3.5 w-3.5" /> Joined</> : <><UserPlus className="mr-1 h-3.5 w-3.5" /> {joinCommunityMutation.isPending ? "Joining…" : "Join"}</>}
              </Button>
            )}
            <Button variant="ghost" size="icon" className="rounded-full text-zinc-400 hover:bg-zinc-900 hover:text-white" aria-label="Search community">
              <Search className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" className="rounded-full text-zinc-400 hover:bg-zinc-900 hover:text-white" aria-label="Community notifications">
              <Bell className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" className="rounded-full text-zinc-400 hover:bg-zinc-900 hover:text-white" aria-label="Community options">
              <MoreHorizontal className="h-5 w-5" />
            </Button>
          </div>
        </div>
        
        {/* Channel List */}
        {channels && channels.length > 0 && (
          <div className="border-b border-zinc-800 p-4 md:hidden">
            <HorizontalRail className="space-x-4">
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
            </HorizontalRail>
          </div>
        )}
        
        {/* Chat Area */}
        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          <section className="border-b border-zinc-800 pb-6">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-800"><Hash className="h-9 w-9" /></span>
            <h1 className="mt-5 text-3xl font-bold tracking-tight">Welcome to #{activeChannel?.name ?? "the community"}!</h1>
            <p className="mt-2 text-base text-zinc-500">This is the start of the #{activeChannel?.name ?? "community"} channel.</p>
          </section>
          
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
              <p className="text-zinc-500">No messages yet. Start the conversation!</p>
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
              className="ml-2 rounded-lg bg-[#1d9bf0] p-2 text-white hover:bg-[#1d9bf0]/90"
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
