import { Switch, Route, Redirect, useLocation } from "wouter";
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
import ProductDetail from "@/pages/product-detail";
import CreatePostPage from "@/pages/create-post";
import NewTextPostPage from "@/pages/new-text-post";
import MessagesPage from "@/pages/messages";
import SearchPage from "@/pages/search";
import CreatePage from "@/pages/create";
import CreateEventPage from "@/pages/create-event";
import NotificationsPage from "@/pages/notifications";
import PostAnalyticsPage from "@/pages/post-analytics";
import BottomNavigation from "@/components/layout/BottomNavigation";
import { useCallback, useEffect } from "react";
import { useAppStore, useAIChatStore, useNotifications } from "@/lib/stores";
import ChatInterface from "@/components/ai/ChatInterface";
import NotificationBell from "@/components/notifications/NotificationBell";
import NotificationPanel from "@/components/notifications/NotificationPanel";
import ToastContainer from "@/components/notifications/ToastContainer";
import { MessageButton } from "@/components/messages";
import { ProtectedRoute } from "./lib/protected-route";
import { AuthProvider, DemoAuthProvider } from "./hooks/use-auth";

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const DEMO_MODE = import.meta.env.VITE_CREATOROS_DEMO_MODE === "true";

if (!DEMO_MODE && !CLERK_PUBLISHABLE_KEY) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY environment variable");
}

function LogoutRoute() {
  const { signOut } = useClerk();
  useEffect(() => {
    signOut({ redirectUrl: "/auth" });
  }, [signOut]);
  return null;
}

function DemoLogoutRoute() {
  return <Redirect to="/" />;
}

function Router() {
  const { setActiveTab } = useAppStore();
  const [location] = useLocation();

  // Update active tab when route changes
  useEffect(() => {
    const path = location.substring(1).split('/')[0];
    const validTabs = ['marketplace', 'create', 'ai', 'communities', 'profile'];

    if (path === '') {
      setActiveTab('explore');
    } else if (validTabs.includes(path)) {
      setActiveTab(path as any);
    }
  }, [location, setActiveTab]);

  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      <Route path="/logout" component={DEMO_MODE ? DemoLogoutRoute : LogoutRoute} />
      <ProtectedRoute path="/" component={Explore} />
      <ProtectedRoute path="/marketplace" component={Marketplace} />
      <ProtectedRoute path="/ai" component={AI} />
      <ProtectedRoute path="/communities/:id" component={Communities} />
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
      <ProtectedRoute path="/marketplace/product/:id" component={ProductDetail} />
      <ProtectedRoute path="/create/post" component={CreatePostPage} />
      <ProtectedRoute path="/create/event" component={CreateEventPage} />
      <ProtectedRoute path="/create" component={CreatePage} />
      <ProtectedRoute path="/messages" component={MessagesPage} />
      <ProtectedRoute path="/notifications" component={NotificationsPage} />
      <ProtectedRoute path="/search" component={SearchPage} />
      <ProtectedRoute path="/new-text-post" component={NewTextPostPage} />
      <ProtectedRoute path="/posts/:id/analytics" component={PostAnalyticsPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppContent() {
  const { isOpen } = useAIChatStore();
  const { currentUser, setCurrentUser } = useAppStore();
  const { isNotificationPanelOpen, closeNotificationPanel } = useNotifications();
  const [location] = useLocation();
  const isAuthRoute = location === "/auth" || location === "/logout";

  return (
    <>
      <div className={isAuthRoute ? "app-container pb-0" : "app-container"}>
        <main className="tab-content">
          <Router />
        </main>
        {!isAuthRoute && <BottomNavigation />}
        {isOpen && <ChatInterface />}
      </div>
      <Toaster />
      <ToastContainer />
      <MessageButton showTrigger={false} />
    </>
  );
}

function App() {
  if (DEMO_MODE) {
    return (
      <QueryClientProvider client={queryClient}>
        <DemoAuthProvider>
          <AppContent />
        </DemoAuthProvider>
      </QueryClientProvider>
    );
  }

  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY!}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default App;
