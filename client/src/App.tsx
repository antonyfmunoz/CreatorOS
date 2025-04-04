import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Explore from "@/pages/explore";
import Marketplace from "@/pages/marketplace";
import AI from "@/pages/ai";
import Communities from "@/pages/communities";
import Profile from "@/pages/profile";
import BottomNavigation from "@/components/layout/BottomNavigation";
import { useEffect } from "react";
import { useAppStore, useAIChatStore, useNotifications } from "@/lib/stores";
import ChatInterface from "@/components/ai/ChatInterface";
import NotificationBell from "@/components/notifications/NotificationBell";
import NotificationPanel from "@/components/notifications/NotificationPanel";
import ToastContainer from "@/components/notifications/ToastContainer";

function Router() {
  const { activeTab, setActiveTab } = useAppStore();
  
  // Update the route when active tab changes
  useEffect(() => {
    window.history.pushState(null, "", `/${activeTab === 'explore' ? '' : activeTab}`);
  }, [activeTab]);
  
  // Update active tab when route changes
  useEffect(() => {
    const path = window.location.pathname.substring(1);
    const validTabs = ['marketplace', 'ai', 'communities', 'profile'];
    
    if (path === '') {
      setActiveTab('explore');
    } else if (validTabs.includes(path)) {
      setActiveTab(path as any);
    }
  }, [setActiveTab]);
  
  return (
    <Switch>
      <Route path="/" component={Explore} />
      <Route path="/marketplace" component={Marketplace} />
      <Route path="/ai" component={AI} />
      <Route path="/communities" component={Communities} />
      <Route path="/profile" component={Profile} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const { isOpen } = useAIChatStore();
  const { currentUser, setCurrentUser } = useAppStore();
  const { isNotificationPanelOpen, closeNotificationPanel } = useNotifications();
  
  // Initialize with a test user if none exists
  useEffect(() => {
    if (!currentUser) {
      // This is only for testing notifications - in a real app, you'd get this from authentication
      setCurrentUser({
        id: 11,
        username: "testuser",
        displayName: "Test User",
        bio: "This is a test user for notification testing",
        role: "user",
        xpPoints: 100,
        level: 1,
        createdAt: new Date().toISOString()
      });
    }
  }, [currentUser, setCurrentUser]);
  
  return (
    <QueryClientProvider client={queryClient}>
      <div className="app-container">
        <main className="tab-content">
          <Router />
        </main>
        {/* Notification components moved to the Explore page header */}
        <BottomNavigation />
        {isOpen && <ChatInterface />}
      </div>
      <Toaster />
      <ToastContainer />
    </QueryClientProvider>
  );
}

export default App;
