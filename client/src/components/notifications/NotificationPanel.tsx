import { X, Check, Trash2, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';
import { Separator } from '@/components/ui/separator';
import { useNotifications } from '@/lib/stores';
import { useAuthStore } from '@/lib/stores';
import { Notification } from '@/types';

interface NotificationPanelProps {
  onClose?: () => void;
}

const NotificationPanel = ({ onClose }: NotificationPanelProps) => {
  const { user } = useAuthStore();
  const { 
    notifications, 
    isLoading, 
    markAsRead, 
    markAllAsRead, 
    deleteNotification, 
    deleteAllNotifications 
  } = useNotifications();

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="p-4 border-b flex items-center justify-between">
        <h2 className="font-semibold text-lg">Notifications</h2>
        <div className="flex gap-2">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => user && markAllAsRead(user.id)}
            disabled={isLoading}
          >
            <Check className="h-4 w-4 mr-1" />
            <span className="text-xs">Mark All Read</span>
          </Button>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Notification list */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <p className="text-gray-500">Loading notifications...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-10 text-center">
            <Bell className="h-12 w-12 text-gray-300 mb-4" />
            <h3 className="font-medium text-gray-700 mb-1">No notifications</h3>
            <p className="text-gray-500 text-sm">
              You're all caught up! Check back later for new updates.
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {notifications.map((notification: Notification) => (
              <div 
                key={notification.id} 
                className={`p-4 ${notification.read ? 'bg-white' : 'bg-blue-50'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-sm text-gray-800">{notification.message}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {!notification.read && (
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7" 
                        onClick={() => markAsRead(notification.id)}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    )}
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7" 
                      onClick={() => deleteNotification(notification.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {notifications.length > 0 && (
        <div className="p-3 border-t">
          <Button 
            variant="outline" 
            size="sm" 
            className="w-full"
            onClick={() => user && deleteAllNotifications(user.id)}
            disabled={isLoading}
          >
            Clear All Notifications
          </Button>
        </div>
      )}
    </div>
  );
};

export default NotificationPanel;