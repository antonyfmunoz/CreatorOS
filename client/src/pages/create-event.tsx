import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, ImagePlus, MapPin, Save, Send } from "lucide-react";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Channel, Community } from "@/types";

type ManagedCommunity = Pick<Community, "id" | "name">;
type AssetUploadIntent = { asset: { id: string }; upload: { uploadUrl: string } };
type CompletedAsset = { asset: { publicUrl: string | null } };
type EventDetail = {
  id: string;
  communityId: number;
  channelId: number | null;
  name: string;
  dateTime: string;
  location: string | null;
  description: string;
  coverUrl: string | null;
};

function localDateTimeValue(value: string) {
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.valueOf() - offset).toISOString().slice(0, 16);
}

export default function CreateEventPage() {
  const [, setLocation] = useLocation();
  const [isEditRoute, editParams] = useRoute("/events/:id/edit");
  const eventId = isEditRoute ? editParams?.id : undefined;
  const { user } = useAuth();
  const { toast } = useToast();
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [existingCoverUrl, setExistingCoverUrl] = useState<string | null>(null);
  const [hydratedEventId, setHydratedEventId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [dateTime, setDateTime] = useState("");
  const [location, setEventLocation] = useState("");
  const [description, setDescription] = useState("");
  const [communityId, setCommunityId] = useState("");
  const [channelId, setChannelId] = useState("");

  const communitiesQuery = useQuery<ManagedCommunity[]>({
    queryKey: ["/api/communities/owned"],
    queryFn: async () => (await apiRequest("GET", "/api/communities/owned")).json(),
  });
  const eventQuery = useQuery<EventDetail>({
    queryKey: ["/api/events", eventId],
    enabled: Boolean(eventId),
    queryFn: async () =>
      (await apiRequest("GET", `/api/events/${eventId}`)).json(),
  });
  const communities = communitiesQuery.data ?? [];
  const selectedCommunityId = Number(communityId);
  const channelsQuery = useQuery<Channel[]>({
    queryKey: ["/api/communities", selectedCommunityId, "channels"],
    enabled: Number.isInteger(selectedCommunityId) && selectedCommunityId > 0,
    queryFn: async () => (await apiRequest("GET", `/api/communities/${selectedCommunityId}/channels`)).json(),
  });
  const channels = channelsQuery.data ?? [];
  const selectedCommunity = useMemo(() => communities.find((community) => community.id === selectedCommunityId), [communities, selectedCommunityId]);
  const selectedChannel = useMemo(() => channels.find((channel) => channel.id === Number(channelId)), [channels, channelId]);

  useEffect(() => {
    const event = eventQuery.data;
    if (!event || hydratedEventId === event.id) return;
    setName(event.name);
    setDateTime(localDateTimeValue(event.dateTime));
    setEventLocation(event.location ?? "");
    setDescription(event.description);
    setCommunityId(String(event.communityId));
    setChannelId(event.channelId ? String(event.channelId) : "");
    setExistingCoverUrl(event.coverUrl);
    setHydratedEventId(event.id);
  }, [eventQuery.data, hydratedEventId]);

  useEffect(() => {
    if (!eventId || channels.length === 0 || selectedChannel) return;
    const storedChannel = channels.find(
      (channel) => channel.id === eventQuery.data?.channelId,
    );
    setChannelId(String(storedChannel?.id ?? channels[0].id));
  }, [channels, eventId, eventQuery.data?.channelId, selectedChannel]);

  useEffect(() => () => {
    if (coverPreview) URL.revokeObjectURL(coverPreview);
  }, [coverPreview]);

  const uploadEventCover = async () => {
    if (!coverFile) return null;
    const intent = (await (await apiRequest("POST", "/api/assets/upload-intents", {
      kind: "photo",
      filename: coverFile.name,
      mimeType: coverFile.type,
      sizeBytes: coverFile.size,
      visibility: "public",
    })).json()) as AssetUploadIntent;
    try {
      const stored = await fetch(intent.upload.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": coverFile.type },
        body: coverFile,
      });
      if (!stored.ok) throw new Error("Cover storage did not accept this image");
      const completed = (await (await apiRequest("POST", `/api/assets/${intent.asset.id}/complete`, {})).json()) as CompletedAsset;
      if (!completed.asset.publicUrl) throw new Error("Cover storage returned no public URL");
      return completed.asset.publicUrl;
    } catch (error) {
      await apiRequest("DELETE", `/api/assets/${intent.asset.id}`).catch(() => undefined);
      throw error;
    }
  };

  const saveEvent = useMutation({
    mutationFn: async () => {
      if (!user || !name.trim() || !dateTime || !selectedCommunity || !selectedChannel) {
        throw new Error("Complete the event details and choose a community channel.");
      }
      const uploadedCoverUrl = await uploadEventCover();
      const payload = {
        name: name.trim(),
        dateTime: new Date(dateTime).toISOString(),
        location: location.trim(),
        description: description.trim(),
        communityId: selectedCommunity.id,
        channelId: selectedChannel.id,
        coverUrl: uploadedCoverUrl ?? existingCoverUrl,
      };
      return (
        await apiRequest(
          eventId ? "PATCH" : "POST",
          eventId ? `/api/events/${eventId}` : "/api/events",
          payload,
        )
      ).json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/communities", selectedCommunityId, "events"] });
      if (eventId) queryClient.invalidateQueries({ queryKey: ["/api/events", eventId] });
      toast({
        title: eventId ? "Event updated" : "Event created",
        description: eventId
          ? "The schedule and community update are now live."
          : "Your community announcement has been published.",
      });
      setLocation(`/communities/${selectedCommunityId}`);
    },
    onError: (error: Error) => toast({ title: eventId ? "Could not update event" : "Could not create event", description: error.message, variant: "destructive" }),
  });

  const onCoverChange = (file?: File) => {
    if (!file) return;
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  };

  return (
    <main className="min-h-[calc(100dvh-3.5rem)] bg-black pb-24 text-white">
      <header className="flex h-16 items-center gap-2 border-b border-zinc-900 px-4">
        <Button variant="ghost" size="icon" className="-ml-2 text-white hover:bg-zinc-900 hover:text-white" onClick={() => setLocation(eventId && selectedCommunityId ? `/communities/${selectedCommunityId}` : "/create")} aria-label={eventId ? "Back to community" : "Back to create"}><ArrowLeft className="h-7 w-7" /></Button>
        <h1 className="text-2xl font-bold">{eventId ? "Edit Event" : "Create Event"}</h1>
      </header>
      <form className="mx-auto max-w-xl space-y-7 px-5 py-8" onSubmit={(event) => { event.preventDefault(); saveEvent.mutate(); }}>
        <section>
          <h2 className="text-2xl font-bold">Event Details</h2>
          <Label className="mt-7 block text-sm font-bold uppercase tracking-[0.16em] text-zinc-500">Cover image</Label>
          <button type="button" onClick={() => coverInputRef.current?.click()} className="mt-3 flex aspect-[16/9] w-full flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-zinc-800 bg-zinc-950 text-zinc-500 transition-colors hover:border-zinc-600">
            {coverPreview || existingCoverUrl ? <img src={coverPreview ?? existingCoverUrl ?? ""} alt="Event cover preview" className="h-full w-full object-cover" /> : <><ImagePlus className="h-10 w-10" /><span className="mt-3 text-lg font-medium">Upload Cover Image</span><span className="mt-1 text-xs">Optional · stored in your media library</span></>}
          </button>
          <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => onCoverChange(event.target.files?.[0])} />
        </section>

        <div><Label htmlFor="event-name" className="text-lg font-bold">Event Name</Label><Input id="event-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={160} placeholder="Give your event a name" className="mt-3 h-13 rounded-xl border-zinc-800 bg-zinc-950 px-4 text-lg text-white placeholder:text-zinc-600" /></div>
        <div><Label htmlFor="event-date" className="text-lg font-bold">Date &amp; Time</Label><div className="relative mt-3"><Input id="event-date" type="datetime-local" value={dateTime} onChange={(event) => setDateTime(event.target.value)} onInput={(event) => setDateTime(event.currentTarget.value)} className="h-13 rounded-xl border-zinc-800 bg-zinc-950 px-4 text-lg text-zinc-300 [color-scheme:dark]" /><CalendarDays className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" /></div></div>
        <div><Label htmlFor="event-location" className="text-lg font-bold">Location</Label><div className="relative mt-3"><Input id="event-location" value={location} onChange={(event) => setEventLocation(event.target.value)} maxLength={500} placeholder="Venue, room, or meeting URL" className="h-13 rounded-xl border-zinc-800 bg-zinc-950 px-4 text-lg text-white placeholder:text-zinc-600" /><MapPin className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500" /></div></div>
        <div><Label htmlFor="event-community" className="text-lg font-bold">Community</Label><Select value={communityId} onValueChange={(value) => { setCommunityId(value); setChannelId(""); }} disabled={Boolean(eventId)}><SelectTrigger id="event-community" className="mt-3 h-13 rounded-xl border-zinc-800 bg-zinc-950 px-4 text-lg"><SelectValue placeholder="Choose a community you manage" /></SelectTrigger><SelectContent>{communities.map((community) => <SelectItem key={community.id} value={String(community.id)}>{community.name}</SelectItem>)}</SelectContent></Select>{eventId && <p className="mt-2 text-xs text-zinc-500">An existing event stays attached to its community.</p>}{!communitiesQuery.isLoading && communities.length === 0 && <p className="mt-2 text-xs text-zinc-500">Create a community before scheduling its first event.</p>}</div>
        <div><Label htmlFor="event-channel" className="text-lg font-bold">Announcement channel</Label><Select value={channelId} onValueChange={setChannelId} disabled={!selectedCommunity || channels.length === 0}><SelectTrigger id="event-channel" className="mt-3 h-13 rounded-xl border-zinc-800 bg-zinc-950 px-4 text-lg"><SelectValue placeholder={selectedCommunity ? "Choose where to announce it" : "Choose a community first"} /></SelectTrigger><SelectContent>{channels.map((channel) => <SelectItem key={channel.id} value={String(channel.id)}>#{channel.name}</SelectItem>)}</SelectContent></Select>{channelsQuery.isError && <p className="mt-2 text-xs text-red-300">Channels could not be loaded.</p>}</div>
        <div><Label htmlFor="event-description" className="text-lg font-bold">Description</Label><Textarea id="event-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={10_000} placeholder="What is this event about?" className="mt-3 min-h-40 resize-none rounded-xl border-zinc-800 bg-zinc-950 p-4 text-lg text-white placeholder:text-zinc-600" /></div>
        <Button type="submit" className="h-14 w-full rounded-2xl bg-white text-xl font-bold text-black hover:bg-zinc-200" disabled={!name.trim() || !dateTime || !selectedCommunity || !selectedChannel || saveEvent.isPending || eventQuery.isLoading}>{eventId ? <Save className="mr-3 h-6 w-6" /> : <Send className="mr-3 h-6 w-6" />}{saveEvent.isPending ? "Saving…" : eventId ? "Save Event" : "Create Event"}</Button>
      </form>
    </main>
  );
}
