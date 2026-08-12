import { X, Check, Trash2, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNotifications } from '@/lib/stores';
import { useAuth } from '@/hooks/use-auth';
import { Avatar } from '@/components/ui/avatar';
import { AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Link } from 'wouter';
import { formatDistanceToNow } from 'date-fns';
import { Separator } from '@/components/ui/separator';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { SheetClose, SheetTitle } from '@/components/ui/sheet';
import { useEffect } from 'react';

interface NotificationPanelProps {
  onClose?: () => void;
}

const NotificationPanel = () => {
  const { 
    notifications, 
    isLoading, 
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    deleteAllNotifications 
  } = useNotifications();
  
  const { user } = useAuth();
  
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'like':
        return '❤️';
      case 'comment':
        return '💬';
      case 'mention':
        return '@';
      case 'follow':
        return '👤';
      case 'purchase':
        return '💰';
      case 'system':
      default:
        return '🔔';
    }
  };
  
  const handleClearAll = () => {
    if (user) {
      deleteAllNotifications(user.id);
    }
  };
  
  const handleMarkAllAsRead = () => {
    if (user && unreadCount > 0) {
      markAllAsRead(user.id);
    }
  };

  return (
    <div className="flex h-full flex-col bg-black text-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 p-4">
        <div className="flex items-center space-x-2">
          <SheetTitle className="font-semibold text-lg">Notifications</SheetTitle>
          {unreadCount > 0 && (
            <span className="bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs font-medium">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex space-x-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="text-zinc-400 hover:bg-zinc-900 hover:text-white">
                <Bell className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleMarkAllAsRead}>
                <Check className="mr-2 h-4 w-4" />
                <span>Mark all as read</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleClearAll}>
                <Trash2 className="mr-2 h-4 w-4" />
                <span>Clear all</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <SheetClose asChild>
            <Button variant="ghost" size="icon" className="text-zinc-400 hover:bg-zinc-900 hover:text-white">
              <X className="h-5 w-5" />
            </Button>
          </SheetClose>
        </div>
      </div>
      
      {/* Content */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex justify-center items-center h-full p-4">
            <p>Loading notifications...</p>
          </div>
        ) : notifications.length > 0 ? (
          <div className="divide-y divide-zinc-800">
            {notifications.map((notification) => (
              <div 
                key={notification.id} 
                className={`group p-4 transition-colors hover:bg-zinc-950 ${!notification.read ? 'bg-zinc-900/40' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-primary/10 rounded-full">
                    {notification.relatedUserImage ? (
                      <Avatar>
                        <AvatarImage src={notification.relatedUserImage} />
                        <AvatarFallback>{getNotificationIcon(notification.type)}</AvatarFallback>
                      </Avatar>
                    ) : (
                      <span className="text-xl">{getNotificationIcon(notification.type)}</span>
                    )}
                  </div>
                  <div className="flex-1">
                    {notification.linkTo ? (
                      <Link href={notification.linkTo} onClick={() => markAsRead(notification.id)}>
                        <p className="mb-1 cursor-pointer">{notification.message}</p>
                      </Link>
                    ) : (
                      <p className="mb-1">{notification.message}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => deleteNotification(notification.id)}
                    className="h-8 w-8 opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {!notification.read && (
                  <div className="mt-2 flex justify-end">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => markAsRead(notification.id)}
                      className="text-xs h-8"
                    >
                      Mark as read
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-8 text-center h-full">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-900">
              <Bell className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="mb-1 font-medium text-white">No notifications yet</p>
            <p className="text-muted-foreground text-sm">We'll notify you when something important happens</p>
          </div>
        )}
      </ScrollArea>
    </div>
  );
};

export default NotificationPanel;
