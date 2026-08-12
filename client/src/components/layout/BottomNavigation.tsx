import { useAppStore } from '@/lib/stores';
import { 
  Compass,
  Store,
  Plus,
  UsersRound,
  User
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocation } from 'wouter';

const BottomNavigation = () => {
  const { setActiveTab } = useAppStore();
  const [location, setLocation] = useLocation();

  const activeTab = location === "/" || location.startsWith("/post/") || location.startsWith("/posts/")
    ? "explore"
    : location.startsWith("/marketplace") || ["/cart", "/orders", "/checkout"].some((path) => location === path || location.startsWith(`${path}/`)) || location.startsWith("/learn") || location.startsWith("/courses/")
      ? "marketplace"
      : location.startsWith("/create") || location === "/new-text-post" || ["/studio", "/distribution", "/business", "/campaigns", "/earnings", "/products", "/ai", "/automations"].some((path) => location === path || location.startsWith(`${path}/`))
        ? "create"
        : location.startsWith("/communities")
          ? "communities"
          : location.startsWith("/profile") || location.startsWith("/user/") || ["/saved-posts", "/followers", "/following", "/revenue", "/contacts", "/documents", "/moderation"].some((path) => location === path || location.startsWith(`${path}/`))
            ? "profile"
            : null;

  // These are focused, full-screen Stitch surfaces. Their own headers provide
  // the exit path; retaining the global nav here breaks the approved layout.
  if (["/search", "/messages", "/notifications", "/posts"].some((path) => location === path || location.startsWith(`${path}/`))) {
    return null;
  }

  const tabs = [
    { id: 'explore', label: 'Explore', icon: Compass, href: '/' },
    { id: 'marketplace', label: 'Marketplace', icon: Store, href: '/marketplace' },
    { id: 'create', label: 'Create', icon: Plus, href: '/create' },
    { id: 'communities', label: 'Communities', icon: UsersRound, href: '/communities' },
    { id: 'profile', label: 'Profile', icon: User, href: '/profile' },
  ] as const;

  return (
    <nav aria-label="Primary navigation" className="fixed bottom-0 left-1/2 z-50 w-full max-w-[720px] -translate-x-1/2 border-x border-t border-zinc-800 bg-black">
      <div className="mx-auto flex h-14 items-center justify-between px-4">
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
                isActive ? "text-white" : "text-zinc-500 hover:text-white"
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
