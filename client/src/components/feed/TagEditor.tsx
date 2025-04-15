import React, { useState, useEffect } from 'react';
import { UserPlus, X } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
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
    // In a real implementation, you'd let the user tap on the image to set the position
    // For now, just place tags at random spots
    const newTag: TaggedUser = {
      ...user,
      positionX: Math.random(),
      positionY: Math.random()
    };
    
    // Check if user is already tagged
    if (taggedUsers.some(tagged => tagged.id === user.id)) {
      toast({
        title: "User already tagged",
        description: `${user.displayName} is already tagged in this photo.`
      });
      return;
    }
    
    setTaggedUsers([...taggedUsers, newTag]);
    setSearchQuery('');
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
            <div className="relative w-full h-full">
              <img 
                src={image} 
                alt="Tag preview" 
                className="max-h-full w-full h-full object-contain"
              />
              
              {/* Tagged users indicators */}
              {taggedUsers.map((user) => (
                <div 
                  key={user.id}
                  className="absolute w-6 h-6 bg-primary text-white rounded-full flex items-center justify-center cursor-pointer transform -translate-x-1/2 -translate-y-1/2"
                  style={{ 
                    left: `${user.positionX * 100}%`, 
                    top: `${user.positionY * 100}%` 
                  }}
                  onClick={() => handleRemoveTag(user.id)}
                >
                  <span className="text-xs">{user.username.charAt(0).toUpperCase()}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <img 
                src="/placeholder-tshirt.jpg" 
                alt="Example item"
                className="max-w-full max-h-full object-contain" 
              />
            </div>
          )}
        </div>
        
        {/* Bottom action area */}
        <div className="p-4 border-t">
          <Button 
            variant="outline" 
            className="w-full justify-center gap-2 bg-background text-foreground border-border"
            onClick={() => {
              // In a real app, you'd show a user search/selection interface here
              toast({
                title: "Invite collaborators",
                description: "You can invite others to collaborate on this post."
              });
            }}
          >
            <UserPlus size={18} />
            <span>Invite collaborators</span>
          </Button>
        </div>
      </div>
    </div>
  );
};