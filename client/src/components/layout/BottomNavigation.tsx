import { useAppStore } from '@/lib/stores';
import { 
  Compass,
  Store,
  Plus,
  MessageSquare, 
  User
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocation } from 'wouter';

const BottomNavigation = () => {
  const { activeTab, setActiveTab } = useAppStore();
  const [location, setLocation] = useLocation();

  // These are focused, full-screen Stitch surfaces. Their own headers provide
  // the exit path; retaining the global nav here breaks the approved layout.
  if (["/search", "/messages", "/profile", "/communities", "/posts"].some((path) => location === path || location.startsWith(`${path}/`))) {
    return null;
  }

  const tabs = [
    { id: 'explore', label: 'Explore', icon: Compass, href: '/' },
    { id: 'marketplace', label: 'Marketplace', icon: Store, href: '/marketplace' },
    { id: 'create', label: 'Create', icon: Plus, href: '/create' },
    { id: 'messages', label: 'Messages', icon: MessageSquare, href: '/messages' },
    { id: 'profile', label: 'Profile', icon: User, href: '/profile' },
  ] as const;

  return (
    <nav aria-label="Primary navigation" className="fixed bottom-0 left-0 z-50 w-full border-t border-zinc-100 bg-white">
      <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setLocation(tab.href);
              }}
              className={cn(
                "flex h-full flex-1 items-center justify-center transition-colors",
                isActive ? "text-black" : "text-zinc-400 hover:text-zinc-700"
              )}
              aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className={cn("h-6 w-6", tab.id === 'create' && "h-7 w-7")} strokeWidth={isActive ? 2.5 : 2} />
              <span className="sr-only">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNavigation;
