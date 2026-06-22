import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { ClerkProvider, useClerk } from "@clerk/clerk-react";
import { Toaster } from "@/components/ui/toaster";
import NotFound from "@/pages/not-found";
import Explore from "@/pages/explore";
import Marketplace from "@/pages/marketplace";
import AI from "@/pages/ai";
import Communities from "@/pages/communities";
import Profile from "@/pages/profile";
import AuthPage from "@/pages/auth-page";
import SavedPostsPage from "@/pages/saved-posts";
import FollowersPage from "@/pages/followers";
import FollowingPage from "@/pages/following";
import RevenuePage from "@/pages/revenue";
import ContactsPage from "@/pages/contacts";
import DocumentsPage from "@/pages/documents";
import CreateProductPage from "@/pages/create-product";
import CreatePostPage from "@/pages/create-post";
import NewTextPostPage from "@/pages/new-text-post";
import BottomNavigation from "@/components/layout/BottomNavigation";
import { useCallback, useEffect } from "react";
import { useAppStore, useAIChatStore, useNotifications } from "@/lib/stores";
import ChatInterface from "@/components/ai/ChatInterface";
import NotificationBell from "@/components/notifications/NotificationBell";
import NotificationPanel from "@/components/notifications/NotificationPanel";
import ToastContainer from "@/components/notifications/ToastContainer";
import { ProtectedRoute } from "./lib/protected-route";
import { AuthProvider } from "./hooks/use-auth";

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!CLERK_PUBLISHABLE_KEY) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY environment variable");
}

function LogoutRoute() {
  const { signOut } = useClerk();
  useEffect(() => {
    signOut({ redirectUrl: "/auth" });
  }, [signOut]);
  return null;
}

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
      <Route path="/auth" component={AuthPage} />
      <Route path="/logout" component={LogoutRoute} />
      <ProtectedRoute path="/" component={Explore} />
      <ProtectedRoute path="/marketplace" component={Marketplace} />
      <ProtectedRoute path="/ai" component={AI} />
      <ProtectedRoute path="/communities" component={Communities} />
      <ProtectedRoute path="/profile" component={Profile} />
      <ProtectedRoute path="/profile/:id" component={Profile} />
      <ProtectedRoute path="/user/:username" component={Profile} />
      <ProtectedRoute path="/saved-posts" component={SavedPostsPage} />
      <ProtectedRoute path="/followers" component={FollowersPage} />
      <ProtectedRoute path="/followers/:id" component={FollowersPage} />
      <ProtectedRoute path="/user/:username/followers" component={FollowersPage} />
      <ProtectedRoute path="/following" component={FollowingPage} />
      <ProtectedRoute path="/following/:id" component={FollowingPage} />
      <ProtectedRoute path="/user/:username/following" component={FollowingPage} />
      <ProtectedRoute path="/revenue" component={RevenuePage} />
      <ProtectedRoute path="/contacts" component={ContactsPage} />
      <ProtectedRoute path="/documents" component={DocumentsPage} />
      <ProtectedRoute path="/create-product" component={CreateProductPage} />
      <ProtectedRoute path="/create" component={CreatePostPage} />
      <ProtectedRoute path="/new-text-post" component={NewTextPostPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const { isOpen } = useAIChatStore();
  const { currentUser, setCurrentUser } = useAppStore();
  const { isNotificationPanelOpen, closeNotificationPanel } = useNotifications();

  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <div className="app-container">
            <main className="tab-content">
              <Router />
            </main>
            <BottomNavigation />
            {isOpen && <ChatInterface />}
          </div>
          <Toaster />
          <ToastContainer />
        </AuthProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default App;
