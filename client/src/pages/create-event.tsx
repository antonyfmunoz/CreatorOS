import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarDays, ImagePlus, MapPin, Send } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Channel, Community } from "@/types";

export default function CreateEventPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [dateTime, setDateTime] = useState("");
  const [location, setEventLocation] = useState("");
  const [description, setDescription] = useState("");
  const [communityId, setCommunityId] = useState<string>("");
  const { data: communities = [] } = useQuery<Community[]>({ queryKey: ["/api/communities"] });
  const selectedCommunityId = Number(communityId);
  const { data: channels = [] } = useQuery<Channel[]>({
    queryKey: ["/api/communities", selectedCommunityId, "channels"],
    enabled: Number.isInteger(selectedCommunityId) && selectedCommunityId > 0,
    queryFn: async () => {
      const response = await fetch(`/api/communities/${selectedCommunityId}/channels`);
      if (!response.ok) throw new Error("Failed to load community channels");
      return response.json();
    },
  });
  const selectedCommunity = useMemo(() => communities.find((community) => community.id === selectedCommunityId), [communities, selectedCommunityId]);

  const createEvent = useMutation({
    mutationFn: async () => {
      if (!user || !name.trim() || !dateTime || !selectedCommunity || !channels[0]) throw new Error("Complete the event details and choose a community.");
      const event = { id: crypto.randomUUID(), name: name.trim(), dateTime, location: location.trim(), description: description.trim(), communityId: selectedCommunity.id, communityName: selectedCommunity.name, coverUrl };
      const saved = JSON.parse(localStorage.getItem("creatoros-events") ?? "[]");
      localStorage.setItem("creatoros-events", JSON.stringify([event, ...saved]));
      const schedule = new Date(dateTime).toLocaleString();
      await apiRequest("POST", "/api/channel-messages", { channelId: channels[0].id, userId: user.id, content: `📅 ${event.name}\n${schedule}${event.location ? ` · ${event.location}` : ""}${event.description ? `\n${event.description}` : ""}`, isPinned: true });
    },
    onSuccess: () => {
      toast({ title: "Event created", description: "Your community announcement has been published." });
      setLocation(`/communities/${selectedCommunityId}`);
    },
    onError: (error) => toast({ title: "Could not create event", description: error.message, variant: "destructive" }),
  });

  const onCoverChange = (file?: File) => {
    if (!file) return;
    if (coverUrl) URL.revokeObjectURL(coverUrl);
    setCoverUrl(URL.createObjectURL(file));
  };

  return (
    <main className="min-h-[calc(100dvh-3.5rem)] bg-black pb-24 text-white">
      <header className="flex h-16 items-center gap-2 border-b border-blue-950 px-4">
        <Button variant="ghost" size="icon" className="-ml-2 text-white hover:bg-zinc-900 hover:text-white" onClick={() => setLocation("/create")} aria-label="Back to create"><ArrowLeft className="h-7 w-7" /></Button>
        <h1 className="text-2xl font-bold">Create Event</h1>
      </header>
      <form className="space-y-7 px-5 py-8" onSubmit={(event) => { event.preventDefault(); createEvent.mutate(); }}>
        <section>
          <h2 className="text-2xl font-bold">Event Details</h2>
          <Label className="mt-7 block text-sm font-bold uppercase tracking-[0.16em] text-slate-400">Cover image</Label>
          <button type="button" onClick={() => coverInputRef.current?.click()} className="mt-3 flex aspect-[16/9] w-full flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-700 bg-[#080c14] text-slate-400 transition-colors hover:border-slate-500">
            {coverUrl ? <img src={coverUrl} alt="Event cover preview" className="h-full w-full object-cover" /> : <><ImagePlus className="h-10 w-10" /><span className="mt-3 text-lg font-medium">Upload Cover Image</span></>}
          </button>
          <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => onCoverChange(event.target.files?.[0])} />
        </section>

        <div><Label htmlFor="event-name" className="text-lg font-bold">Event Name</Label><Input id="event-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Give your event a name" className="mt-3 h-13 rounded-xl border-slate-800 bg-[#080c14] px-4 text-lg placeholder:text-slate-500" /></div>
        <div><Label htmlFor="event-date" className="text-lg font-bold">Date &amp; Time</Label><div className="relative mt-3"><Input id="event-date" type="datetime-local" value={dateTime} onChange={(event) => setDateTime(event.target.value)} className="h-13 rounded-xl border-slate-800 bg-[#080c14] px-4 text-lg text-slate-300" /><CalendarDays className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /></div></div>
        <div><Label htmlFor="event-location" className="text-lg font-bold">Location / Channel</Label><div className="relative mt-3"><Input id="event-location" value={location} onChange={(event) => setEventLocation(event.target.value)} placeholder="Add location or choose a channel" className="h-13 rounded-xl border-slate-800 bg-[#080c14] px-4 text-lg placeholder:text-slate-500" /><MapPin className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /></div></div>
        <div><Label htmlFor="event-community" className="text-lg font-bold">Community</Label><Select value={communityId} onValueChange={setCommunityId}><SelectTrigger id="event-community" className="mt-3 h-13 rounded-xl border-slate-800 bg-[#080c14] px-4 text-lg"><SelectValue placeholder="Choose a community" /></SelectTrigger><SelectContent>{communities.map((community) => <SelectItem key={community.id} value={String(community.id)}>{community.name}</SelectItem>)}</SelectContent></Select></div>
        <div><Label htmlFor="event-description" className="text-lg font-bold">Description</Label><Textarea id="event-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What is this event about?" className="mt-3 min-h-40 resize-none rounded-xl border-slate-800 bg-[#080c14] p-4 text-lg placeholder:text-slate-500" /></div>
        <Button type="submit" className="h-14 w-full rounded-2xl bg-white text-xl font-bold text-black hover:bg-slate-200" disabled={createEvent.isPending}><Send className="mr-3 h-6 w-6" />{createEvent.isPending ? "Creating..." : "Create Event"}</Button>
      </form>
    </main>
  );
}
