import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/use-auth';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { StoryCreator } from './StoryCreator';

// Define the User type inline to avoid import issues
interface User {
  id: number;
  displayName: string;
  username: string;
  profileImageUrl?: string | null;
}

// Define the Story type inline
interface Story {
  id: number;
  userId: number;
  mediaUrl: string;
  mediaType: string;
  caption?: string;
  createdAt: string;
  expiresAt?: string;
  viewCount: number;
  user: User;
}

interface StoriesBarProps {
  onStoryClick?: (userId: number) => void;
}

export const StoriesBar = ({ onStoryClick }: StoriesBarProps) => {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [storyCreatorOpen, setStoryCreatorOpen] = useState(false);
  
  // Fetch all users
  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ['/api/users'],
  });
  
  // Fetch all stories with reduced staleTime for more frequent updates
  const { data: stories, isLoading: storiesLoading, refetch: refetchStories } = useQuery<Story[]>({
    queryKey: ['/api/stories'],
    staleTime: 0, // Set to 0 to always fetch fresh data
    refetchOnMount: true,
    refetchOnWindowFocus: true
  });
  
  // Always refetch stories data when component mounts
  useEffect(() => {
    refetchStories();
    console.log('Refreshing stories data on StoriesBar mount');
  }, [refetchStories]);
  
  const isLoading = usersLoading || storiesLoading;
  
  // Group stories by user
  const storiesByUser = stories?.reduce((acc, story) => {
    const userId = story.userId;
    if (!acc[userId]) {
      acc[userId] = [];
    }
    acc[userId].push(story);
    return acc;
  }, {} as Record<number, Story[]>) || {};
  
  // Functions for story creation
  const handleAddStory = () => {
    setStoryCreatorOpen(true);
  };
  
  if (isLoading) {
    return (
      <div className="py-3 mb-4">
        <div className="overflow-x-auto px-4">
          <div className="flex space-x-4">
            {/* Current user story skeleton */}
            <div className="flex flex-col items-center">
              <Skeleton className="w-16 h-16 rounded-full" />
              <Skeleton className="w-12 h-3 mt-1" />
            </div>
            
            {/* Other users stories skeletons */}
            {Array(4).fill(0).map((_, i) => (
              <div key={i} className="flex flex-col items-center">
                <Skeleton className="w-16 h-16 rounded-full" />
                <Skeleton className="w-12 h-3 mt-1" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!users || users.length === 0) {
    return null; // Don't show stories bar if there are no users
  }

  // Filter out the current user
  const otherUsers = users.filter(u => u.id !== currentUser?.id);
  
  // Check if current user has a story
  const hasCurrentUserStory = currentUser && storiesByUser[currentUser.id]?.length > 0;

  return (
    <>
      <div className="py-3 mb-4">
        <div className="overflow-x-auto px-4">
          <div className="flex space-x-4">
            {/* Current user's story or create story button */}
            {currentUser && (
              <div 
                className="flex flex-col items-center cursor-pointer"
                onClick={hasCurrentUserStory 
                  ? () => onStoryClick && onStoryClick(currentUser.id) 
                  : handleAddStory
                }
              >
                <div className={`w-16 h-16 rounded-full ${
                  hasCurrentUserStory 
                    ? 'bg-gradient-to-r from-primary to-secondary p-0.5' 
                    : ''
                }`}>
                  <Avatar className={`${hasCurrentUserStory ? 'w-full h-full border-2 border-white' : 'w-16 h-16'}`}>
                    <AvatarImage
                      src={currentUser.profileImageUrl || undefined}
                      alt={currentUser.displayName}
                      className="object-cover"
                    />
                    <AvatarFallback>{currentUser.displayName.charAt(0)}</AvatarFallback>
                  </Avatar>
                  
                  {/* Add story plus icon */}
                  {!hasCurrentUserStory && (
                    <div className="absolute bottom-0 right-0 w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center border-2 border-white">
                      <Plus className="w-4 h-4" />
                    </div>
                  )}
                </div>
                <span className="text-xs mt-1 truncate w-16 text-center">
                  Your story
                </span>
              </div>
            )}
            
            {/* Other users' stories - only show users with active stories */}
            {otherUsers
              .filter(user => storiesByUser[user.id]?.length > 0)
              .map((user) => (
                <div 
                  key={user.id}
                  className="flex flex-col items-center cursor-pointer"
                  onClick={() => onStoryClick && onStoryClick(user.id)}
                  data-user-id={user.id}
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
              ))
            }
          </div>
        </div>
      </div>
      
      {/* Story Creator Dialog */}
      {storyCreatorOpen && (
        <StoryCreator 
          isOpen={storyCreatorOpen}
          onClose={() => setStoryCreatorOpen(false)}
        />
      )}
    </>
  );
};