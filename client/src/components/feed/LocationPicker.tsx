import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, MapPin, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

interface LocationPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (location: LocationData) => void;
}

export interface LocationData {
  name: string;
  postCount?: number;
}

const formatPostCount = (count: number) => `${count.toLocaleString()} post${count === 1 ? "" : "s"}`;

export const LocationPicker = ({ isOpen, onClose, onSelect }: LocationPickerProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedQuery = searchQuery.replace(/\s+/g, " ").trim();
  const locations = useQuery<LocationData[]>({
    queryKey: ["/api/locations", normalizedQuery],
    enabled: isOpen,
    queryFn: async () => {
      const response = await fetch(`/api/locations?q=${encodeURIComponent(normalizedQuery)}`);
      if (!response.ok) throw new Error("Locations could not be loaded");
      return response.json();
    },
    staleTime: 30_000,
  });
  const exactMatch = locations.data?.some((location) => location.name.toLowerCase() === normalizedQuery.toLowerCase());

  if (!isOpen) return null;

  const select = (location: LocationData) => {
    onSelect(location);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black text-white">
      <div className="mx-auto flex h-full w-full max-w-[720px] flex-col">
        <header className="flex h-14 items-center justify-between border-b border-zinc-800 px-4">
          <button type="button" onClick={onClose} className="rounded-full p-2 text-zinc-300 hover:bg-zinc-900 hover:text-white" aria-label="Close locations"><X className="h-5 w-5" /></button>
          <h2 className="text-lg font-bold">Add location</h2>
          <button type="button" onClick={onClose} className="px-2 text-sm font-semibold text-[#1d9bf0]">Cancel</button>
        </header>

        <div className="border-b border-zinc-800 px-4 py-3">
          <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" /><Input autoFocus aria-label="Search or enter a location" placeholder="Search or enter a location" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} maxLength={180} className="rounded-full border-0 bg-zinc-900 pl-10 text-white placeholder:text-zinc-500" /></div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {normalizedQuery && !exactMatch && <button type="button" className="flex w-full items-center gap-3 border-b border-zinc-800 px-4 py-4 text-left hover:bg-zinc-950" onClick={() => select({ name: normalizedQuery })}><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-900"><MapPin className="h-5 w-5 text-zinc-300" /></span><span className="min-w-0 flex-1"><span className="block truncate font-semibold">Use “{normalizedQuery}”</span><span className="mt-0.5 block text-xs text-zinc-500">Add this location to your post</span></span><ChevronRight className="h-5 w-5 text-zinc-600" /></button>}

          {locations.isLoading ? <div className="px-5 py-12 text-center text-sm text-zinc-500">Loading locations…</div> : locations.isError ? <div className="px-5 py-12 text-center"><p className="text-sm text-zinc-400">Existing locations could not be loaded.</p>{normalizedQuery && <p className="mt-2 text-xs text-zinc-600">You can still use the location you entered above.</p>}</div> : locations.data?.length ? locations.data.map((location) => <button type="button" key={location.name.toLowerCase()} className="flex w-full items-center gap-3 border-b border-zinc-900 px-4 py-4 text-left hover:bg-zinc-950" onClick={() => select(location)}><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-900"><MapPin className="h-5 w-5 text-zinc-400" /></span><span className="min-w-0 flex-1"><span className="block truncate font-medium">{location.name}</span>{location.postCount !== undefined && <span className="mt-0.5 block text-xs text-zinc-500">{formatPostCount(location.postCount)}</span>}</span><ChevronRight className="h-5 w-5 text-zinc-600" /></button>) : !normalizedQuery && <div className="mx-auto max-w-sm px-8 py-20 text-center"><MapPin className="mx-auto h-8 w-8 text-zinc-600" /><h3 className="mt-4 font-semibold">No locations used yet</h3><p className="mt-2 text-sm leading-6 text-zinc-500">Enter a city, venue, or place to add the first real location.</p></div>}
        </div>
      </div>
    </div>
  );
};
