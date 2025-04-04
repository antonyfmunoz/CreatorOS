import React, { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { useNotifications } from '@/lib/stores';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface NotificationBellProps {
  userId: number;
}

const NotificationBell: React.FC<NotificationBellProps> = ({ userId }) => {
  const { 
    unreadCount, 
    fetchNotifications, 
    isNotificationPanelOpen, 
    toggleNotificationPanel 
  } = useNotifications();
  
  const [isInitialized, setIsInitialized] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  
  // Fetch notifications on mount and when userId changes
  useEffect(() => {
    if (userId) {
      fetchNotifications(userId);
      setIsInitialized(true);
    }
  }, [userId, fetchNotifications]);
  
  // Poll for new notifications every minute
  useEffect(() => {
    if (!userId) return;
    
    const intervalId = setInterval(() => {
      fetchNotifications(userId);
    }, 60000); // Every minute
    
    return () => clearInterval(intervalId);
  }, [userId, fetchNotifications]);
  
  const handleClick = () => {
    toggleNotificationPanel();
  };
  
  if (!isInitialized) return null;
  
  return (
    <div className="fixed top-4 right-4 z-40">
      <Button
        ref={buttonRef}
        variant={isNotificationPanelOpen ? 'default' : 'ghost'}
        size="icon"
        className="relative"
        onClick={handleClick}
        aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}`}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <Badge 
            variant="destructive" 
            className="absolute -top-1 -right-1 w-5 h-5 p-0 rounded-full flex items-center justify-center text-xs"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </Badge>
        )}
      </Button>
    </div>
  );
};

export default NotificationBell;