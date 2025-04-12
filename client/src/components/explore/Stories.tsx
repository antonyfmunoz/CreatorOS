import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Story, User } from '@/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { X, Heart, Send, Share, Music, Volume2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import StoryProgress from './StoryProgress';

const Stories = () => {
  const queryClient = useQueryClient();
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [currentUserStories, setCurrentUserStories] = useState<Story[]>([]);
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const progressInterval = useRef<NodeJS.Timeout | null>(null);
  const storyDuration = 5000; // 5 seconds per story
  
  // Track where the user clicks to navigate stories
  const storyContainerRef = useRef<HTMLDivElement>(null);
  
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
  
  // Start progress animation
  useEffect(() => {
    if (selectedStory && !isPaused) {
      setProgress(0);
      
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
      
      progressInterval.current = setInterval(() => {
        setProgress(prev => {
          if (prev >= 100) {
            // Move to next story when progress completes
            handleNextStory();
            return 0;
          }
          return prev + (100 / (storyDuration / 100));
        });
      }, 100);
      
      return () => {
        if (progressInterval.current) {
          clearInterval(progressInterval.current);
        }
      };
    }
  }, [selectedStory, currentStoryIndex, isPaused]);
  
  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
      }
    };
  }, []);
  
  // Handle story click
  const handleStoryClick = async (userId: number) => {
    if (storiesByUser && storiesByUser[userId]) {
      const userStories = storiesByUser[userId];
      setCurrentUserStories(userStories);
      setCurrentStoryIndex(0);
      setSelectedStory(userStories[0]);
      setProgress(0);
      
      // Increment view count
      try {
        await fetch(`/api/stories/${userStories[0].id}/view`, {
          method: 'POST',
        });
        // Invalidate the stories query to refresh the view count
        queryClient.invalidateQueries({ queryKey: ['/api/stories'] });
      } catch (error) {
        console.error('Failed to increment view count:', error);
      }
    }
  };
  
  // Handle navigation based on click position
  const handleNavigationClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!storyContainerRef.current) return;
    
    const containerWidth = storyContainerRef.current.clientWidth;
    const clickX = e.clientX;
    
    // If clicked on the left 1/3 of the screen
    if (clickX < containerWidth / 3) {
      handlePreviousStory();
    } 
    // If clicked on the right 2/3 of the screen
    else {
      handleNextStory();
    }
  };
  
  // Handle previous story
  const handlePreviousStory = () => {
    if (currentStoryIndex > 0) {
      setCurrentStoryIndex(prev => prev - 1);
      setProgress(0);
    }
  };
  
  // Handle next story
  const handleNextStory = async () => {
    if (currentUserStories.length > currentStoryIndex + 1) {
      // Move to next story in current user's stories
      const nextIndex = currentStoryIndex + 1;
      setCurrentStoryIndex(nextIndex);
      setProgress(0);
      
      // Increment view count for the next story
      try {
        await fetch(`/api/stories/${currentUserStories[nextIndex].id}/view`, {
          method: 'POST',
        });
        queryClient.invalidateQueries({ queryKey: ['/api/stories'] });
      } catch (error) {
        console.error('Failed to increment view count:', error);
      }
    } else {
      // Close the story or find next user with stories
      handleStoryClose();
    }
  };
  
  // Toggle pause on hold
  const handleHold = () => {
    setIsPaused(true);
  };
  
  // Resume on release
  const handleRelease = () => {
    setIsPaused(false);
  };
  
  // Update selected story when story index changes
  useEffect(() => {
    if (currentUserStories.length > 0 && currentStoryIndex >= 0 && currentStoryIndex < currentUserStories.length) {
      setSelectedStory(currentUserStories[currentStoryIndex]);
    }
  }, [currentStoryIndex, currentUserStories]);
  
  // Handle story close
  const handleStoryClose = () => {
    setSelectedStory(null);
    setCurrentUserStories([]);
    setCurrentStoryIndex(0);
    setProgress(0);
    
    // Clear any running interval
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
      progressInterval.current = null;
    }
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
          <DialogContent className="story-dialog p-0 overflow-hidden bg-black border-0 shadow-none max-w-none h-screen w-screen rounded-none">
            <VisuallyHidden>
              <DialogTitle>Story from {selectedStory.user.displayName}</DialogTitle>
              <DialogDescription>
                Story content posted on {new Date(selectedStory.createdAt).toLocaleString()}
              </DialogDescription>
            </VisuallyHidden>
            
            {/* Close button (X with no background) */}
            <X 
              className="absolute top-4 right-4 z-50 h-10 w-10 text-white cursor-pointer hover:text-gray-300" 
              onClick={handleStoryClose}
              strokeWidth={2}
            />
            
            {/* Interactive story container */}
            <div 
              ref={storyContainerRef}
              className="relative w-full h-screen bg-black flex flex-col" 
              onClick={handleNavigationClick}
              onMouseDown={handleHold}
              onMouseUp={handleRelease}
              onTouchStart={handleHold}
              onTouchEnd={handleRelease}
            >
              {/* Progress bar at top */}
              <div className="absolute top-0 left-0 right-0 z-20 pt-2 pb-4 px-2 bg-gradient-to-b from-black/60 to-transparent">
                <StoryProgress 
                  currentIndex={currentStoryIndex} 
                  totalStories={currentUserStories.length} 
                  progress={progress} 
                  duration={storyDuration}
                />
              </div>
              
              {/* User info */}
              <div className="absolute top-8 left-0 right-0 z-20 px-4 flex items-center justify-between">
                <div 
                  className="flex items-center cursor-pointer" 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStoryClose();
                    window.location.href = `/profile/${selectedStory.user.id}`;
                  }}
                >
                  <Avatar className="h-10 w-10 mr-3 border-2 border-white hover:border-primary transition-colors">
                    <AvatarImage 
                      src={selectedStory.user.profileImageUrl} 
                      alt={selectedStory.user.displayName} 
                    />
                    <AvatarFallback>{selectedStory.user.displayName.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div className="text-white">
                    <div className="text-base font-semibold hover:underline">{selectedStory.user.displayName}</div>
                    <div className="text-xs opacity-80">
                      {new Date(selectedStory.createdAt).toLocaleString(undefined, { 
                        hour: 'numeric', 
                        minute: 'numeric',
                        hour12: true
                      })}
                    </div>
                  </div>
                </div>
                
                {/* Optional audio indicator */}
                {selectedStory.hasAudio && (
                  <div className="flex items-center text-white text-sm space-x-2">
                    <Music className="h-4 w-4" />
                    <span className="font-medium">Audio playing</span>
                    <Volume2 className="h-4 w-4" />
                  </div>
                )}
              </div>
              
              {/* Story media content */}
              <div className="flex-1 flex items-center justify-center">
                <img 
                  src={selectedStory.mediaUrl} 
                  alt={`Story by ${selectedStory.user.displayName}`}
                  className="max-w-full max-h-[85vh] object-contain mx-auto"
                />
              </div>
              
              {/* Caption overlay */}
              {selectedStory.caption && (
                <div className="absolute bottom-24 left-0 right-0 px-6 py-4 text-white text-center bg-gradient-to-t from-black/70 to-transparent">
                  <p className="text-lg font-medium drop-shadow-md">{selectedStory.caption}</p>
                </div>
              )}
              
              {/* Footer with input and action buttons */}
              <div className="absolute bottom-0 left-0 right-0 z-20 p-4 bg-gradient-to-t from-black/60 to-transparent">
                <div className="flex items-center space-x-3">
                  <div 
                    className="bg-white/10 border-0 text-white placeholder:text-white/60 h-12 rounded-full px-5 flex-1 flex items-center cursor-pointer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="text-white/60">Send message...</span>
                  </div>
                  <div className="flex items-center space-x-4 text-white">
                    <div onClick={(e) => e.stopPropagation()}>
                      <Heart className="h-6 w-6 cursor-pointer hover:text-red-500 transition-colors" />
                    </div>
                    <div onClick={(e) => e.stopPropagation()}>
                      <Send className="h-6 w-6 cursor-pointer hover:text-blue-400 transition-colors" />
                    </div>
                    <div onClick={(e) => e.stopPropagation()}>
                      <Send className="h-6 w-6 cursor-pointer hover:text-green-400 transition-colors transform rotate-90" />
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Left/right tap areas (invisible) */}
              <div className="absolute inset-0 z-10 flex pointer-events-none">
                <div className="w-1/3 h-full" />
                <div className="w-2/3 h-full" />
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

export default Stories;
