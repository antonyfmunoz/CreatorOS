import { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import MessagePanel from './MessagePanel';
import { useAuthStore } from '@/lib/stores';
import { useQuery } from '@tanstack/react-query';

const MessageButton = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { user } = useAuthStore();
  
  // Get unread message count
  const { data, isLoading } = useQuery({
    queryKey: ['/api/messages/unread-count', user?.id],
    queryFn: async () => {
      if (!user) return { count: 0 };
      
      try {
        const response = await fetch(`/api/users/${user.id}/unread-messages-count`);
        if (!response.ok) {
          throw new Error('Failed to fetch unread messages count');
        }
        return response.json();
      } catch (error) {
        console.error('Error fetching unread message count:', error);
        return { count: 0 };
      }
    },
    enabled: !!user,
  });

  const unreadCount = data?.count || 0;
  
  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button size="icon" variant="outline" className="bg-gray-100 rounded-full relative">
          <MessageSquare className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge variant="destructive" className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs">
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="sm:max-w-md p-0 border-l">
        <MessagePanel onClose={() => setIsOpen(false)} />
      </SheetContent>
    </Sheet>
  );
};

export default MessageButton;