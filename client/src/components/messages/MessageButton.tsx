import { useEffect } from 'react';
import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import MessagePanel from './MessagePanel';
import { useMessaging, useAuthStore } from '@/lib/stores';

const MessageButton = () => {
  const { isMessagePanelOpen, toggleMessagePanel, closeMessagePanel, conversations } = useMessaging();
  const { user } = useAuthStore();
  
  const unreadCount = conversations.reduce((total, conv) => total + (conv.unreadCount || 0), 0);
  
  // Close message panel when component unmounts
  useEffect(() => {
    return () => {
      closeMessagePanel();
    };
  }, [closeMessagePanel]);

  return (
    <Sheet open={isMessagePanelOpen} onOpenChange={toggleMessagePanel}>
      <SheetTrigger asChild>
        <Button 
          size="icon" 
          variant="outline" 
          className="bg-white/90 rounded-full relative mr-2"
        >
          <MessageSquare className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground rounded-full h-5 min-w-5 flex items-center justify-center px-1 text-xs font-medium">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="sm:max-w-md p-0 border-l">
        <MessagePanel onClose={closeMessagePanel} />
      </SheetContent>
    </Sheet>
  );
};

export default MessageButton;