import { useState } from 'react';
import { X, Send, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/lib/stores';
import { ScrollArea } from '@/components/ui/scroll-area';

interface MessagePanelProps {
  onClose?: () => void;
}

const MessagePanel = ({ onClose }: MessagePanelProps) => {
  const { user } = useAuthStore();
  const [selectedChat, setSelectedChat] = useState<number | null>(null);
  
  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between">
        {selectedChat ? (
          <>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setSelectedChat(null)}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <h2 className="font-semibold">Chat</h2>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </>
        ) : (
          <>
            <h2 className="font-semibold text-lg">Messages</h2>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </>
        )}
      </div>
      
      {/* Content */}
      <ScrollArea className="flex-1 p-4">
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <p className="font-medium mb-1">Messaging functionality coming soon</p>
          <p className="text-gray-500 text-sm">Direct messages will be available in the next update</p>
        </div>
      </ScrollArea>
    </div>
  );
};

export default MessagePanel;