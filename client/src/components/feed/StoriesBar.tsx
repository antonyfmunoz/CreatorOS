import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';

// Define the User type inline to avoid import issues
interface User {
  id: number;
  displayName: string;
  username: string;
  profileImageUrl?: string | null;
}

interface StoriesBarProps {
  onStoryClick?: (userId: number) => void;
}

export const StoriesBar = ({ onStoryClick }: StoriesBarProps) => {
  // Fetch users who you are following
  const { data: followingUsers, isLoading } = useQuery<User[]>({
    queryKey: ['/api/users'],
    queryFn: async () => {
      // For demo purposes, we'll use all users since we may not have a following API endpoint yet
      const response = await fetch('/api/users');
      if (!response.ok) throw new Error('Failed to fetch users');
      return response.json();
    }
  });

  if (isLoading) {
    return (
      <div className="py-3 mb-4">
        <ScrollArea className="w-full whitespace-nowrap">
          <div className="flex space-x-4 px-4">
            {Array(5).fill(0).map((_, i) => (
              <div key={i} className="flex flex-col items-center">
                <Skeleton className="w-16 h-16 rounded-full" />
                <Skeleton className="w-12 h-3 mt-1" />
              </div>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
    );
  }

  if (!followingUsers || followingUsers.length === 0) {
    return null; // Don't show stories bar if not following anyone
  }

  return (
    <div className="py-3 mb-4">
      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex space-x-4 px-4">
          {followingUsers.map((user) => (
            <div 
              key={user.id}
              className="flex flex-col items-center cursor-pointer"
              onClick={() => onStoryClick && onStoryClick(user.id)}
            >
              <div className="w-16 h-16 rounded-full bg-gradient-to-r from-primary to-secondary p-0.5">
                <Avatar className="w-full h-full border-2 border-white">
                  <AvatarImage
                    src={user.profileImageUrl || undefined}
                    alt={user.displayName}
                    className="object-cover"
                  />
                  <AvatarFallback>{user.displayName.charAt(0)}</AvatarFallback>
                </Avatar>
              </div>
              <span className="text-xs mt-1 truncate w-16 text-center">
                {user.displayName.split(' ')[0]}
              </span>
            </div>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
};