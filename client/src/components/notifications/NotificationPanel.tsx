import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

interface NotificationPanelProps {
  onClose?: () => void;
  userId?: number;
}

const NotificationPanel = ({ onClose }: NotificationPanelProps) => {
  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between">
        <h2 className="font-semibold text-lg">Notifications</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>
      
      {/* Content */}
      <ScrollArea className="flex-1 p-4">
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <p className="font-medium mb-1">No notifications yet</p>
          <p className="text-gray-500 text-sm">We'll notify you when something important happens</p>
        </div>
      </ScrollArea>
    </div>
  );
};

export default NotificationPanel;