import React, { useState } from 'react';
import { Input } from "@/components/ui/input";
import { X, ChevronRight, MapPin, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface LocationPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (location: LocationData) => void;
}

export interface LocationData {
  name: string;
  address?: string;
  postCount?: number;
  distance?: string;
}

// Sample location data - in a real app, this would come from an API
const sampleLocations: LocationData[] = [
  { name: "Portland, Oregon", postCount: 13000000, distance: "44km" },
  { name: "Gales Creek, Oregon", postCount: 5000, distance: "2.1km" },
  { name: "Portland Oregon", address: "Portland, Oregon", postCount: 222000, distance: "44km" },
  { name: "Beaverton, Oregon", postCount: 729000, distance: "36km" },
  { name: "Oregon Coast", postCount: 85100, distance: "44km" },
  { name: "The Ritz-Carlton, Portland", address: "900 SW Washington Street, Portland, Oregon", postCount: 1000, distance: "44km" },
  { name: "Liberty High School", address: "7445 NW Wagon Drive, Hillsboro, Oregon", postCount: 100, distance: "25.9km" },
  { name: "Oregon Zoo", address: "4001 SW Canyon Rd, Portland, Oregon", postCount: 270000, distance: "41km" },
  { name: "Roseland Theater", address: "8 NW 6th Ave, Portland, Oregon", postCount: 122000, distance: "44km" },
  { name: "My World", postCount: 0 },
  { name: "Keller Auditorium", address: "222 SW Clay St, Portland, Oregon", postCount: 79900, distance: "44km" },
  { name: "Cedar Hills, Oregon", postCount: 24100, distance: "35km" },
  { name: "Forest Park", postCount: 91800, distance: "39km" },
];

export const LocationPicker = ({ isOpen, onClose, onSelect }: LocationPickerProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

  const formatPostCount = (count: number): string => {
    if (count >= 1000000) {
      return `${Math.floor(count / 1000000)}M posts`;
    } else if (count >= 1000) {
      return `${Math.floor(count / 1000)}K posts`;
    } else if (count > 0) {
      return `${count} posts`;
    } else {
      return '';
    }
  };

  const filteredLocations = searchQuery 
    ? sampleLocations.filter(location => 
        location.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (location.address && location.address.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : sampleLocations;

  const handleSelectLocation = (location: LocationData) => {
    onSelect(location);
    toast({
      title: "Location Added",
      description: `Added ${location.name} to your post`,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background">
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b">
          <button 
            onClick={onClose}
            className="p-1 rounded-full"
          >
            <X className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-medium">Locations</h2>
          <button 
            onClick={onClose}
            className="text-primary font-semibold px-2"
          >
            Cancel
          </button>
        </div>

        {/* Search bar */}
        <div className="px-4 py-2 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-muted text-foreground placeholder:text-muted-foreground pl-10 rounded-lg border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
        </div>

        {/* Location list */}
        <div className="flex-1 overflow-y-auto">
          {filteredLocations.map((location, index) => (
            <button 
              key={index}
              className="w-full text-left px-4 py-3 hover:bg-muted border-b border-border last:border-b-0"
              onClick={() => handleSelectLocation(location)}
            >
              <div className="flex justify-between">
                <div>
                  <p className="text-foreground">{location.name}</p>
                  <div className="flex text-muted-foreground text-sm mt-1">
                    {location.postCount !== undefined && (
                      <span>{formatPostCount(location.postCount)}</span>
                    )}
                    {location.distance && (
                      <>
                        {location.postCount !== undefined && <span className="mx-1.5">•</span>}
                        <span>{location.distance}</span>
                      </>
                    )}
                    {location.address && (
                      <>
                        {(location.postCount !== undefined || location.distance) && <span className="mx-1.5">•</span>}
                        <span className="truncate max-w-[200px]">{location.address}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="self-center">
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};