import { useAppStore } from '@/lib/stores';
import { 
  Search, 
  ShoppingBag, 
  Bot, 
  MessageSquare, 
  User
} from 'lucide-react';
import { cn } from '@/lib/utils';

const BottomNavigation = () => {
  const { activeTab, setActiveTab } = useAppStore();

  const tabs = [
    { id: 'explore', label: 'Explore', icon: Search },
    { id: 'marketplace', label: 'Marketplace', icon: ShoppingBag },
    { id: 'ai', label: 'AI Agents', icon: Bot },
    { id: 'communities', label: 'Communities', icon: MessageSquare },
    { id: 'profile', label: 'Profile', icon: User },
  ] as const;

  return (
    <div className="fixed bottom-0 left-0 w-full bg-white shadow-lg border-t border-gray-200 z-50">
      <div className="flex justify-around items-center py-2 px-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex flex-col items-center p-2 rounded-lg",
                isActive ? "text-primary font-medium" : "text-gray-500"
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
