import React, { useState, useEffect } from 'react';
import { UserPlus, X, Search, ArrowLeft, User } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';

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
  const [showTagLabels, setShowTagLabels] = useState(false);
  const [taggingPosition, setTaggingPosition] = useState<{x: number, y: number} | null>(null);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const { toast } = useToast();
  
  // Reset tags when opening
  useEffect(() => {
    if (isOpen) {
      setTaggedUsers(initialTags);
    }
  }, [isOpen, initialTags]);
  
  // Sample users (in a real app, you would fetch these from an API)
  const sampleUsers = [
    { id: 1, username: 'user1', displayName: 'User One', profileImageUrl: 'https://i.pravatar.cc/150?img=1' },
    { id: 2, username: 'user2', displayName: 'User Two', profileImageUrl: 'https://i.pravatar.cc/150?img=2' },
    { id: 3, username: 'user3', displayName: 'User Three', profileImageUrl: 'https://i.pravatar.cc/150?img=3' },
    { id: 4, username: 'user4', displayName: 'User Four', profileImageUrl: 'https://i.pravatar.cc/150?img=4' },
  ];

  const filteredUsers = searchQuery 
    ? sampleUsers.filter(
        user => 
          user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
          user.displayName.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : sampleUsers;
  
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
    if (selectedUser) {
      // Get click position relative to the image container
      const rect = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      
      // Create new tag at clicked position
      const newTag: TaggedUser = {
        ...selectedUser,
        positionX: x,
        positionY: y
      };
      
      setTaggedUsers([...taggedUsers, newTag]);
      setSelectedUser(null);
      
      toast({
        title: "User tagged",
        description: `${selectedUser.displayName} has been tagged at the selected position.`
      });
    } else {
      // If not in tagging mode, toggle label visibility
      setShowTagLabels(!showTagLabels);
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
  
  if (!isOpen) return null;
  
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
        
        {/* Image preview */}
        <div className="relative flex-1 overflow-hidden flex items-center justify-center">
          {image ? (
            <div 
              className="relative w-full h-full"
              onClick={handleImageClick}
            >
              <img 
                src={image} 
                alt="Tag preview" 
                className="max-h-full w-full h-full object-contain cursor-pointer"
              />
              
              {/* Show tagging prompt when in tagging mode */}
              {selectedUser && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-black/50 text-white py-2 px-4 rounded-md">
                    Tap where you want to tag {selectedUser.displayName}
                  </div>
                </div>
              )}
              
              {/* Tagged users indicators with username labels */}
              {taggedUsers.map((user) => (
                <div key={user.id} className="relative">
                  {/* Instagram-style username initial tag marker */}
                  <div 
                    className="absolute w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center cursor-pointer transform -translate-x-1/2 -translate-y-1/2 shadow-md border border-white"
                    style={{ 
                      left: `${user.positionX * 100}%`, 
                      top: `${user.positionY * 100}%` 
                    }}
                    onClick={(e) => {
                      e.stopPropagation(); // Prevent toggling the labels
                      handleRemoveTag(user.id);
                    }}
                  >
                    <span className="text-xs font-semibold">{user.username.charAt(0).toUpperCase()}</span>
                  </div>
                  
                  {/* Username label (visible only when showTagLabels is true) */}
                  {showTagLabels && (
                    <div 
                      className="absolute bg-black/80 text-white py-1 px-3 text-sm transform -translate-x-1/2 whitespace-nowrap shadow-md"
                      style={{ 
                        left: `${user.positionX * 100}%`, 
                        top: `${user.positionY * 100 + 4}%`, // Position below the tag dot
                        zIndex: 20 
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        // In a real app, navigate to the user's profile
                        toast({
                          title: "Navigating",
                          description: `Going to @${user.username}'s profile`
                        });
                      }}
                    >
                      {user.username}
                    </div>
                  )}
                </div>
              ))}
              
              {/* No instructions overlay - cleaner interface */}
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <img 
                src="/placeholder-tshirt.jpg" 
                alt="Example item"
                className="max-w-full max-h-full object-contain cursor-pointer" 
                onClick={() => setShowTagLabels(!showTagLabels)}
              />
              
              {/* No instructions overlay */}
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