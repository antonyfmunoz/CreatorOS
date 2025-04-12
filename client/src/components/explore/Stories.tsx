import { useQuery } from '@tanstack/react-query';
import { Story, User } from '@/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogClose,
} from '@/components/ui/dialog';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/queryClient';

const Stories = () => {
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  
  // Fetch stories
  const { data: stories, isLoading: storiesLoading } = useQuery<Story[]>({
    queryKey: ['/api/stories'],
  });
  
  // Fall back to users if there are no stories
  const { data: users, isLoading: usersLoading } = useQuery<User[]>({ 
    queryKey: ['/api/users'],
    enabled: !stories || stories.length === 0,
  });
  
  const isLoading = storiesLoading || ((!stories || stories.length === 0) && usersLoading);
  
  // Group stories by user
  const storiesByUser = stories?.reduce((acc, story) => {
    const userId = story.userId;
    if (!acc[userId]) {
      acc[userId] = [];
    }
    acc[userId].push(story);
    return acc;
  }, {} as Record<number, Story[]>);
  
  // Get unique users from stories
  const uniqueUsers = storiesByUser ? 
    Object.values(storiesByUser).map(userStories => userStories[0].user) : 
    users || [];
  
  const handleStoryClick = async (userId: number) => {
    if (storiesByUser && storiesByUser[userId]) {
      // Get the first story for the user
      const story = storiesByUser[userId][0];
      setSelectedStory(story);
      
      // Increment view count
      try {
        await apiRequest(`/api/stories/${story.id}/view`, {
          method: 'POST',
        });
      } catch (error) {
        console.error('Failed to increment view count:', error);
      }
    }
  };
  
  // Handle story close
  const handleStoryClose = () => {
    setSelectedStory(null);
  };
  
  if (isLoading) {
    return (
      <div className="overflow-x-auto scrollbar-hide mb-6">
        <div className="flex space-x-4">
          {Array(5).fill(0).map((_, i) => (
            <div key={i} className="flex flex-col items-center">
              <Skeleton className="w-16 h-16 rounded-full" />
              <Skeleton className="w-12 h-3 mt-1" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  
  return (
    <>
      <div className="overflow-x-auto scrollbar-hide mb-6 stories-container">
        <div className="flex space-x-4">
          {uniqueUsers.map((user) => (
            <div 
              key={user.id} 
              className="flex flex-col items-center cursor-pointer" 
              onClick={() => handleStoryClick(user.id)}
            >
              <div className={`w-16 h-16 rounded-full bg-gradient-to-r from-primary to-secondary p-0.5 ${
                storiesByUser && storiesByUser[user.id] ? 'opacity-100' : 'opacity-50'
              }`}>
                <Avatar className="w-full h-full border-2 border-white">
                  <AvatarImage 
                    src={user.profileImageUrl} 
                    alt={user.displayName} 
                    className="object-cover" 
                  />
                  <AvatarFallback>
                    {user.displayName.charAt(0)}
                  </AvatarFallback>
                </Avatar>
              </div>
              <span className="text-xs mt-1">{user.displayName.split(' ')[0]}</span>
            </div>
          ))}
        </div>
      </div>
      
      {/* Story Viewer Dialog */}
      {selectedStory && (
        <Dialog open={!!selectedStory} onOpenChange={handleStoryClose}>
          <DialogContent className="sm:max-w-md p-0 overflow-hidden bg-transparent border-0 shadow-none">
            <div className="relative w-full max-h-[80vh] overflow-hidden rounded-lg">
              <DialogClose className="absolute right-2 top-2 z-10">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 rounded-full bg-black/40 hover:bg-black/60 text-white"
                >
                  <X className="h-4 w-4" />
                </Button>
              </DialogClose>
              
              {/* Story content */}
              <div className="relative overflow-hidden" style={{
                backgroundColor: selectedStory.backgroundColor || '#000',
                minHeight: '60vh',
              }}>
                {selectedStory.imageUrl && (
                  <img 
                    src={selectedStory.imageUrl} 
                    alt="Story" 
                    className="w-full h-auto object-contain mx-auto" 
                  />
                )}
                
                {/* Text overlay */}
                {selectedStory.text && (
                  <div className="absolute bottom-0 left-0 right-0 p-4 text-white text-center bg-gradient-to-t from-black/60 to-transparent">
                    {selectedStory.text}
                  </div>
                )}
                
                {/* User info */}
                <div className="absolute top-0 left-0 right-0 p-4 flex items-center">
                  <Avatar className="h-8 w-8 mr-2">
                    <AvatarImage 
                      src={selectedStory.user.profileImageUrl} 
                      alt={selectedStory.user.displayName} 
                    />
                    <AvatarFallback>{selectedStory.user.displayName.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="text-white">
                    <div className="text-sm font-semibold">{selectedStory.user.displayName}</div>
                    <div className="text-xs opacity-70">
                      {new Date(selectedStory.createdAt).toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

export default Stories;
