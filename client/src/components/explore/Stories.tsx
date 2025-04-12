import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Story, User } from '@/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';

const Stories = () => {
  const queryClient = useQueryClient();
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
        await fetch(`/api/stories/${story.id}/view`, {
          method: 'POST',
        });
        // Invalidate the stories query to refresh the view count
        queryClient.invalidateQueries({ queryKey: ['/api/stories'] });
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
          <DialogContent className="p-0 overflow-hidden bg-black border-0 shadow-none max-w-none h-screen w-screen rounded-none">
            <VisuallyHidden>
              <DialogTitle>Story from {selectedStory.user.displayName}</DialogTitle>
              <DialogDescription>
                Story content posted on {new Date(selectedStory.createdAt).toLocaleString()}
              </DialogDescription>
            </VisuallyHidden>
            
            <div className="fixed top-4 right-4 z-10">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-10 w-10 text-white p-0"
                onClick={handleStoryClose}
              >
                <X className="h-8 w-8" />
              </Button>
            </div>
            
            {/* Story content */}
            <div className="relative w-full h-screen flex items-center justify-center" style={{
              backgroundColor: '#000',
            }}>
              {/* Story image */}
              <img 
                src={selectedStory.mediaUrl} 
                alt={`Story by ${selectedStory.user.displayName}`}
                className="max-w-full max-h-[85vh] object-contain mx-auto" 
              />
              
              {/* Caption overlay */}
              {selectedStory.caption && (
                <div className="absolute bottom-20 left-0 right-0 p-6 text-white text-center bg-gradient-to-t from-black/70 to-transparent">
                  <p className="text-lg font-medium">{selectedStory.caption}</p>
                </div>
              )}
              
              {/* User info */}
              <div className="absolute top-4 left-4 right-20 p-4 flex items-center">
                <Avatar className="h-10 w-10 mr-3 border-2 border-primary">
                  <AvatarImage 
                    src={selectedStory.user.profileImageUrl} 
                    alt={selectedStory.user.displayName} 
                  />
                  <AvatarFallback>{selectedStory.user.displayName.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="text-white">
                  <div className="text-base font-semibold">{selectedStory.user.displayName}</div>
                  <div className="text-sm opacity-80">
                    {new Date(selectedStory.createdAt).toLocaleString(undefined, { 
                      hour: 'numeric', 
                      minute: 'numeric',
                      hour12: true
                    })}
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
