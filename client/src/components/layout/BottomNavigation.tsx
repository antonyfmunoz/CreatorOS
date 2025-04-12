import { useAppStore, useAuthStore } from '@/lib/stores';
import { 
  Search, 
  ShoppingBag, 
  Bot, 
  MessageSquare, 
  User,
  LogIn
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocation } from 'wouter';

const BottomNavigation = () => {
  const { activeTab, setActiveTab } = useAppStore();
  const { isAuthenticated } = useAuthStore();
  const [, navigate] = useLocation();

  // Define all possible tabs
  const allTabs = [
    { id: 'explore', label: 'Explore', icon: Search, requiresAuth: false },
    { id: 'marketplace', label: 'Marketplace', icon: ShoppingBag, requiresAuth: false },
    { id: 'ai', label: 'AI Agents', icon: Bot, requiresAuth: true },
    { id: 'communities', label: 'Communities', icon: MessageSquare, requiresAuth: true },
    { id: 'profile', label: 'Profile', icon: User, requiresAuth: true },
  ] as const;

  // If not authenticated, show Login button instead of the tabs that require auth
  const authButton = { id: 'auth', label: 'Login', icon: LogIn, requiresAuth: false, isAuthButton: true };

  // Filter tabs based on authentication status
  const tabs = isAuthenticated 
    ? allTabs 
    : [...allTabs.filter(tab => !tab.requiresAuth), authButton];

  const handleTabClick = (tabId: string, isAuthButton?: boolean) => {
    if (isAuthButton) {
      navigate('/auth');
    } else {
      setActiveTab(tabId as any);
    }
  };

  return (
    <div className="fixed bottom-0 left-0 w-full bg-white shadow-lg border-t border-gray-200 z-50">
      <div className="flex justify-around items-center py-2 px-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id, (tab as any).isAuthButton)}
              className={cn(
                "flex flex-col items-center p-2 rounded-lg",
                isActive ? "text-primary font-medium" : 
                (tab as any).isAuthButton ? "text-primary font-medium" : "text-gray-500"
              )}
            >
              <Icon className="h-6 w-6" />
              <span className="text-xs mt-1">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default BottomNavigation;
