import { Filter } from "lucide-react";
import { 
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export type ContentFilterType = 'all' | 'video' | 'short' | 'photo' | 'thread' | 'audio';

interface FilterDropdownProps {
  selectedFilter: ContentFilterType;
  onSelect: (filter: ContentFilterType) => void;
}

export const FilterDropdown = ({ selectedFilter, onSelect }: FilterDropdownProps) => {
  const filters: { value: ContentFilterType; label: string }[] = [
    { value: 'all', label: 'All Content' },
    { value: 'video', label: 'Videos' },
    { value: 'short', label: 'Shorts' },
    { value: 'photo', label: 'Photos' },
    { value: 'thread', label: 'Threads' },
    { value: 'audio', label: 'Audio' },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9">
          <Filter className="h-5 w-5 text-black dark:text-white" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {filters.map((filter) => (
          <DropdownMenuCheckboxItem
            key={filter.value}
            checked={selectedFilter === filter.value}
            onCheckedChange={() => onSelect(filter.value)}
          >
            {filter.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};