import React from 'react';
import { format } from 'date-fns';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Notification } from '@/types';
import { useNotifications } from '@/lib/stores';

interface ToastProps {
  notification: Notification;
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ notification, onClose }) => {
  const { markAsRead } = useNotifications();
  const formattedDate = format(new Date(notification.createdAt), 'h:mm a');
  
  const getIconByType = (type: string) => {
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
  
  const handleClick = () => {
    // Mark as read when clicked
    markAsRead(notification.id);
    
    // Navigate to linkTo if provided
    if (notification.linkTo) {
      window.location.href = notification.linkTo;
    }
    
    // Close toast
    onClose();
  };
  
  return (
    <div 
      className="rounded-lg bg-[#09090b] p-4 text-white shadow-md"
      role="status"
    >
      <div className="flex items-start justify-between">
        <button
          type="button"
          className="flex min-w-0 flex-1 gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d9bf0]"
          onClick={handleClick}
          aria-label={`Open notification: ${notification.message}`}
        >
          <div className="mt-0.5">
            {getIconByType(notification.type)}
          </div>
          <div>
            <p className="text-sm font-medium">{notification.message}</p>
            <p className="mt-1 text-xs text-zinc-400">{formattedDate}</p>
          </div>
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 -mt-1 -mr-1"
          aria-label="Dismiss notification"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default Toast;
