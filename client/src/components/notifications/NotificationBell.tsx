import { useEffect } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import NotificationPanel from './NotificationPanel';
import { useNotifications, useAuthStore } from '@/lib/stores';

const NotificationBell = () => {
  const { isNotificationPanelOpen, toggleNotificationPanel, closeNotificationPanel, unreadCount, fetchNotifications } = useNotifications();
  const { user } = useAuthStore();
  
  // Fetch notifications when user is available
  useEffect(() => {
    if (user) {
      fetchNotifications(user.id);
    }
  }, [user, fetchNotifications]);
  
  // Close notification panel when component unmounts
  useEffect(() => {
    return () => {
      closeNotificationPanel();
    };
  }, [closeNotificationPanel]);
  
  return (
    <Sheet open={isNotificationPanelOpen} onOpenChange={toggleNotificationPanel}>
      <SheetTrigger asChild>
        <Button size="icon" variant="outline" className="bg-white/90 rounded-full relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground rounded-full h-5 min-w-5 flex items-center justify-center px-1 text-xs font-medium">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="sm:max-w-md p-0 border-l" aria-describedby="notification-panel-desc" hideCloseButton>
        <NotificationPanel />
        <div id="notification-panel-desc" className="sr-only">Notification panel showing all your recent notifications</div>
      </SheetContent>
    </Sheet>
  );
};

export default NotificationBell;