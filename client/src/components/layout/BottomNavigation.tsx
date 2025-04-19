import { useAppStore } from '@/lib/stores';
import { 
  Search, 
  ShoppingBag, 
  Bot, 
  MessageSquare, 
  User
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { NavigationRegion } from '@/components/accessibility/SkipLinks';
import { useAccessibility } from '@/hooks/use-accessibility';

const BottomNavigation = () => {
  const { activeTab, setActiveTab } = useAppStore();
  const { state } = useAccessibility();

  const tabs = [
    { id: 'explore', label: 'Explore', icon: Search },
    { id: 'marketplace', label: 'Marketplace', icon: ShoppingBag },
    { id: 'ai', label: 'AI Agents', icon: Bot },
    { id: 'communities', label: 'Communities', icon: MessageSquare },
    { id: 'profile', label: 'Profile', icon: User },
  ] as const;

  return (
    <NavigationRegion className="fixed bottom-0 left-0 w-full bg-white shadow-lg border-t border-gray-200 z-50">
      <nav aria-label="Main navigation">
        <ul className="flex justify-around items-center py-2 px-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            
            return (
              <li key={tab.id} className="w-full">
                <button
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "flex flex-col items-center p-2 rounded-lg w-full",
                    isActive ? "text-primary font-medium" : "text-gray-500"
                  )}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={`${tab.label} tab`}
                >
                  <Icon className="h-6 w-6" aria-hidden="true" />
                  <span className={cn(
                    "text-xs mt-1",
                    state.textSize === 'large' && "text-sm",
                    state.textSize === 'larger' && "text-base"
                  )}>
                    {tab.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </NavigationRegion>
  );
};

export default BottomNavigation;
