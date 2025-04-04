import React, { useEffect } from 'react';
import { format } from 'date-fns';
import { X, Check, Trash2 } from 'lucide-react';
import { useNotifications } from '@/lib/stores';
import { Notification } from '@/types';
import { 
  ScrollArea, 
  ScrollBar 
} from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

interface NotificationPanelProps {
  userId: number;
  onClose: () => void;
}

const NotificationPanel: React.FC<NotificationPanelProps> = ({ userId, onClose }) => {
  const { 
    notifications, 
    isLoading, 
    markAsRead, 
    markAllAsRead, 
    deleteNotification,
    deleteAllNotifications,
    isNotificationPanelOpen,
    closeNotificationPanel
  } = useNotifications();

  // Handle escape key press to close panel
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isNotificationPanelOpen) {
        closeNotificationPanel();
        onClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isNotificationPanelOpen, closeNotificationPanel, onClose]);

  // Handle clicks outside the panel to close it
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Check if click is outside the panel and not on the notification bell
      if (
        isNotificationPanelOpen &&
        !target.closest('.notification-panel') &&
        !target.closest('.notification-bell')
      ) {
        closeNotificationPanel();
        onClose();
      }
    };

    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, [isNotificationPanelOpen, closeNotificationPanel, onClose]);

  if (!isNotificationPanelOpen) return null;

  const handleClearAll = () => {
    deleteAllNotifications(userId);
  };

  const handleMarkAllRead = () => {
    markAllAsRead(userId);
  };

  // Sort notifications with unread first, then by date
  const sortedNotifications = [...notifications].sort((a, b) => {
    // Sort by read status (unread first)
    if (a.read !== b.read) {
      return a.read ? 1 : -1;
    }
    // Then sort by date (newest first)
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'like':
        return <span className="text-red-500">❤️</span>;
      case 'comment':
        return <span className="text-blue-500">💬</span>;
      case 'mention':
        return <span className="text-green-500">@</span>;
      case 'follow':
        return <span className="text-purple-500">👤</span>;
      case 'purchase':
        return <span className="text-emerald-500">💰</span>;
      case 'system':
        return <span className="text-gray-500">🔔</span>;
      default:
        return <span className="text-gray-500">•</span>;
    }
  };

  const renderNotification = (notification: Notification) => {
    const formattedDate = format(new Date(notification.createdAt), 'MMM d, yyyy h:mm a');

    return (
      <div 
        key={notification.id} 
        className={`p-3 border-b last:border-0 ${notification.read ? 'bg-background' : 'bg-primary/5'}`}
      >
        <div className="flex justify-between">
          <div className="flex gap-3 items-start">
            <div className="mt-1">
              {getNotificationIcon(notification.type)}
            </div>
            <div className="flex-1">
              <p className={`text-sm ${!notification.read ? 'font-medium' : ''}`}>
                {notification.message}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{formattedDate}</p>
            </div>
          </div>
          <div className="flex gap-1">
            {!notification.read && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => markAsRead(notification.id)}
                title="Mark as read"
              >
                <Check className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive"
              onClick={() => deleteNotification(notification.id)}
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div 
      className="notification-panel fixed top-16 right-4 z-50 w-80 sm:w-96 shadow-lg rounded-lg border border-border bg-card overflow-hidden"
      style={{ maxHeight: 'calc(100vh - 5rem)' }}
    >
      <div className="flex items-center justify-between p-3 bg-muted/50">
        <h3 className="font-semibold">Notifications</h3>
        <div className="flex gap-1">
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 px-2 text-xs"
            onClick={handleMarkAllRead}
            disabled={isLoading || notifications.length === 0 || notifications.every(n => n.read)}
          >
            Mark all read
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 px-2 text-xs"
            onClick={handleClearAll}
            disabled={isLoading || notifications.length === 0}
          >
            Clear all
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8"
            onClick={() => {
              closeNotificationPanel();
              onClose();
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <Separator />
      
      <ScrollArea className="h-[400px]">
        {isLoading ? (
          <div className="flex justify-center items-center h-full">
            <p className="text-sm text-muted-foreground">Loading notifications...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex justify-center items-center h-full">
            <Card className="w-5/6 p-4 text-center">
              <p className="text-sm text-muted-foreground">No notifications yet</p>
            </Card>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {sortedNotifications.map(renderNotification)}
          </div>
        )}
        <ScrollBar />
      </ScrollArea>
    </div>
  );
};

export default NotificationPanel;