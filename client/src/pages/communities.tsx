import { useQuery } from "@tanstack/react-query";
import { useCommunitiesStore } from "@/lib/stores";
import { 
  Channel as ChannelType, 
  Community as CommunityType, 
  ChannelMessage as ChannelMessageType 
} from "@/types";
import { Search, Bell, MoreHorizontal, Hash, Send, Menu, Check, UserPlus, ChevronLeft, LockKeyhole, CalendarDays, LogOut, Video, Plus, ExternalLink, Radio, Archive, Users, Shield, BarChart3, X, ClipboardList, NotebookPen, Pencil } from "lucide-react";
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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { reconcileCommunitySelection } from "@/lib/community-selection";

type CommunityEvent = { id: string; name: string; dateTime: string; location: string | null; description: string; attendanceStatus: "going" | "interested" | "declined" | null; goingCount: number };
type CommunityRoom = { id: string; title: string; description: string; startsAt: string; status: "scheduled" | "live" | "ended" | "canceled"; provider: string; joinUrl: string | null; recordingConsentRequired: boolean; recordingEnabled: boolean; transcriptionEnabled: boolean; aiAssistanceEnabled: boolean; goingCount: number; checkedInCount: number; rsvpStatus: "going" | "interested" | "declined" | null; checkedInAt: string | null };
type CommunityRoomNote = { id: string; content: string; createdAt: string };
type CommunityRoomActionItem = { id: string; body: string; dueAt: string | null; completedAt: string | null };
type CommunityMember = { userId: number; username: string; displayName: string; profileImageUrl: string | null; role: "owner" | "admin" | "moderator" | "member"; status: "active" | "muted" | "banned"; moderationReason: string | null; joinedAt: string };
type ChannelPoll = { id: number; question: string; closesAt: string | null; createdAt: string; currentOptionId: number | null; options: Array<{ id: number; label: string; votes: number }> };

function roomDateTimeValue(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.valueOf() - offset).toISOString().slice(0, 16);
}

const Communities = () => {
  const { activeCommunityId, activeChannelId, setActiveCommunity } = useCommunitiesStore();
  const [, routeParams] = useRoute("/communities/:id");
  const [, setLocation] = useLocation();
  const { currentUser } = useAppStore();
  const queryClient = useQueryClient();
  const [messageInput, setMessageInput] = useState("");
  const [replyingTo, setReplyingTo] = useState<ChannelMessageType | null>(null);
  const [pollComposerOpen, setPollComposerOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [communitySearchOpen, setCommunitySearchOpen] = useState(false);
  const [communitySearch, setCommunitySearch] = useState("");
  const [selectedSearchMessageId, setSelectedSearchMessageId] = useState<number | null>(null);
  const [roomComposerOpen, setRoomComposerOpen] = useState(false);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [roomTitle, setRoomTitle] = useState("");
  const [roomStartsAt, setRoomStartsAt] = useState("");
  const [roomProvider, setRoomProvider] = useState("manual_link");
  const [roomJoinUrl, setRoomJoinUrl] = useState("");
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [roomNote, setRoomNote] = useState("");
  const [roomAction, setRoomAction] = useState("");
  const [communityComposerOpen, setCommunityComposerOpen] = useState(false);
  const [communityName, setCommunityName] = useState("");
  const [communityDescription, setCommunityDescription] = useState("");
  const [channelComposerOpen, setChannelComposerOpen] = useState(false);
  const [channelName, setChannelName] = useState("");
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const { data: allCommunities = [], isLoading: isLoadingCommunities } = useQuery<CommunityType[]>({ queryKey: ["/api/communities"] });

  // A marketplace card can open its selected community directly, while the
  // sidebar remains the source of truth for later in-community navigation.
  useEffect(() => {
    const requestedId = Number(routeParams?.id);
    if (Number.isInteger(requestedId) && requestedId > 0 && requestedId !== activeCommunityId) {
      setActiveCommunity(requestedId);
    }
  }, [activeCommunityId, routeParams?.id, setActiveCommunity]);

  // Opening /communities should be useful on its own. Keep a valid deep link
  // authoritative; otherwise reconcile persisted UI state against the live
  // list so an archived or deleted selection cannot strand the user on a
  // generic access gate.
  useEffect(() => {
    const requestedId = Number(routeParams?.id);
    if (Number.isInteger(requestedId)) return;
    const reconciledId = reconcileCommunitySelection(activeCommunityId, allCommunities);
    if (reconciledId !== activeCommunityId) setActiveCommunity(reconciledId);
  }, [activeCommunityId, allCommunities, routeParams?.id, setActiveCommunity]);
  
  const { data: community, isLoading: isLoadingCommunity } = useQuery<CommunityType>({
    queryKey: ['/api/communities', activeCommunityId],
    enabled: activeCommunityId !== null,
    queryFn: async () => {
      const response = await fetch(`/api/communities/${activeCommunityId}`);
      if (!response.ok) throw new Error("Failed to load community");
      return response.json();
    },
  });
  
  const { data: membership, isLoading: isLoadingMembership } = useQuery<{ isMember: boolean; membership: { role: string; status: "active" | "muted" | "banned" } | null }>({
    queryKey: ['/api/communities', activeCommunityId, 'membership'],
    enabled: activeCommunityId !== null,
    queryFn: async () => {
      const response = await fetch(`/api/communities/${activeCommunityId}/membership`);
      if (!response.ok) throw new Error("Failed to load community membership");
      return response.json();
    },
  });
  const isMember = membership?.isMember === true;
  const isReadOnly = membership?.membership?.status === "muted";

  const { data: channels, isLoading: isLoadingChannels } = useQuery<ChannelType[]>({
    queryKey: ['/api/communities', activeCommunityId, 'channels'],
    enabled: activeCommunityId !== null && isMember,
    queryFn: async () => {
      const response = await fetch(`/api/communities/${activeCommunityId}/channels`);
      if (!response.ok) throw new Error("Failed to load channels");
      return response.json();
    },
  });
  const { data: communityEvents = [] } = useQuery<CommunityEvent[]>({
    queryKey: ['/api/communities', activeCommunityId, 'events'],
    enabled: activeCommunityId !== null && isMember,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
    queryFn: async () => (await apiRequest('GET', `/api/communities/${activeCommunityId}/events`)).json(),
  });
  const { data: communityRooms = [] } = useQuery<CommunityRoom[]>({
    queryKey: ['/api/communities', activeCommunityId, 'rooms'],
    enabled: activeCommunityId !== null && isMember,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    queryFn: async () => (await apiRequest('GET', `/api/communities/${activeCommunityId}/rooms`)).json(),
  });
  const { data: roomProviders } = useQuery<{ livekit: { configured: boolean } }>({
    queryKey: ['/api/community-room-providers'],
    enabled: isMember,
    queryFn: async () => (await apiRequest('GET', '/api/community-room-providers')).json(),
  });
  const activeRoom = communityRooms.find((room) => room.id === activeRoomId) ?? null;
  useEffect(() => {
    if (!activeRoomId && communityRooms[0]) setActiveRoomId(communityRooms[0].id);
  }, [activeRoomId, communityRooms]);
  const { data: roomNotes = [] } = useQuery<CommunityRoomNote[]>({
    queryKey: ['/api/community-rooms', activeRoomId, 'notes'],
    enabled: Boolean(activeRoomId) && isMember,
    queryFn: async () => (await apiRequest('GET', `/api/community-rooms/${activeRoomId}/notes`)).json(),
  });
  const { data: roomActionItems = [] } = useQuery<CommunityRoomActionItem[]>({
    queryKey: ['/api/community-rooms', activeRoomId, 'action-items'],
    enabled: Boolean(activeRoomId) && isMember,
    queryFn: async () => (await apiRequest('GET', `/api/community-rooms/${activeRoomId}/action-items`)).json(),
  });
  const { data: communityMembers = [] } = useQuery<CommunityMember[]>({
    queryKey: ['/api/communities', activeCommunityId, 'members'],
    enabled: activeCommunityId !== null && isMember && membersOpen,
    queryFn: async () => (await apiRequest('GET', `/api/communities/${activeCommunityId}/members`)).json(),
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
  const leaveCommunityMutation = useMutation({
    mutationFn: async () => {
      if (!activeCommunityId) throw new Error("Choose a community first");
      await apiRequest('DELETE', `/api/communities/${activeCommunityId}/membership`);
    },
    onSuccess: () => {
      useCommunitiesStore.getState().setActiveCommunity(null);
      setLocation('/marketplace');
    },
  });
  const createCommunityMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/communities', { name: communityName, description: communityDescription, iconColor: '#27272a' });
      return response.json() as Promise<CommunityType>;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['/api/communities'] });
      setActiveCommunity(created.id);
      setCommunityComposerOpen(false); setCommunityName(""); setCommunityDescription("");
      setLocation(`/communities/${created.id}`);
    },
  });
  const createChannelMutation = useMutation({
    mutationFn: async () => {
      if (!activeCommunityId) throw new Error("Choose a community first");
      const response = await apiRequest('POST', '/api/channels', {
        communityId: activeCommunityId,
        name: channelName,
      });
      return response.json() as Promise<ChannelType>;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['/api/communities', activeCommunityId, 'channels'] });
      useCommunitiesStore.getState().setActiveChannel(created.id);
      setChannelComposerOpen(false);
      setChannelName("");
    },
  });
  const closeCommunityComposer = () => {
    setCommunityComposerOpen(false);
    setCommunityName("");
    setCommunityDescription("");
    createCommunityMutation.reset();
  };
  const closeChannelComposer = () => {
    setChannelComposerOpen(false);
    setChannelName("");
    createChannelMutation.reset();
  };
  const archiveCommunityMutation = useMutation({
    mutationFn: async () => {
      if (!activeCommunityId) throw new Error("Choose a community first");
      await apiRequest('POST', `/api/communities/${activeCommunityId}/archive`, {});
    },
    onSuccess: () => {
      setArchiveDialogOpen(false);
      useCommunitiesStore.getState().setActiveCommunity(null);
      queryClient.invalidateQueries({ queryKey: ['/api/communities'] });
      queryClient.removeQueries({ queryKey: ['/api/communities', activeCommunityId] });
      setLocation('/communities');
    },
  });
  const rsvpMutation = useMutation({
    mutationFn: async ({ eventId, status }: { eventId: string; status: string }) => apiRequest('PUT', `/api/events/${eventId}/rsvp`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/communities', activeCommunityId, 'events'] }),
  });
  const saveRoomMutation = useMutation({
    mutationFn: async () => {
      if (!activeCommunityId) throw new Error("Choose a community first");
      const payload = { title: roomTitle, startsAt: new Date(roomStartsAt).toISOString(), provider: roomProvider, joinUrl: roomJoinUrl || null };
      const response = editingRoomId
        ? await apiRequest('PATCH', `/api/community-rooms/${editingRoomId}`, payload)
        : await apiRequest('POST', `/api/communities/${activeCommunityId}/rooms`, payload);
      return response.json() as Promise<CommunityRoom>;
    },
    onSuccess: (room) => {
      queryClient.invalidateQueries({ queryKey: ['/api/communities', activeCommunityId, 'rooms'] });
      setActiveRoomId(room.id);
      setRoomComposerOpen(false); setEditingRoomId(null); setRoomTitle(""); setRoomStartsAt(""); setRoomProvider("manual_link"); setRoomJoinUrl("");
    },
  });
  const roomStatusMutation = useMutation({
    mutationFn: async ({ roomId, status }: { roomId: string; status: "live" | "ended" | "canceled" }) => apiRequest('PATCH', `/api/community-rooms/${roomId}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/communities', activeCommunityId, 'rooms'] }),
  });
  const roomRsvpMutation = useMutation({
    mutationFn: async ({ roomId, status }: { roomId: string; status: "going" | "interested" }) => apiRequest('PUT', `/api/community-rooms/${roomId}/rsvp`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/communities', activeCommunityId, 'rooms'] }),
  });
  const roomCheckInMutation = useMutation({
    mutationFn: async (roomId: string) => apiRequest('POST', `/api/community-rooms/${roomId}/check-in`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/communities', activeCommunityId, 'rooms'] }),
  });
  const createRoomNoteMutation = useMutation({
    mutationFn: async () => {
      if (!activeRoomId) throw new Error('Choose a room first');
      return apiRequest('POST', `/api/community-rooms/${activeRoomId}/notes`, { content: roomNote });
    },
    onSuccess: () => { setRoomNote(''); queryClient.invalidateQueries({ queryKey: ['/api/community-rooms', activeRoomId, 'notes'] }); },
  });
  const createRoomActionMutation = useMutation({
    mutationFn: async () => {
      if (!activeRoomId) throw new Error('Choose a room first');
      return apiRequest('POST', `/api/community-rooms/${activeRoomId}/action-items`, { body: roomAction });
    },
    onSuccess: () => { setRoomAction(''); queryClient.invalidateQueries({ queryKey: ['/api/community-rooms', activeRoomId, 'action-items'] }); },
  });
  const completeRoomActionMutation = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      if (!activeRoomId) throw new Error('Choose a room first');
      return apiRequest('PATCH', `/api/community-rooms/${activeRoomId}/action-items/${id}`, { completed });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/community-rooms', activeRoomId, 'action-items'] }),
  });
  const updateMemberMutation = useMutation({
    mutationFn: async ({ userId, body }: { userId: number; body: { role?: CommunityMember['role']; status?: CommunityMember['status'] } }) => {
      if (!activeCommunityId) throw new Error("Choose a community first");
      return apiRequest('PATCH', `/api/communities/${activeCommunityId}/members/${userId}`, body);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/communities', activeCommunityId, 'members'] }),
  });
  
  const { data: messages, isLoading: isLoadingMessages } = useQuery<ChannelMessageType[]>({
    queryKey: ['/api/channels', activeChannelId, 'messages'],
    enabled: activeChannelId !== null && isMember,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const response = await fetch(`/api/channels/${activeChannelId}/messages`);
      if (!response.ok) throw new Error("Failed to load channel messages");
      return response.json();
    },
  });

  const { data: channelPolls = [] } = useQuery<ChannelPoll[]>({
    queryKey: ['/api/channels', activeChannelId, 'polls'],
    enabled: activeChannelId !== null && isMember,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    queryFn: async () => (await apiRequest('GET', `/api/channels/${activeChannelId}/polls`)).json(),
  });
  
  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      if (!currentUser || !activeChannelId) throw new Error('Not ready to send message');
      
      const message = {
        channelId: activeChannelId,
        userId: currentUser.id,
        parentMessageId: replyingTo?.id ?? null,
        content: messageInput,
        isPinned: false,
      };
      
      const res = await apiRequest('POST', '/api/channel-messages', message);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/channels', activeChannelId, 'messages'] });
      setMessageInput("");
      setReplyingTo(null);
    },
  });
  
  const createPollMutation = useMutation({
    mutationFn: async () => {
      if (!activeChannelId) throw new Error("Choose a channel first");
      return apiRequest('POST', `/api/channels/${activeChannelId}/polls`, { question: pollQuestion, options: pollOptions });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/channels', activeChannelId, 'polls'] });
      setPollQuestion(""); setPollOptions(["", ""]); setPollComposerOpen(false);
    },
  });
  const votePollMutation = useMutation({
    mutationFn: async ({ pollId, optionId }: { pollId: number; optionId: number }) => apiRequest('POST', `/api/channel-polls/${pollId}/vote`, { optionId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/channels', activeChannelId, 'polls'] }),
  });

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (messageInput.trim() && !sendMessageMutation.isPending) {
      sendMessageMutation.mutate();
    }
  };
  
  // Find pinned messages
  const visibleMessages = messages?.filter((message) => message.content.toLowerCase().includes(communitySearch.trim().toLowerCase())) || [];
  const searchMessages = (communitySearch.trim() ? visibleMessages : (messages ?? []))
    .filter((message) => message.parentMessageId === null)
    .slice(0, 6);
  const pinnedMessages = visibleMessages.filter(message => message.isPinned && message.parentMessageId === null);
  const rootMessages = visibleMessages.filter((message) => message.parentMessageId === null);
  const repliesByParent = new Map<number, ChannelMessageType[]>();
  visibleMessages.filter((message) => message.parentMessageId !== null).forEach((message) => {
    const parentId = message.parentMessageId!;
    repliesByParent.set(parentId, [...(repliesByParent.get(parentId) ?? []), message]);
  });
  const canPinMessages = ["owner", "admin"].includes(membership?.membership?.role ?? "");
  const canManageCommunity = ["owner", "admin"].includes(membership?.membership?.role ?? "");

  if (isLoadingCommunities) {
    return <main className="flex min-h-dvh items-center justify-center bg-black px-6 text-center text-sm text-zinc-500">Loading community access…</main>;
  }

  if (allCommunities.length === 0) {
    return <main className="flex min-h-dvh flex-col bg-black px-5 pb-24 pt-5 text-white"><header className="flex items-center justify-between"><Button variant="ghost" size="icon" className="-ml-2 rounded-full text-white hover:bg-zinc-900 hover:text-white" onClick={() => setLocation("/marketplace")} aria-label="Back to marketplace"><ChevronLeft className="h-7 w-7" /></Button><span className="text-lg font-bold">CreativesOS</span><span className="w-10" /></header><section className="m-auto w-full max-w-sm rounded-3xl border border-zinc-800 bg-zinc-950 p-7 text-center shadow-2xl shadow-black"><span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-zinc-900"><Hash className="h-7 w-7 text-zinc-300" /></span><h1 className="mt-6 text-2xl font-bold">Communities are coming together</h1><p className="mt-3 text-sm leading-6 text-zinc-500">Open your own community for conversations, rooms, and creator programs—or explore once other creators launch theirs.</p>{communityComposerOpen ? <form className="mt-6 space-y-3 text-left" onSubmit={(event) => { event.preventDefault(); createCommunityMutation.mutate(); }}><Input required maxLength={80} value={communityName} onChange={(event) => setCommunityName(event.target.value)} placeholder="Community name" className="border-zinc-800 bg-black text-white placeholder:text-zinc-600" /><textarea required maxLength={1_000} value={communityDescription} onChange={(event) => setCommunityDescription(event.target.value)} placeholder="What is this community for?" className="min-h-24 w-full rounded-md border border-zinc-800 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-zinc-600" /><div className="flex gap-2"><Button type="button" variant="outline" className="flex-1 border-zinc-700 bg-black text-white hover:bg-zinc-900" onClick={closeCommunityComposer}>Cancel</Button><Button type="submit" disabled={createCommunityMutation.isPending || !communityName.trim() || !communityDescription.trim()} className="flex-1 bg-white text-black hover:bg-zinc-200">{createCommunityMutation.isPending ? "Opening…" : "Open community"}</Button></div></form> : <><Button className="mt-7 h-11 w-full rounded-full bg-white font-bold text-black hover:bg-zinc-200" onClick={() => currentUser ? setCommunityComposerOpen(true) : setLocation("/auth")}>Open a community</Button><button className="mt-4 text-sm font-semibold text-zinc-400 hover:text-white" onClick={() => setLocation("/marketplace")}>Explore marketplace</button></>}</section></main>;
  }

  if (isLoadingCommunity || isLoadingMembership) {
    return <main className="flex min-h-dvh items-center justify-center bg-black px-6 text-center text-sm text-zinc-500">Loading community access…</main>;
  }

  if (!isMember) {
    return (
      <main className="flex min-h-dvh flex-col bg-black px-5 pb-24 pt-5 text-white">
        <header className="flex items-center justify-between">
          <Button variant="ghost" size="icon" className="-ml-2 rounded-full text-white hover:bg-zinc-900 hover:text-white" onClick={() => setLocation("/marketplace")} aria-label="Back to marketplace"><ChevronLeft className="h-7 w-7" /></Button>
          <span className="text-lg font-bold">CreativesOS</span>
          <span className="w-10" />
        </header>
        <section className="m-auto w-full max-w-sm rounded-3xl border border-zinc-800 bg-zinc-950 p-7 text-center shadow-2xl shadow-black">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-zinc-900"><LockKeyhole className="h-7 w-7 text-zinc-300" /></span>
          <h1 className="mt-6 text-2xl font-bold">Join {community?.name ?? "this community"}</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-500">{community?.description ?? "Community conversations, channels, and live rooms are available to members."}</p>
          <Button className="mt-7 h-11 w-full rounded-full bg-white font-bold text-black hover:bg-zinc-200" disabled={joinCommunityMutation.isPending || !activeCommunityId} onClick={() => joinCommunityMutation.mutate()}>
            <UserPlus className="mr-2 h-4 w-4" /> {joinCommunityMutation.isPending ? "Joining…" : "Join community"}
          </Button>
          <button className="mt-4 text-sm font-semibold text-zinc-400 hover:text-white" onClick={() => setLocation("/marketplace")}>Browse other communities</button>
        </section>
      </main>
    );
  }
  
  return (
    <>
      <Dialog open={communityComposerOpen} onOpenChange={(open) => open ? setCommunityComposerOpen(true) : closeCommunityComposer()}>
        <DialogContent className="border-zinc-800 bg-zinc-950 text-white">
          <DialogHeader>
            <DialogTitle>Open a community</DialogTitle>
            <DialogDescription className="text-zinc-400">Create a member space for conversations, rooms, events, and offers.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); createCommunityMutation.mutate(); }}>
            <label className="block text-xs font-semibold text-zinc-400" htmlFor="community-name">Community name<Input id="community-name" required maxLength={80} autoFocus value={communityName} onChange={(event) => setCommunityName(event.target.value)} placeholder="Creative Operators" className="mt-1 border-zinc-700 bg-black text-white placeholder:text-zinc-600" /></label>
            <label className="block text-xs font-semibold text-zinc-400" htmlFor="community-description">Description<textarea id="community-description" required maxLength={1_000} value={communityDescription} onChange={(event) => setCommunityDescription(event.target.value)} placeholder="What will members do here?" className="mt-1 min-h-28 w-full rounded-md border border-zinc-700 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-zinc-500" /></label>
            {createCommunityMutation.isError && <p role="alert" className="text-sm text-red-300">{createCommunityMutation.error.message}</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="ghost" className="text-zinc-400 hover:bg-zinc-900 hover:text-white" onClick={closeCommunityComposer}>Cancel</Button><Button type="submit" disabled={createCommunityMutation.isPending || !communityName.trim() || !communityDescription.trim()} className="bg-white text-black hover:bg-zinc-200">{createCommunityMutation.isPending ? "Opening…" : "Open community"}</Button></div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={channelComposerOpen} onOpenChange={(open) => open ? setChannelComposerOpen(true) : closeChannelComposer()}>
        <DialogContent className="border-zinc-800 bg-zinc-950 text-white">
          <DialogHeader>
            <DialogTitle>Create a channel</DialogTitle>
            <DialogDescription className="text-zinc-400">Add a focused conversation to {community?.name ?? "this community"}.</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); createChannelMutation.mutate(); }}>
            <label className="block text-xs font-semibold text-zinc-400" htmlFor="channel-name">Channel name<Input id="channel-name" required maxLength={80} autoFocus value={channelName} onChange={(event) => setChannelName(event.target.value)} placeholder="announcements" className="mt-1 border-zinc-700 bg-black text-white placeholder:text-zinc-600" /></label>
            {createChannelMutation.isError && <p role="alert" className="text-sm text-red-300">{createChannelMutation.error.message}</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="ghost" className="text-zinc-400 hover:bg-zinc-900 hover:text-white" onClick={closeChannelComposer}>Cancel</Button><Button type="submit" disabled={createChannelMutation.isPending || !channelName.trim()} className="bg-white text-black hover:bg-zinc-200">{createChannelMutation.isPending ? "Creating…" : "Create channel"}</Button></div>
          </form>
        </DialogContent>
      </Dialog>
      <Sheet open={membersOpen} onOpenChange={setMembersOpen}>
        <SheetContent side="right" className="w-full border-l border-zinc-800 bg-black p-0 text-white sm:max-w-md">
          <div className="border-b border-zinc-800 px-5 py-5">
            <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900"><Users className="h-4 w-4" /></span><div><h2 className="font-bold">People</h2><p className="text-xs text-zinc-500">Roles and member access for {community?.name ?? "this community"}.</p></div></div>
          </div>
          <div className="h-[calc(100dvh-81px)] space-y-2 overflow-y-auto p-4">
            {communityMembers.map((member) => {
              const isSelf = member.userId === currentUser?.id;
              const isManager = ["owner", "admin"].includes(membership?.membership?.role ?? "");
              const canManageThisMember = isManager && !isSelf && member.role !== "owner" && (membership?.membership?.role === "owner" || member.role === "member" || member.role === "moderator");
              const availableRoles = membership?.membership?.role === "owner" ? ["admin", "moderator", "member"] : ["moderator", "member"];
              return <div key={member.userId} className="rounded-xl border border-zinc-800 bg-zinc-950 p-3"><div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold">{member.displayName.slice(0, 2).toUpperCase()}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-semibold">{member.displayName}{isSelf ? " (you)" : ""}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${member.status === "active" ? "bg-zinc-800 text-zinc-300" : "bg-amber-500/15 text-amber-300"}`}>{member.status}</span></div><p className="mt-0.5 truncate text-xs text-zinc-500">@{member.username} · {member.role}</p>{member.moderationReason && <p className="mt-2 text-xs text-amber-200/80">{member.moderationReason}</p>}{canManageThisMember && <div className="mt-3 grid grid-cols-2 gap-2"><label className="sr-only" htmlFor={`role-${member.userId}`}>Role for {member.displayName}</label><select id={`role-${member.userId}`} value={member.role} onChange={(event) => updateMemberMutation.mutate({ userId: member.userId, body: { role: event.target.value as CommunityMember['role'] } })} disabled={updateMemberMutation.isPending} className="h-9 rounded-md border border-zinc-700 bg-black px-2 text-xs text-white"><option value={member.role}>{member.role}</option>{availableRoles.filter((role) => role !== member.role).map((role) => <option key={role} value={role}>{role}</option>)}</select><label className="sr-only" htmlFor={`status-${member.userId}`}>Access status for {member.displayName}</label><select id={`status-${member.userId}`} value={member.status} onChange={(event) => updateMemberMutation.mutate({ userId: member.userId, body: { status: event.target.value as CommunityMember['status'] } })} disabled={updateMemberMutation.isPending} className="h-9 rounded-md border border-zinc-700 bg-black px-2 text-xs text-white"><option value="active">active</option><option value="muted">muted</option><option value="banned">banned</option></select></div>}</div></div></div>;
            })}
            {communityMembers.length === 0 && <p className="py-10 text-center text-sm text-zinc-500">No members found.</p>}
            {["owner", "admin"].includes(membership?.membership?.role ?? "") && <p className="px-1 pt-3 text-xs leading-5 text-zinc-500"><Shield className="mr-1 inline h-3.5 w-3.5" />Owners can manage roles. Moderation actions are retained in the community audit history.</p>}
          </div>
        </SheetContent>
      </Sheet>
      <AlertDialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <AlertDialogContent className="border-zinc-800 bg-zinc-950 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {community?.name ?? "community"}?</AlertDialogTitle>
            <AlertDialogDescription className="text-zinc-400">This closes access to its channels, rooms, and member space. It will no longer appear in discovery, while its history remains retained for audit purposes.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-zinc-700 bg-black text-white hover:bg-zinc-900 hover:text-white">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => archiveCommunityMutation.mutate()} disabled={archiveCommunityMutation.isPending} className="bg-red-600 text-white hover:bg-red-500">{archiveCommunityMutation.isPending ? "Archiving…" : "Archive community"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="flex h-screen overflow-hidden bg-black pb-14">
      {/* Mobile sidebar using Sheet component */}
      <Sheet>
        <SheetTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon" 
            className="absolute left-4 top-4 z-10 text-zinc-400 hover:bg-zinc-900 hover:text-white md:hidden"
            aria-label="Open community channels"
          >
            <Menu className="h-6 w-6" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-4/5 border-r border-zinc-800 bg-black p-0 text-white">
          <ChannelSidebar isMobile isMember={isMember} canManage={canManageCommunity} onCreateChannel={() => setChannelComposerOpen(true)} />
        </SheetContent>
      </Sheet>
      
      <aside className="hidden w-16 shrink-0 flex-col items-center gap-4 border-r border-zinc-800 bg-[#111113] py-4 md:flex" aria-label="Community switcher">
        {allCommunities.map((item) => (
          <button key={item.id} onClick={() => setActiveCommunity(item.id)} className={`flex h-11 w-11 items-center justify-center rounded-full border text-sm font-bold transition-transform hover:scale-105 ${item.id === activeCommunityId ? "border-white text-white" : "border-zinc-700 text-zinc-400"}`} style={{ backgroundColor: item.id === activeCommunityId ? item.iconColor : "#242426" }} aria-label={`Open ${item.name}`}>
            {item.name.slice(0, 2).toUpperCase()}
          </button>
        ))}
        <button onClick={() => setCommunityComposerOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-zinc-700 text-zinc-500 transition-colors hover:border-zinc-500 hover:bg-zinc-900 hover:text-white" aria-label="Open a community"><Plus className="h-5 w-5" /></button>
      </aside>

      {/* Desktop Sidebar */}
      <ChannelSidebar isMember={isMember} canManage={canManageCommunity} onCreateChannel={() => setChannelComposerOpen(true)} />
      
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
            <Button variant="ghost" size="icon" className="rounded-full text-zinc-400 hover:bg-zinc-900 hover:text-white md:hidden" aria-label="Open a community" onClick={() => setCommunityComposerOpen(true)}><Plus className="h-5 w-5" /></Button>
            <Button variant="ghost" size="icon" className="rounded-full text-zinc-400 hover:bg-zinc-900 hover:text-white" aria-label="View community members" onClick={() => setMembersOpen(true)}>
              <Users className="h-5 w-5" />
            </Button>
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
            <Button variant="ghost" size="icon" className="rounded-full text-zinc-400 hover:bg-zinc-900 hover:text-white" aria-label="Search community" onClick={() => setCommunitySearchOpen((open) => !open)}>
              <Search className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" className="rounded-full text-zinc-400 hover:bg-zinc-900 hover:text-white" aria-label="Community notifications" onClick={() => setLocation("/notifications")}>
              <Bell className="h-5 w-5" />
            </Button>
            {membership?.membership?.role !== "owner" && <Button variant="ghost" size="icon" className="rounded-full text-zinc-400 hover:bg-zinc-900 hover:text-white" aria-label="Leave community" disabled={leaveCommunityMutation.isPending} onClick={() => leaveCommunityMutation.mutate()}>
              <LogOut className="h-5 w-5" />
            </Button>}
            {membership?.membership?.role === "owner" && <Button variant="ghost" size="icon" className="rounded-full text-zinc-400 hover:bg-zinc-900 hover:text-red-300" aria-label="Archive community" onClick={() => setArchiveDialogOpen(true)}>
              <Archive className="h-5 w-5" />
            </Button>}
            <Button variant="ghost" size="icon" className="rounded-full text-zinc-400 hover:bg-zinc-900 hover:text-white" aria-label="Browse communities" onClick={() => setLocation("/marketplace")}>
              <MoreHorizontal className="h-5 w-5" />
            </Button>
          </div>
        </div>
        {communitySearchOpen && <section aria-label="Community search" className="border-b border-zinc-800 bg-black px-4 py-3">
          <div className="flex items-center gap-2"><Input aria-label="Search this channel" autoFocus value={communitySearch} onChange={(event) => { setCommunitySearch(event.target.value); setSelectedSearchMessageId(null); }} placeholder="Search this channel" className="border-0 bg-zinc-900 text-white placeholder:text-zinc-500" /><Button type="button" variant="ghost" size="icon" aria-label="Close community search" className="shrink-0 text-zinc-400 hover:bg-zinc-900 hover:text-white" onClick={() => { setCommunitySearchOpen(false); setCommunitySearch(""); }}><X className="h-4 w-4" /></Button></div>
          <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-400">{communitySearch.trim() ? "Messages" : "Recent messages"}</p>
          <div className="mt-2 grid gap-1">
            {searchMessages.map((message) => <button key={message.id} type="button" aria-pressed={selectedSearchMessageId === message.id} onClick={() => { setSelectedSearchMessageId(message.id); requestAnimationFrame(() => document.getElementById(`community-message-${message.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })); }} className={`rounded-xl px-3 py-2 text-left transition-colors ${selectedSearchMessageId === message.id ? "ring-2 ring-white bg-zinc-900" : "hover:bg-zinc-950"}`}><span className="block text-xs font-bold text-white">{message.user.displayName}</span><span className="mt-0.5 block truncate text-xs text-zinc-400">{message.content}</span></button>)}
            {searchMessages.length === 0 && <p className="rounded-xl border border-dashed border-zinc-800 px-3 py-4 text-xs text-zinc-400">No messages match this search.</p>}
          </div>
        </section>}
        
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
                      className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap ${channel.id === activeChannelId ? "bg-white text-black hover:bg-zinc-200" : "border-zinc-700 bg-zinc-950 text-zinc-300 hover:bg-zinc-900 hover:text-white"}`}
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
          {communityEvents.slice(0, 2).map((event) => <section key={event.id} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-800"><CalendarDays className="h-5 w-5" /></span><div className="min-w-0 flex-1"><div className="flex items-start gap-2"><p className="min-w-0 flex-1 text-sm font-bold">{event.name}</p>{["owner", "admin"].includes(membership?.membership?.role ?? "") && <Button size="sm" variant="ghost" className="-mr-2 -mt-2 h-8 px-2 text-zinc-400 hover:bg-zinc-900 hover:text-white" onClick={() => setLocation(`/events/${event.id}/edit`)}><Pencil className="mr-1.5 h-3.5 w-3.5" />Edit</Button>}</div><p className="mt-1 text-xs text-zinc-500">{new Date(event.dateTime).toLocaleString()}{event.location ? ` · ${event.location}` : ''}</p><p className="mt-2 line-clamp-2 text-sm text-zinc-400">{event.description}</p><div className="mt-3 flex gap-2"><Button size="sm" variant={event.attendanceStatus === "going" ? "default" : "outline"} aria-pressed={event.attendanceStatus === "going"} className={event.attendanceStatus === "going" ? "bg-white text-black hover:bg-zinc-200" : "border-zinc-700 bg-black text-white hover:bg-zinc-900"} disabled={rsvpMutation.isPending} onClick={() => rsvpMutation.mutate({ eventId: event.id, status: 'going' })}>Going{event.goingCount > 0 ? ` · ${event.goingCount}` : ""}</Button><Button size="sm" variant={event.attendanceStatus === "interested" ? "default" : "outline"} aria-pressed={event.attendanceStatus === "interested"} className={event.attendanceStatus === "interested" ? "bg-white text-black hover:bg-zinc-200" : "border-zinc-700 bg-black text-white hover:bg-zinc-900"} disabled={rsvpMutation.isPending} onClick={() => rsvpMutation.mutate({ eventId: event.id, status: 'interested' })}>Interested</Button></div></div></div></section>)}
          
          <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-800"><Video className="h-5 w-5" /></span><div><h2 className="text-sm font-bold">Live rooms</h2><p className="mt-0.5 text-xs text-zinc-500">Calls and office hours live beside the conversation.</p></div></div>
              {["owner", "admin"].includes(membership?.membership?.role ?? "") && <Button size="sm" className="shrink-0 bg-white text-black hover:bg-zinc-200" onClick={() => { const shouldOpen = !roomComposerOpen || editingRoomId !== null; setEditingRoomId(null); setRoomTitle(""); setRoomStartsAt(""); setRoomProvider("manual_link"); setRoomJoinUrl(""); setRoomComposerOpen(shouldOpen); }}><Plus className="mr-1 h-4 w-4" />Schedule</Button>}
            </div>
            {roomComposerOpen && <form className="mt-4 grid gap-3 border-t border-zinc-800 pt-4" onSubmit={(event) => { event.preventDefault(); saveRoomMutation.mutate(); }}>
              <p className="text-sm font-bold">{editingRoomId ? "Edit scheduled room" : "Schedule a room"}</p>
              <Input required maxLength={160} value={roomTitle} onChange={(event) => setRoomTitle(event.target.value)} placeholder="Room title" className="border-zinc-800 bg-black text-white placeholder:text-zinc-600" />
              <Input required type="datetime-local" value={roomStartsAt} onChange={(event) => setRoomStartsAt(event.target.value)} onInput={(event) => setRoomStartsAt(event.currentTarget.value)} className="border-zinc-800 bg-black text-white" />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><select value={roomProvider} onChange={(event) => { setRoomProvider(event.target.value); if (event.target.value === "livekit") setRoomJoinUrl(""); }} className="h-10 rounded-md border border-zinc-800 bg-black px-3 text-sm text-white"><option value="manual_link">Room link</option><option value="google_meet">Google Meet</option><option value="zoom">Zoom</option><option value="livekit">Native CreativesOS room{roomProviders?.livekit.configured ? "" : " (setup pending)"}</option></select>{roomProvider === "livekit" ? <div className="flex h-10 items-center rounded-md border border-zinc-800 bg-zinc-950 px-3 text-xs text-zinc-500">No external link required</div> : <Input type="url" value={roomJoinUrl} onChange={(event) => setRoomJoinUrl(event.target.value)} placeholder="https://… (optional until provider setup)" className="border-zinc-800 bg-black text-white placeholder:text-zinc-600" />}</div>
              <p className="text-xs leading-5 text-zinc-500">Recording, transcription, and AI assistance are off by default. They need explicit consent and a connected provider.</p>
              <div className="flex justify-end gap-2"><Button type="button" variant="ghost" className="text-zinc-400 hover:bg-zinc-900 hover:text-white" onClick={() => { setRoomComposerOpen(false); setEditingRoomId(null); }}>Cancel</Button><Button type="submit" disabled={saveRoomMutation.isPending || !roomTitle.trim() || !roomStartsAt} className="bg-white text-black hover:bg-zinc-200">{saveRoomMutation.isPending ? "Saving…" : editingRoomId ? "Save room" : "Schedule room"}</Button></div>
            </form>}
            {communityRooms.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-500">No rooms scheduled yet.</p>
            ) : (
              <HorizontalRail aria-label="Community rooms" className="mt-4 gap-3 pb-1">
                {[...communityRooms]
                  .sort((a, b) => {
                    const rank = { live: 0, scheduled: 1, ended: 2, canceled: 3 };
                    return rank[a.status] - rank[b.status] || new Date(b.startsAt).valueOf() - new Date(a.startsAt).valueOf();
                  })
                  .map((room) => (
                    <div key={room.id} data-room-id={room.id} className="w-[min(86vw,28rem)] shrink-0 rounded-xl border border-zinc-800 bg-black p-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Radio className={`h-3.5 w-3.5 ${room.status === "live" ? "text-red-400" : "text-zinc-500"}`} />
                          <p className="truncate text-sm font-semibold">{room.title}</p>
                          <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-400">{room.status}</span>
                        </div>
                        <p className="mt-1 text-xs text-zinc-500">{new Date(room.startsAt).toLocaleString()} · {room.provider.replace("_", " ")} · {room.recordingEnabled ? "Recording enabled" : "No recording"}</p>
                        <p className="mt-1 text-[11px] text-zinc-500">{room.goingCount} going · {room.checkedInCount} checked in</p>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" aria-pressed={activeRoomId === room.id} className="border-zinc-700 bg-black text-white hover:bg-zinc-900" onClick={() => setActiveRoomId(room.id)}><NotebookPen className="mr-1.5 h-3.5 w-3.5" />Workspace</Button>
                        {["scheduled", "live"].includes(room.status) && <><Button size="sm" variant={room.rsvpStatus === "going" ? "default" : "outline"} aria-pressed={room.rsvpStatus === "going"} disabled={roomRsvpMutation.isPending || isReadOnly} className={room.rsvpStatus === "going" ? "bg-white text-black hover:bg-zinc-200" : "border-zinc-700 bg-black text-white hover:bg-zinc-900"} onClick={() => roomRsvpMutation.mutate({ roomId: room.id, status: "going" })}>Going</Button><Button size="sm" variant="outline" aria-pressed={room.rsvpStatus === "interested"} disabled={roomRsvpMutation.isPending || isReadOnly} className="border-zinc-700 bg-black text-white hover:bg-zinc-900" onClick={() => roomRsvpMutation.mutate({ roomId: room.id, status: "interested" })}>Interested</Button></>}
                        {room.status === "live" && !room.checkedInAt && <Button size="sm" variant="outline" disabled={roomCheckInMutation.isPending || isReadOnly} className="border-zinc-700 bg-black text-white hover:bg-zinc-900" onClick={() => roomCheckInMutation.mutate(room.id)}>Check in</Button>}
                        {room.provider === "livekit" ? (room.status === "live" ? <Button size="sm" disabled={!roomProviders?.livekit.configured} className="bg-white text-black hover:bg-zinc-200" onClick={() => setLocation(`/communities/${activeCommunityId}/rooms/${room.id}`)}><Video className="mr-1.5 h-3.5 w-3.5" />Join room</Button> : room.status === "scheduled" ? <Button size="sm" variant="outline" className="border-zinc-700 bg-black text-white hover:bg-zinc-900" onClick={() => setLocation(`/communities/${activeCommunityId}/rooms/${room.id}`)}><Video className="mr-1.5 h-3.5 w-3.5" />Room</Button> : <span className="inline-flex h-9 items-center rounded-md border border-zinc-800 px-3 text-xs text-zinc-500">Native room</span>) : room.joinUrl ? <a href={room.joinUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-md bg-white px-3 text-xs font-semibold text-black hover:bg-zinc-200"><ExternalLink className="mr-1.5 h-3.5 w-3.5" />Join</a> : <span className="inline-flex h-9 items-center rounded-md border border-zinc-800 px-3 text-xs text-zinc-600">Provider link pending</span>}
                        {["owner", "admin"].includes(membership?.membership?.role ?? "") && room.status === "scheduled" && <Button size="sm" variant="outline" disabled={roomStatusMutation.isPending || (room.provider === "livekit" && !roomProviders?.livekit.configured)} className="border-zinc-700 bg-black text-white hover:bg-zinc-900" onClick={() => roomStatusMutation.mutate({ roomId: room.id, status: "live" })}>Start</Button>}
                        {["owner", "admin"].includes(membership?.membership?.role ?? "") && room.status === "live" && <Button size="sm" variant="outline" disabled={roomStatusMutation.isPending} className="border-zinc-700 bg-black text-white hover:bg-zinc-900" onClick={() => roomStatusMutation.mutate({ roomId: room.id, status: "ended" })}>End</Button>}
                      </div>
                    </div>
                  ))}
              </HorizontalRail>
            )}
          </section>

          {activeRoom?.status === "scheduled" && ["owner", "admin"].includes(membership?.membership?.role ?? "") && <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><div className="flex items-center justify-between gap-3"><div><h2 className="text-sm font-bold">Manage scheduled room</h2><p className="mt-1 text-xs text-zinc-500">{activeRoom.title} · {new Date(activeRoom.startsAt).toLocaleString()}</p></div><div className="flex flex-wrap justify-end gap-2"><Button size="sm" variant="outline" className="border-zinc-700 bg-black text-white hover:bg-zinc-900" onClick={() => { setEditingRoomId(activeRoom.id); setRoomTitle(activeRoom.title); setRoomStartsAt(roomDateTimeValue(activeRoom.startsAt)); setRoomProvider(activeRoom.provider); setRoomJoinUrl(activeRoom.joinUrl ?? ""); setRoomComposerOpen(true); }}><Pencil className="mr-1.5 h-3.5 w-3.5" />Edit</Button><Button size="sm" variant="outline" disabled={roomStatusMutation.isPending || (activeRoom.provider === "livekit" && !roomProviders?.livekit.configured)} className="border-zinc-700 bg-black text-white hover:bg-zinc-900" onClick={() => roomStatusMutation.mutate({ roomId: activeRoom.id, status: "live" })}>Start</Button><Button size="sm" variant="ghost" disabled={roomStatusMutation.isPending} className="text-zinc-500 hover:bg-red-950 hover:text-red-300" onClick={() => { if (window.confirm(`Cancel “${activeRoom.title}”? This closes RSVPs and cannot be undone.`)) roomStatusMutation.mutate({ roomId: activeRoom.id, status: "canceled" }); }}><X className="mr-1.5 h-3.5 w-3.5" />Cancel</Button></div></div></section>}

          {activeRoom && <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><div className="flex items-center gap-2"><NotebookPen className="h-4 w-4 text-zinc-400" /><div><h2 className="text-sm font-bold">{activeRoom.title} workspace</h2><p className="mt-0.5 text-xs text-zinc-500">Notes and follow-ups stay within this community.</p></div></div><div className="mt-4 grid gap-4 lg:grid-cols-2"><div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500"><NotebookPen className="h-3.5 w-3.5" />Notes</p><div className="mt-2 max-h-48 space-y-2 overflow-y-auto pr-1">{roomNotes.length === 0 ? <p className="rounded-lg border border-dashed border-zinc-800 px-3 py-4 text-xs text-zinc-500">No notes yet.</p> : roomNotes.map((note) => <div key={note.id} className="rounded-lg bg-black p-3"><p className="whitespace-pre-wrap text-sm text-zinc-300">{note.content}</p><p className="mt-2 text-[10px] text-zinc-600">{new Date(note.createdAt).toLocaleString()}</p></div>)}</div><textarea value={roomNote} onChange={(event) => setRoomNote(event.target.value)} maxLength={20_000} disabled={isReadOnly} placeholder="Capture a decision, link, or takeaway…" className="mt-3 min-h-20 w-full rounded-lg border border-zinc-800 bg-black px-3 py-2 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-zinc-600 disabled:opacity-50" /><Button size="sm" className="mt-2 bg-white text-black hover:bg-zinc-200" disabled={isReadOnly || !roomNote.trim() || createRoomNoteMutation.isPending} onClick={() => createRoomNoteMutation.mutate()}>{createRoomNoteMutation.isPending ? "Saving…" : "Add note"}</Button></div><div><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-500"><ClipboardList className="h-3.5 w-3.5" />Action items</p><div className="mt-2 max-h-48 space-y-2 overflow-y-auto pr-1">{roomActionItems.length === 0 ? <p className="rounded-lg border border-dashed border-zinc-800 px-3 py-4 text-xs text-zinc-500">No action items yet.</p> : roomActionItems.map((item) => <label key={item.id} className="flex cursor-pointer items-start gap-2 rounded-lg bg-black p-3 text-sm"><input type="checkbox" className="mt-0.5" checked={Boolean(item.completedAt)} disabled={isReadOnly || completeRoomActionMutation.isPending} onChange={(event) => completeRoomActionMutation.mutate({ id: item.id, completed: event.target.checked })} /><span className={item.completedAt ? "text-zinc-600 line-through" : "text-zinc-300"}>{item.body}</span></label>)}</div><Input value={roomAction} onChange={(event) => setRoomAction(event.target.value)} maxLength={2000} disabled={isReadOnly} placeholder="Add a follow-up…" className="mt-3 border-zinc-800 bg-black text-white placeholder:text-zinc-600" /><Button size="sm" className="mt-2 bg-white text-black hover:bg-zinc-200" disabled={isReadOnly || !roomAction.trim() || createRoomActionMutation.isPending} onClick={() => createRoomActionMutation.mutate()}>{createRoomActionMutation.isPending ? "Adding…" : "Add action item"}</Button></div></div></section>}

          {/* Pinned Messages */}
          {pinnedMessages.map(message => (
            <ChatMessage key={`pinned-${message.id}`} message={message} isPinned={true} />
          ))}

          {channelPolls.length > 0 && <section className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-zinc-400" /><h2 className="text-sm font-bold">Channel polls</h2></div>{channelPolls.map((poll) => { const totalVotes = poll.options.reduce((total, option) => total + option.votes, 0); const closed = poll.closesAt ? new Date(poll.closesAt) <= new Date() : false; return <div key={poll.id} className="rounded-xl border border-zinc-800 bg-black p-3"><div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold">{poll.question}</p>{closed && <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-zinc-500">Closed</span>}</div><div className="mt-3 space-y-2">{poll.options.map((option) => { const percent = totalVotes ? Math.round((option.votes / totalVotes) * 100) : 0; const selected = poll.currentOptionId === option.id; return <button key={option.id} type="button" disabled={closed || isReadOnly || votePollMutation.isPending} onClick={() => votePollMutation.mutate({ pollId: poll.id, optionId: option.id })} className={`relative flex w-full overflow-hidden rounded-lg border px-3 py-2 text-left text-xs transition-colors ${selected ? "border-white text-white" : "border-zinc-800 text-zinc-300 hover:border-zinc-600"}`}><span className="absolute inset-y-0 left-0 bg-zinc-800/70" style={{ width: `${percent}%` }} /><span className="relative flex flex-1 justify-between gap-3"><span className="truncate">{option.label}</span><span className="shrink-0 text-zinc-500">{percent}%</span></span></button>; })}</div><p className="mt-2 text-[11px] text-zinc-500">{totalVotes} {totalVotes === 1 ? "vote" : "votes"}{poll.closesAt ? ` · closes ${new Date(poll.closesAt).toLocaleString()}` : ""}</p></div>; })}</section>}
          
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
            rootMessages.map(message => (
              <div id={`community-message-${message.id}`} key={message.id} className={`rounded-xl transition-shadow ${selectedSearchMessageId === message.id ? "ring-2 ring-white ring-offset-4 ring-offset-black" : ""}`}>
                <ChatMessage message={message} canPin={canPinMessages} onReply={(target) => { setReplyingTo(target); setMessageInput(""); }} />
                {(repliesByParent.get(message.id) ?? []).map((reply) => <ChatMessage key={reply.id} message={reply} isReply />)}
              </div>
            ))
          )}
          
          {visibleMessages.length === 0 && !isLoadingMessages && (
            <div className="text-center py-10">
              <p className="text-zinc-500">{communitySearch ? "No matching messages." : "No messages yet. Start the conversation!"}</p>
            </div>
          )}
        </div>
        
        {/* Message Input */}
        <form onSubmit={handleSendMessage} className="p-4 border-t border-zinc-800">
          {pollComposerOpen && <div className="mb-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3"><div className="flex items-center justify-between"><p className="text-sm font-semibold">New poll</p><Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-zinc-400 hover:bg-zinc-900 hover:text-white" onClick={() => setPollComposerOpen(false)}><X className="h-4 w-4" /></Button></div><Input maxLength={500} value={pollQuestion} onChange={(event) => setPollQuestion(event.target.value)} placeholder="Ask the community" className="mt-3 border-zinc-800 bg-black text-white placeholder:text-zinc-600" />{pollOptions.map((option, index) => <Input key={index} maxLength={160} value={option} onChange={(event) => setPollOptions((current) => current.map((value, optionIndex) => optionIndex === index ? event.target.value : value))} placeholder={`Option ${index + 1}`} className="mt-2 border-zinc-800 bg-black text-white placeholder:text-zinc-600" />)}<div className="mt-3 flex justify-between gap-2"><Button type="button" variant="ghost" size="sm" disabled={pollOptions.length >= 8} className="text-zinc-400 hover:bg-zinc-900 hover:text-white" onClick={() => setPollOptions((current) => [...current, ""])}>Add option</Button><Button type="button" size="sm" disabled={createPollMutation.isPending || !pollQuestion.trim() || pollOptions.filter(Boolean).length < 2} className="bg-white text-black hover:bg-zinc-200" onClick={() => createPollMutation.mutate()}>{createPollMutation.isPending ? "Creating…" : "Create poll"}</Button></div></div>}
          {replyingTo && <div className="mb-2 flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs"><span className="truncate text-zinc-400">Replying to <span className="font-semibold text-white">{replyingTo.user.displayName}</span>: {replyingTo.content}</span><Button type="button" variant="ghost" size="sm" className="ml-3 h-7 shrink-0 px-2 text-zinc-400 hover:bg-zinc-900 hover:text-white" onClick={() => setReplyingTo(null)}>Cancel</Button></div>}
          <div className="flex">
            <div className="flex-1 rounded-lg bg-zinc-900 flex items-center p-2">
              <Input
                type="text"
                placeholder={isReadOnly ? "Your community access is read-only" : isMember ? `Message ${activeChannel ? `#${activeChannel.name}` : 'channel'}` : "Join this community to send messages"}
                className="flex-1 border-none bg-transparent text-white placeholder:text-zinc-500 focus-visible:ring-0 focus-visible:ring-offset-0"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                disabled={!activeChannelId || !currentUser || !isMember || isReadOnly}
              />
            </div>
            <Button type="button" variant="outline" className="ml-2 border-zinc-700 bg-black p-2 text-zinc-300 hover:bg-zinc-900 hover:text-white" size="icon" disabled={!activeChannelId || !isMember || isReadOnly} aria-label="Create community poll" onClick={() => setPollComposerOpen((open) => !open)}><BarChart3 className="h-5 w-5" /></Button>
            <Button 
              type="submit" 
              className="ml-2 rounded-lg bg-white p-2 text-black hover:bg-zinc-200"
              size="icon"
              disabled={!messageInput.trim() || sendMessageMutation.isPending || !activeChannelId || !currentUser || !isMember || isReadOnly}
              aria-label="Send community message"
            >
              <Send className="h-5 w-5" />
            </Button>
          </div>
        </form>
      </div>
      </div>
    </>
  );
};

export default Communities;
