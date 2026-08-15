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
import { X, Heart, Send, Share, Music, Volume2, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import StoryProgress from './StoryProgress';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { useMessaging } from '@/lib/stores';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { buildStoryShareUrl } from '@/lib/story-links';

interface StoriesProps {
  initialStoryId?: number | null;
}

const Stories = ({ initialStoryId = null }: StoriesProps) => {
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { user: currentUser } = useAuth();
  const { createConversation, sendMessage } = useMessaging();
  const { toast } = useToast();
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [currentUserStories, setCurrentUserStories] = useState<Story[]>([]);
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [message, setMessage] = useState("");
  const [storyFollowOverride, setStoryFollowOverride] = useState<boolean | null>(null);
  const [isSavingStoryFollow, setIsSavingStoryFollow] = useState(false);
  const [storyDeleteConfirmId, setStoryDeleteConfirmId] = useState<number | null>(null);
  const [isDeletingStory, setIsDeletingStory] = useState(false);
  const progressInterval = useRef<NodeJS.Timeout | null>(null);
  const openedInitialStoryId = useRef<number | null>(null);
  const storyDuration = 10000; // Gives viewers enough time to react, follow, or reply.
  
  // Track where the user clicks to navigate stories
  const storyContainerRef = useRef<HTMLDivElement>(null);

  const handleStoryMessage = async () => {
    if (!selectedStory || !message.trim()) return;
    if (!currentUser) {
      toast({ title: 'Sign in required', description: 'Sign in to message this creator.', variant: 'destructive' });
      return;
    }
    if (selectedStory.user.id === currentUser.id) return;

    try {
      const conversationId = await createConversation([currentUser.id, selectedStory.user.id]);
      await sendMessage(conversationId, currentUser.id, message.trim());
      setMessage('');
      toast({ title: 'Message sent', description: `Your message was sent to ${selectedStory.user.displayName}.` });
    } catch {
      toast({ title: 'Message failed', description: 'Please try again.', variant: 'destructive' });
    }
  };

  const isViewingOwnStory = !!selectedStory && selectedStory.user.id === currentUser?.id;
  const { data: followStatusFromServer = false } = useQuery<boolean>({
    queryKey: ['/api/users/is-following', currentUser?.id, selectedStory?.user.id],
    enabled: !!currentUser && !!selectedStory && !isViewingOwnStory,
    queryFn: async () => {
      const response = await fetch(`/api/users/${currentUser!.id}/is-following/${selectedStory!.user.id}`);
      if (!response.ok) return false;
      return (await response.json()).isFollowing;
    },
  });

  const isFollowingStoryUser = storyFollowOverride ?? followStatusFromServer;

  const toggleStoryFollow = async () => {
    if (!selectedStory || isSavingStoryFollow) return;
    const shouldFollow = !isFollowingStoryUser;
    setIsSavingStoryFollow(true);
    setStoryFollowOverride(shouldFollow);
    try {
      await apiRequest('POST', `/api/users/${selectedStory.user.id}/${shouldFollow ? 'follow' : 'unfollow'}`, {});
      queryClient.invalidateQueries({ queryKey: ['/api/users/is-following', currentUser?.id, selectedStory.user.id] });
      toast({
        title: shouldFollow ? 'Following' : 'Unfollowed',
        description: shouldFollow ? `You are now following ${selectedStory.user.displayName}.` : `You are no longer following ${selectedStory.user.displayName}.`,
      });
    } catch {
      setStoryFollowOverride(!shouldFollow);
      toast({ title: `Could not ${shouldFollow ? 'follow' : 'unfollow'} creator`, description: 'Please try again.', variant: 'destructive' });
    } finally {
      setIsSavingStoryFollow(false);
    }
  };

  const { data: storyReactions = [] } = useQuery<{ storyId: number }[]>({ queryKey: [`/api/users/${currentUser?.id}/story-reactions`], enabled: !!currentUser, queryFn: async () => { const response = await fetch(`/api/users/${currentUser!.id}/story-reactions`); if (!response.ok) throw new Error('Failed to load story reactions'); return response.json(); } });
  const likedStoryIds = storyReactions.map((reaction) => reaction.storyId);
  const toggleStoryReaction = async (storyId: number) => {
    const liked = likedStoryIds.includes(storyId);
    try {
      await apiRequest(liked ? 'DELETE' : 'POST', `/api/stories/${storyId}/reaction`, liked ? undefined : { reaction: 'heart' });
      queryClient.invalidateQueries({ queryKey: [`/api/users/${currentUser?.id}/story-reactions`] });
    } catch { toast({ title: 'Could not update reaction', description: 'Please try again.', variant: 'destructive' }); }
  };

  const shareStory = async () => {
    if (!selectedStory) return;
    const text = `${selectedStory.user.displayName}'s story on CreativesOS`;
    const url = buildStoryShareUrl(window.location.origin, selectedStory.id);
    try {
      if (navigator.share) {
        await navigator.share({ title: text, text, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast({ title: 'Story link copied', description: 'Share it anywhere.' });
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        toast({ title: 'Could not share story', description: 'Please try again.', variant: 'destructive' });
      }
    }
  };

  const deleteOwnStory = async () => {
    if (!selectedStory || !isViewingOwnStory || isDeletingStory) return;
    setIsDeletingStory(true);
    try {
      await apiRequest('DELETE', `/api/stories/${selectedStory.id}`);
      handleStoryClose();
      await queryClient.invalidateQueries({ queryKey: ['/api/stories'] });
      toast({ title: 'Story deleted', description: 'The story is no longer visible.' });
    } catch {
      toast({ title: 'Could not delete story', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setIsDeletingStory(false);
    }
  };
  
  // Fetch stories with aggressive settings to ensure freshness
  const { data: stories, isLoading: storiesLoading, refetch: refetchStories } = useQuery<Story[]>({
    queryKey: ['/api/stories'],
    staleTime: 0, // Set to 0 to always fetch fresh data
    gcTime: 1000, // Set to 1 second to effectively disable caching (cacheTime was renamed to gcTime in v5)
    refetchOnMount: "always", // Always refetch on mount
    refetchOnWindowFocus: true, // Refetch when window gets focus
    refetchInterval: 2000 // Refetch every 2 seconds when visible
  });
  
  // Always refresh stories data when component mounts or story is viewed
  useEffect(() => {
    refetchStories();
  }, [refetchStories]);
  
  const isLoading = storiesLoading;
  
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
  const uniqueUsers = storiesByUser ? Object.values(storiesByUser).map(userStories => userStories[0].user) : [];

  useEffect(() => {
    if (!initialStoryId || !storiesByUser || openedInitialStoryId.current === initialStoryId) return;
    const target = stories?.find((story) => story.id === initialStoryId);
    if (!target) return;
    const userStories = storiesByUser[target.userId] ?? [];
    const targetIndex = userStories.findIndex((story) => story.id === initialStoryId);
    if (targetIndex < 0) return;

    openedInitialStoryId.current = initialStoryId;
    setCurrentUserStories(userStories);
    setCurrentStoryIndex(targetIndex);
    setSelectedStory(userStories[targetIndex]);
    setProgress(0);
    void apiRequest('POST', `/api/stories/${initialStoryId}/view`, {}).then(() => {
      queryClient.invalidateQueries({ queryKey: ['/api/stories'] });
    }).catch(() => undefined);
  }, [initialStoryId, stories, storiesByUser, queryClient]);
  
  // Start progress animation
  useEffect(() => {
    if (selectedStory && !isPaused) {
      setProgress(0);
      
      if (progressInterval.current) {
        clearInterval(progressInterval.current);
        progressInterval.current = null;
      }
      
      // Create a new interval that advances the progress bar
      progressInterval.current = setInterval(() => {
        setProgress(prev => {
          const newProgress = prev + (100 / (storyDuration / 100));
          
          if (newProgress >= 100) {
            // Clear the interval when progress is complete
            clearInterval(progressInterval.current!);
            progressInterval.current = null;
            
            // Wait a moment to show the completed progress bar before transitioning
            setTimeout(() => {
              handleNextStory();
            }, 150);
            
            // Return exactly 100% to ensure the bar shows as completely filled
            return 100;
          }
          return newProgress;
        });
      }, 100);
      
      return () => {
        if (progressInterval.current) {
          clearInterval(progressInterval.current);
          progressInterval.current = null;
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

  useEffect(() => {
    setStoryFollowOverride(null);
    setStoryDeleteConfirmId(null);
  }, [selectedStory?.id]);
  
  // Handle story close
  const handleStoryClose = () => {
    // First clear the interval to prevent any race conditions
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
      progressInterval.current = null;
    }
    
    // Then reset all state variables
    setProgress(0);
    setIsPaused(false);
    setCurrentStoryIndex(0);
    setCurrentUserStories([]);
    setSelectedStory(null);
  };
  
  if (isLoading) {
    return (
      <div className="horizontal-rail mb-6">
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
      <div className="horizontal-rail mb-6 stories-container">
        <div className="flex space-x-4">
          {uniqueUsers.map((user) => (
            <div 
              key={user.id} 
              className="flex flex-col items-center cursor-pointer" 
              onClick={() => handleStoryClick(user.id)}
              data-user-id={user.id}
            >
              <div className={`w-16 h-16 rounded-full bg-gradient-to-r from-primary to-secondary p-0.5 ${
                storiesByUser && storiesByUser[user.id] ? 'opacity-100' : 'opacity-50'
              }`}>
                <Avatar className="w-full h-full border-2 border-white">
                  <AvatarImage 
                    src={user.profileImageUrl || ''} 
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
        <Dialog open={!!selectedStory} onOpenChange={(open) => { if (!open) handleStoryClose(); }}>
          <DialogContent className="story-dialog p-0 overflow-hidden bg-black border-0 shadow-none max-w-none h-screen w-screen rounded-none">
            <VisuallyHidden>
              <DialogTitle>Story from {selectedStory.user.displayName}</DialogTitle>
              <DialogDescription>
                Story content posted on {new Date(selectedStory.createdAt).toLocaleString()}
              </DialogDescription>
            </VisuallyHidden>
            
            {/* Close button (X with no background) */}
            <button
              type="button"
              aria-label="Close story"
              data-story-control
              className="absolute right-4 top-4 z-50 rounded-full p-2 text-white transition-colors hover:bg-white/10 hover:text-gray-300"
              onClick={(event) => { event.stopPropagation(); handleStoryClose(); }}
            >
              <X className="h-6 w-6" strokeWidth={2} />
            </button>
            
            {/* Interactive story container */}
               <div
                 ref={storyContainerRef}
                 className="relative w-full h-screen bg-black flex flex-col"
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
                <div className="absolute top-8 left-0 right-0 z-20 flex items-center justify-between gap-3 pl-4 pr-16">
                <button
                  type="button"
                  className="flex items-center rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  aria-label={`Open ${selectedStory.user.displayName}'s profile`}
                  data-story-control
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStoryClose();
                    // Navigate to user profile using wouter
                    setLocation(`/profile/${selectedStory.user.id}`);
                  }}
                >
                  <Avatar className="h-10 w-10 mr-3 border-2 border-white hover:border-primary transition-colors">
                    <AvatarImage 
                      src={selectedStory.user.profileImageUrl || ''} 
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
                </button>
                
                  <div className="ml-auto flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                    {selectedStory.hasAudio && (
                      <div className="hidden items-center rounded-full bg-black/35 px-2.5 py-1 text-xs text-white sm:flex">
                        <Music className="mr-1.5 h-3.5 w-3.5" />
                        <span className="max-w-24 truncate">Original audio</span>
                        <Volume2 className="ml-1.5 h-3.5 w-3.5" />
                      </div>
                    )}
                    {!isViewingOwnStory && (
                      <button
                        type="button"
                        aria-label={isFollowingStoryUser ? `Unfollow ${selectedStory.user.displayName}` : `Follow ${selectedStory.user.displayName}`}
                        className="rounded-full border border-white/75 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-white hover:text-black disabled:opacity-60"
                        disabled={isSavingStoryFollow}
                        onClick={(event) => {
                          event.stopPropagation();
                          void toggleStoryFollow();
                        }}
                      >
                        {isSavingStoryFollow ? 'Saving…' : isFollowingStoryUser ? 'Following' : 'Follow'}
                      </button>
                    )}
                    {isViewingOwnStory && storyDeleteConfirmId !== selectedStory.id && (
                      <button
                        type="button"
                        aria-label="Delete story"
                        className="rounded-full p-2 text-white transition-colors hover:bg-white/10"
                        onClick={(event) => {
                          event.stopPropagation();
                          setStoryDeleteConfirmId(selectedStory.id);
                        }}
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    )}
                    {isViewingOwnStory && storyDeleteConfirmId === selectedStory.id && (
                      <div className="flex items-center gap-2 rounded-full bg-black/70 px-2 py-1">
                        <button type="button" className="px-2 py-1 text-xs text-zinc-300" onClick={(event) => { event.stopPropagation(); setStoryDeleteConfirmId(null); }}>Cancel</button>
                        <button type="button" className="px-2 py-1 text-xs font-bold text-red-400" disabled={isDeletingStory} onClick={(event) => { event.stopPropagation(); void deleteOwnStory(); }}>{isDeletingStory ? 'Deleting…' : 'Confirm delete'}</button>
                      </div>
                    )}
                  </div>
                </div>
              
              {/* Story media content */}
              <div className="flex flex-1 items-center justify-center">
                {selectedStory.mediaType === 'text' ? (
                  <div className="mx-6 flex min-h-[60vh] w-full max-w-xl items-center justify-center rounded-[2rem] bg-gradient-to-br from-[#1d9bf0] via-violet-600 to-fuchsia-600 p-10 text-center shadow-2xl">
                    <p className="whitespace-pre-wrap text-3xl font-bold leading-tight text-white drop-shadow-lg sm:text-5xl">{selectedStory.caption}</p>
                  </div>
                ) : selectedStory.mediaType === 'video' ? (
                  <video src={selectedStory.mediaUrl} className="mx-auto max-h-[85vh] max-w-full object-contain" controls autoPlay playsInline />
                ) : selectedStory.mediaType === 'audio' ? (
                  <div className="mx-6 flex min-h-[50vh] w-full max-w-xl flex-col items-center justify-center rounded-[2rem] bg-gradient-to-br from-zinc-900 via-slate-900 to-[#1d9bf0] p-10 text-center shadow-2xl">
                    <Music className="mb-8 h-20 w-20 text-white" />
                    <p className="mb-8 text-2xl font-bold text-white">{selectedStory.caption || 'Voice story'}</p>
                    <audio src={selectedStory.mediaUrl} className="w-full" controls autoPlay />
                  </div>
                ) : (
                  <img
                    src={selectedStory.mediaUrl}
                    alt={`Story by ${selectedStory.user.displayName}`}
                    className="mx-auto max-h-[85vh] max-w-full object-contain"
                  />
                )}
              </div>
              
              {/* Caption overlay */}
              {selectedStory.caption && selectedStory.mediaType !== 'text' && (
                <div className="absolute bottom-24 left-0 right-0 px-6 py-4 text-white text-center bg-gradient-to-t from-black/70 to-transparent">
                  <p className="text-lg font-medium drop-shadow-md">{selectedStory.caption}</p>
                </div>
              )}
              
              {/* Footer with input and action buttons */}
              <div className="absolute bottom-0 left-0 right-0 z-20 p-4 bg-gradient-to-t from-black/60 to-transparent">
                <div className="flex items-center space-x-3">
                  {!isViewingOwnStory && <div
                    className="bg-white/10 border-0 text-white h-12 rounded-full px-5 flex-1 flex items-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Input
                      type="text"
                      placeholder="Send message..."
                      className="bg-transparent border-0 text-white placeholder:text-white/60 focus-visible:ring-0 focus-visible:ring-offset-0 h-full"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onFocus={() => setIsPaused(true)}
                      onBlur={() => setIsPaused(false)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && message.trim()) {
                          handleStoryMessage();
                          e.preventDefault();
                        }
                      }}
                    />
                  </div>}
                  <div className="flex items-center space-x-2 text-white">
                    {!isViewingOwnStory && <button type="button" aria-label={likedStoryIds.includes(selectedStory.id) ? 'Remove story reaction' : 'Like story'} aria-pressed={likedStoryIds.includes(selectedStory.id)} className="rounded-full p-2 transition-colors hover:bg-white/10" onClick={(event) => { event.stopPropagation(); toggleStoryReaction(selectedStory.id); }}>
                      <Heart className={`h-6 w-6 transition-colors ${likedStoryIds.includes(selectedStory.id) ? 'fill-rose-500 text-rose-500' : 'text-white'}`} />
                    </button>}
                    {!isViewingOwnStory && <button type="button" aria-label="Send story message" className="rounded-full p-2 transition-colors hover:bg-white/10" onClick={(event) => { event.stopPropagation(); void handleStoryMessage(); }}>
                      <Send className="h-6 w-6" />
                    </button>}
                    {isViewingOwnStory && <span className="mr-2 text-sm font-semibold">{selectedStory.viewCount.toLocaleString()} view{selectedStory.viewCount === 1 ? '' : 's'}</span>}
                    <button type="button" aria-label="Share story" className="rounded-full p-2 transition-colors hover:bg-white/10" onClick={(event) => { event.stopPropagation(); void shareStory(); }}>
                      <Share className="h-6 w-6" />
                    </button>
                  </div>
                </div>
              </div>
              
              {/* Tap zones stay behind the header and reply controls so their actions remain usable. */}
              <div className="absolute inset-0 z-10 flex" aria-hidden="true">
                <div className="h-full w-1/3" onClick={handlePreviousStory} />
                <div className="h-full w-2/3" onClick={handleNextStory} />
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

export default Stories;
