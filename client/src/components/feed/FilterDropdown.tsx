import { Filter } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export type ContentFilterType = "all" | "photo" | "video" | "text" | "audio";

interface FilterDropdownProps {
  selectedFilter: ContentFilterType;
  onSelect: (filter: ContentFilterType) => void;
}

export const FilterDropdown = ({ selectedFilter, onSelect }: FilterDropdownProps) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon">
          <Filter className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-40">
        <DropdownMenuLabel>Filter by</DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        <DropdownMenuCheckboxItem
          checked={selectedFilter === "all"}
          onCheckedChange={() => onSelect("all")}
        >
          All Content
        </DropdownMenuCheckboxItem>
        
        <DropdownMenuCheckboxItem
          checked={selectedFilter === "video"}
          onCheckedChange={() => onSelect("video")}
        >
          Videos
        </DropdownMenuCheckboxItem>
        
        <DropdownMenuCheckboxItem
          checked={selectedFilter === "photo"}
          onCheckedChange={() => onSelect("photo")}
        >
          Photos
        </DropdownMenuCheckboxItem>
        
        <DropdownMenuCheckboxItem
          checked={selectedFilter === "text"}
          onCheckedChange={() => onSelect("text")}
        >
          Text
        </DropdownMenuCheckboxItem>
        
        <DropdownMenuCheckboxItem
          checked={selectedFilter === "audio"}
          onCheckedChange={() => onSelect("audio")}
        >
          Audio
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};