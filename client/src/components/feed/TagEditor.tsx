import React, { useState, useEffect } from 'react';
import { UserPlus, X, Search, ArrowLeft, User } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';

interface TagEditorProps {
  isOpen: boolean;
  onClose: () => void;
  image?: string;
  onTagSave: (taggedUsers: TaggedUser[]) => void;
  initialTags?: TaggedUser[];
}

export interface TaggedUser {
  id: number;
  username: string;
  displayName: string;
  profileImageUrl?: string;
  // Position within the image as percentage (0-1)
  positionX: number;
  positionY: number;
}

export const TagEditor = ({ isOpen, onClose, image, onTagSave, initialTags = [] }: TagEditorProps) => {
  const [taggedUsers, setTaggedUsers] = useState<TaggedUser[]>(initialTags);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchView, setIsSearchView] = useState(false);
  const [taggingPosition, setTaggingPosition] = useState<{x: number, y: number} | null>(null);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const { toast } = useToast();
  
  // Reset tags when opening
  useEffect(() => {
    if (isOpen) {
      setTaggedUsers(initialTags);
    }
  }, [isOpen, initialTags]);
  
  // Fetch real users from the database
  const { data: users = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/users'],
    queryFn: async () => {
      const res = await fetch('/api/users');
      if (!res.ok) throw new Error('Failed to fetch users');
      return res.json();
    }
  });

  const filteredUsers = searchQuery 
    ? users.filter(
        user => 
          user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
          user.displayName.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : users;
  
  const handleAddTag = (user: any) => {
    // Store the selected user. We'll ask the user to tap where to place the tag
    setSelectedUser(user);
    
    // Check if user is already tagged
    if (taggedUsers.some(tagged => tagged.id === user.id)) {
      toast({
        title: "User already tagged",
        description: `${user.displayName} is already tagged in this photo.`
      });
      return;
    }
    
    toast({
      title: "Tap to place tag",
      description: "Tap on the image where you want to tag the user"
    });
    
    setSearchQuery('');
    setIsSearchView(false);
  };
  
  const handleImageClick = (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
    console.log("Image clicked");
    
    if (selectedUser) {
      // Find the img element with the specific id and get its position
      const imgElement = document.getElementById('tag-image');
      if (!imgElement) {
        console.error("Image element with id 'tag-image' not found");
        return;
      }

      const imgRect = imgElement.getBoundingClientRect();
      
      // Calculate position relative to the image, not the container
      let x = (e.clientX - imgRect.left) / imgRect.width;
      let y = (e.clientY - imgRect.top) / imgRect.height;
      
      // Clamp values between 0 and 1
      x = Math.max(0, Math.min(1, x));
      y = Math.max(0, Math.min(1, y));
      
      console.log("Tag position calculated:", { 
        x, y, 
        imgRect, 
        clientX: e.clientX, 
        clientY: e.clientY,
        imageWidth: imgRect.width,
        imageHeight: imgRect.height
      });
      
      // Store the position first
      setTaggingPosition({ x, y });
      
      // Create new tag at clicked position
      const newTag: TaggedUser = {
        ...selectedUser,
        positionX: x,
        positionY: y
      };
      
      // Add the new tag to the list
      const updatedTags = [...taggedUsers, newTag];
      setTaggedUsers(updatedTags);
      
      // Clear the selected user
      setSelectedUser(null);
      
      console.log("Tag added at position:", { x, y });
      console.log("Updated tags:", updatedTags);
      
      toast({
        title: "User tagged",
        description: `${selectedUser.displayName} has been tagged at the selected position.`
      });
    } else {
      // If not in tagging mode, we can optionally do something here.
      // For now, we'll just log that the image was clicked with no tags to add
      console.log("Image clicked, but no user selected for tagging");
    }
  };
  
  const handleRemoveTag = (userId: number) => {
    setTaggedUsers(taggedUsers.filter(user => user.id !== userId));
  };
  
  const handleSave = () => {
    onTagSave(taggedUsers);
    onClose();
    
    toast({
      title: "Tags saved",
      description: `Tagged ${taggedUsers.length} people in your post.`
    });
  };
  
  // Since we're using conditional rendering in PhotoUploader, 
  // we don't need to check isOpen here anymore
  
  // User search view
  if (isSearchView) {
    return (
      <div className="fixed inset-0 z-50 bg-background">
        <div className="flex flex-col h-full">
          {/* Search header */}
          <div className="flex items-center p-4 border-b">
            <button 
              onClick={() => setIsSearchView(false)} 
              className="p-1 rounded-full mr-3"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 w-full"
                autoFocus
              />
            </div>
          </div>
          
          {/* Search results */}
          <div className="flex-1 overflow-y-auto">
            {filteredUsers.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                No users found matching "{searchQuery}"
              </div>
            ) : (
              <div className="divide-y">
                {filteredUsers.map((user) => (
                  <div 
                    key={user.id}
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted"
                    onClick={() => {
                      handleAddTag(user);
                      setIsSearchView(false);
                    }}
                  >
                    <div className="flex items-center gap-3">
                      {user.profileImageUrl ? (
                        <Avatar className="h-10 w-10">
                          <img src={user.profileImageUrl} alt={user.displayName} />
                        </Avatar>
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground">
                          <User className="h-5 w-5" />
                        </div>
                      )}
                      <div>
                        <div className="font-medium">{user.displayName}</div>
                        <div className="text-sm text-muted-foreground">@{user.username}</div>
                      </div>
                    </div>
                    {taggedUsers.some(tagged => tagged.id === user.id) && (
                      <div className="text-sm text-primary font-semibold">Tagged</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
  
  // Main tag editor view
  return (
    <div className="fixed inset-0 z-50 bg-background">
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b">
          <button onClick={onClose} className="p-1 rounded-full">
            <X className="h-6 w-6" />
          </button>
          <h2 className="text-lg font-medium">Edit tags</h2>
          <button onClick={handleSave} className="text-primary font-semibold px-2">
            Done
          </button>
        </div>
        
        {/* Image preview with relative positioning */}
        <div className="relative flex-1 overflow-hidden flex items-center justify-center">
          {image ? (
            <div 
              className="relative w-full h-full flex items-center justify-center" 
            >
              <div 
                className="relative" 
                style={{ maxWidth: '100%', maxHeight: '100%', position: 'relative', display: 'inline-block' }}
                onClick={handleImageClick}
              >
                <img 
                  id="tag-image"
                  src={image} 
                  alt="Tag preview" 
                  className="cursor-pointer"
                  style={{ display: 'block', maxWidth: '100%', maxHeight: '70vh', margin: '0 auto' }}
                />
                
                {/* Show tagging prompt when in tagging mode */}
                {selectedUser && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="bg-black/50 text-white py-2 px-4 rounded-md">
                      Tap where you want to tag {selectedUser.displayName}
                      <div className="text-xs mt-1 text-gray-300">
                        You can drag to move tags & double-click to remove them
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Tagged users indicators with username labels */}
                {taggedUsers.map((user) => (
                  <React.Fragment key={user.id}>
                    {/* Username tag marker */}
                    <div 
                      className="absolute bg-blue-600 text-white rounded-md py-1 px-2 flex items-center justify-center cursor-move transform -translate-x-1/2 -translate-y-1/2 shadow-md border border-white z-30"
                      style={{ 
                        position: 'absolute',
                        left: `${user.positionX * 100}%`, 
                        top: `${user.positionY * 100}%`,
                        pointerEvents: 'auto'
                      }}
                      onMouseDown={(e) => {
                        e.stopPropagation(); // Prevent toggling the labels
                        
                        // Set up for dragging with mouse
                        const startDrag = (moveEvent: MouseEvent) => {
                          const imgElement = document.getElementById('tag-image');
                          if (!imgElement) return;
                          
                          const imgRect = imgElement.getBoundingClientRect();
                          
                          // Calculate new position
                          let newX = (moveEvent.clientX - imgRect.left) / imgRect.width;
                          let newY = (moveEvent.clientY - imgRect.top) / imgRect.height;
                          
                          // Clamp values
                          newX = Math.max(0, Math.min(1, newX));
                          newY = Math.max(0, Math.min(1, newY));
                          
                          // Update the tag's position
                          const updatedTags = taggedUsers.map(taggedUser => 
                            taggedUser.id === user.id 
                              ? { ...taggedUser, positionX: newX, positionY: newY }
                              : taggedUser
                          );
                          
                          setTaggedUsers(updatedTags);
                        };
                        
                        // End drag
                        const endDrag = () => {
                          document.removeEventListener('mousemove', startDrag);
                          document.removeEventListener('mouseup', endDrag);
                        };
                        
                        // Add event listeners
                        document.addEventListener('mousemove', startDrag);
                        document.addEventListener('mouseup', endDrag);
                      }}
                      onTouchStart={(e) => {
                        // Store the start time as a data attribute for long press detection
                        e.currentTarget.setAttribute('data-touch-start-time', new Date().getTime().toString());
                        
                        e.stopPropagation(); // Prevent other handlers
                        
                        // Set up for dragging with touch
                        const startTouchDrag = (touchEvent: TouchEvent) => {
                          if (touchEvent.touches.length === 0) return;
                          
                          const touch = touchEvent.touches[0];
                          const imgElement = document.getElementById('tag-image');
                          if (!imgElement) return;
                          
                          const imgRect = imgElement.getBoundingClientRect();
                          
                          // Calculate new position
                          let newX = (touch.clientX - imgRect.left) / imgRect.width;
                          let newY = (touch.clientY - imgRect.top) / imgRect.height;
                          
                          // Clamp values
                          newX = Math.max(0, Math.min(1, newX));
                          newY = Math.max(0, Math.min(1, newY));
                          
                          // Update tag position
                          const updatedTags = taggedUsers.map(taggedUser => 
                            taggedUser.id === user.id 
                              ? { ...taggedUser, positionX: newX, positionY: newY }
                              : taggedUser
                          );
                          
                          setTaggedUsers(updatedTags);
                        };
                        
                        // End touch drag
                        const endTouchDrag = () => {
                          document.removeEventListener('touchmove', startTouchDrag);
                          document.removeEventListener('touchend', endTouchDrag);
                        };
                        
                        // Add touch event listeners
                        document.addEventListener('touchmove', startTouchDrag);
                        document.addEventListener('touchend', endTouchDrag);
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        handleRemoveTag(user.id);
                      }}
                      onTouchEnd={(e) => {
                        // For mobile: implement a long press to remove
                        if (e.changedTouches.length > 0) {
                          const touchEndTime = new Date().getTime();
                          const longPressThreshold = 500; // ms
                          
                          // If we have the touchStartTime stored as a data attribute
                          const touchStartTime = parseInt(e.currentTarget.getAttribute('data-touch-start-time') || '0', 10);
                          
                          if (touchEndTime - touchStartTime > longPressThreshold) {
                            e.stopPropagation();
                            handleRemoveTag(user.id);
                            
                            toast({
                              title: "Tag removed",
                              description: `Removed tag for ${user.username}`
                            });
                          }
                        }
                      }}
                    >
                      <span className="text-xs font-semibold">{user.username}</span>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <img 
                src="/placeholder-tshirt.jpg" 
                alt="Example item"
                className="max-w-full max-h-full object-contain cursor-pointer" 
              />
            </div>
          )}
        </div>
        
        {/* Bottom action area */}
        <div className="p-4 border-t">
          <Button 
            variant="outline" 
            className="w-full justify-center gap-2 bg-background text-foreground border-border"
            onClick={() => setIsSearchView(true)}
          >
            <UserPlus size={18} />
            <span>Tag users</span>
          </Button>
        </div>
      </div>
    </div>
  );
};