import { useEffect } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNotifications } from '@/lib/stores';
import { useAuth } from '@/hooks/use-auth';
import { useLocation } from 'wouter';

const NotificationBell = () => {
  const { unreadCount, fetchNotifications } = useNotifications();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  
  // Fetch notifications when user is available
  useEffect(() => {
    if (user) {
      fetchNotifications(user.id);
    }
  }, [user, fetchNotifications]);
  
  return (
        <Button size="icon" variant="ghost" className="relative rounded-full text-zinc-400 hover:bg-zinc-900 hover:text-white" aria-label="Open notifications" onClick={() => setLocation("/notifications")}>
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground rounded-full h-5 min-w-5 flex items-center justify-center px-1 text-xs font-medium">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
  );
};

export default NotificationBell;
