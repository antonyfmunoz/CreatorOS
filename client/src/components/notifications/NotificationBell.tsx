import { useEffect } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import NotificationPanel from './NotificationPanel';
import { useNotifications } from '@/lib/stores';
import { useAuthStore } from '@/lib/stores';

const NotificationBell = () => {
  const { user } = useAuthStore();
  const { 
    unreadCount, 
    isNotificationPanelOpen, 
    fetchNotifications, 
    toggleNotificationPanel,
    closeNotificationPanel
  } = useNotifications();
  
  // Fetch notifications when user changes
  useEffect(() => {
    if (user?.id) {
      fetchNotifications(user.id);
      
      // Poll for new notifications every 30 seconds
      const interval = setInterval(() => {
        fetchNotifications(user.id);
      }, 30000);
      
      return () => clearInterval(interval);
    }
  }, [user?.id, fetchNotifications]);
  
  return (
    <Sheet open={isNotificationPanelOpen} onOpenChange={toggleNotificationPanel}>
      <SheetTrigger asChild>
        <Button size="icon" variant="outline" className="bg-gray-100 rounded-full relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="sm:max-w-md p-0 border-l">
        <NotificationPanel onClose={closeNotificationPanel} />
      </SheetContent>
    </Sheet>
  );
};

export default NotificationBell;