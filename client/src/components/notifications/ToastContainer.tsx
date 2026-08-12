import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNotifications } from '@/lib/stores';
import Toast from './Toast';
import { AnimatePresence, motion } from 'framer-motion';
import { Notification } from '@/types';

const ToastContainer: React.FC = () => {
  const { notifications } = useNotifications();
  const [recentNotifications, setRecentNotifications] = useState<Notification[]>([]);

  // Track recent notifications to display as toasts
  useEffect(() => {
    // We only want to show new, unread notifications that have arrived since the user loaded the page
    if (notifications.length === 0) return;

    // Check if there are any new notifications
    const newNotifications = notifications.filter(
      (notification: Notification) => 
        !notification.read && 
        !recentNotifications.some((recent: Notification) => recent.id === notification.id)
    );

    if (newNotifications.length > 0) {
      setRecentNotifications((prevState: Notification[]) => [...prevState, ...newNotifications]);
    }
  }, [notifications]);

  // Auto-dismiss toasts after a delay
  useEffect(() => {
    if (recentNotifications.length === 0) return;
    
    const timers = recentNotifications.map((notification: Notification) => {
      return setTimeout(() => {
        setRecentNotifications((prev: Notification[]) => 
          prev.filter((n: Notification) => n.id !== notification.id)
        );
      }, 5000); // Auto-dismiss after 5 seconds
    });
    
    return () => {
      timers.forEach((timer: NodeJS.Timeout) => clearTimeout(timer));
    };
  }, [recentNotifications]);

  // Manually dismiss a toast
  const dismissToast = (id: string) => {
    setRecentNotifications((prev: Notification[]) => 
      prev.filter((notification: Notification) => notification.id !== id)
    );
  };

  // Return null if no portal container is available
  if (typeof document === 'undefined') return null;

  // Create a portal for the toast container
  return createPortal(
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-80 sm:w-96">
      <AnimatePresence>
        {recentNotifications.map((notification: Notification) => (
          <motion.div
            key={notification.id}
            initial={{ y: -20, scale: 0.95 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ x: 24, scale: 0.95, transition: { duration: 0.2 } }}
            className="overflow-hidden rounded-lg border border-zinc-800 bg-[#09090b] shadow-lg"
          >
            <Toast 
              notification={notification} 
              onClose={() => dismissToast(notification.id)} 
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body
  );
};

export default ToastContainer;
