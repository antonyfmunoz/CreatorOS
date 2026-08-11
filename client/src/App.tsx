import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { ClerkProvider, useClerk } from "@clerk/clerk-react";
import { Toaster } from "@/components/ui/toaster";
import BottomNavigation from "@/components/layout/BottomNavigation";
import { Component, lazy, Suspense, useEffect, type ErrorInfo, type ReactNode } from "react";
import { useAppStore, useAIChatStore, useNotifications } from "@/lib/stores";
import ChatInterface from "@/components/ai/ChatInterface";
import NotificationBell from "@/components/notifications/NotificationBell";
import NotificationPanel from "@/components/notifications/NotificationPanel";
import ToastContainer from "@/components/notifications/ToastContainer";
import { MessageButton } from "@/components/messages";
import { ProtectedRoute } from "./lib/protected-route";
import { AuthProvider, DemoAuthProvider } from "./hooks/use-auth";
import { routeChrome } from "./lib/route-chrome";

// Route-level loading keeps the first render focused on the destination the
// person chose instead of forcing the social, marketplace, community, AI, and
// business workspaces into every download.
const NotFound = lazy(() => import("@/pages/not-found"));
const Explore = lazy(() => import("@/pages/explore"));
const Marketplace = lazy(() => import("@/pages/marketplace"));
const AI = lazy(() => import("@/pages/ai"));
const Communities = lazy(() => import("@/pages/communities"));
const Profile = lazy(() => import("@/pages/profile"));
const AuthPage = lazy(() => import("@/pages/auth-page"));
const SavedPostsPage = lazy(() => import("@/pages/saved-posts"));
const FollowersPage = lazy(() => import("@/pages/followers"));
const FollowingPage = lazy(() => import("@/pages/following"));
const RevenuePage = lazy(() => import("@/pages/revenue"));
const ContactsPage = lazy(() => import("@/pages/contacts"));
const DocumentsPage = lazy(() => import("@/pages/documents"));
const CreateProductPage = lazy(() => import("@/pages/create-product"));
const ProductDetail = lazy(() => import("@/pages/product-detail"));
const OfferEditor = lazy(() => import("@/pages/offer-editor"));
const CreatePostPage = lazy(() => import("@/pages/create-post"));
const NewTextPostPage = lazy(() => import("@/pages/new-text-post"));
const MessagesPage = lazy(() => import("@/pages/messages"));
const SearchPage = lazy(() => import("@/pages/search"));
const CreatePage = lazy(() => import("@/pages/create"));
const CreateEventPage = lazy(() => import("@/pages/create-event"));
const NotificationsPage = lazy(() => import("@/pages/notifications"));
const PostDetailPage = lazy(() => import("@/pages/post-detail"));
const PostAnalyticsPage = lazy(() => import("@/pages/post-analytics"));
const CartPage = lazy(() => import("@/pages/cart"));
const OrdersPage = lazy(() => import("@/pages/orders"));
const CoursePlayer = lazy(() => import("@/pages/course-player"));
const LearningLibraryPage = lazy(() => import("@/pages/learning-library"));
const DistributionStudio = lazy(() => import("@/pages/distribution-studio"));
const DistributionConnections = lazy(() => import("@/pages/distribution-connections"));
const BusinessDashboard = lazy(() => import("@/pages/business-dashboard"));
const CampaignsPage = lazy(() => import("@/pages/campaigns"));
const CourseBuilder = lazy(() => import("@/pages/course-builder"));
const UmhApprovalsPage = lazy(() => import("@/pages/umh-approvals"));
const CheckoutSuccessPage = lazy(() => import("@/pages/checkout-success"));
const EarningsPage = lazy(() => import("@/pages/earnings"));
const ModerationPage = lazy(() => import("@/pages/moderation"));
const CommunityRoomPage = lazy(() => import("@/pages/community-room"));
const AutomationsPage = lazy(() => import("@/pages/automations"));
const PrivacySettingsPage = lazy(() => import("@/pages/privacy-settings"));
const TrustCenterPage = lazy(() => import("@/pages/trust-center"));
const TrustPolicyPage = lazy(() => import("@/pages/trust-policy"));

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const DEMO_MODE = import.meta.env.VITE_CREATOROS_DEMO_MODE === "true";

function recoverFromStaleBuild(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (!/dynamically imported module|failed to fetch/i.test(message)) return false;
  const retryKey = `creativesos:stale-build-retry:${message}`;
  if (sessionStorage.getItem(retryKey)) return false;
  sessionStorage.setItem(retryKey, "1");
  window.location.reload();
  return true;
}

class RouteErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    recoverFromStaleBuild(error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <section className="mx-auto flex min-h-[40vh] max-w-sm flex-col justify-center px-6 text-center text-white"><h1 className="text-xl font-bold">Updating CreativesOS</h1><p className="mt-2 text-sm leading-6 text-zinc-500">This page needs a fresh app version. Reload to continue.</p><button className="mt-5 rounded-xl bg-white px-4 py-2 text-sm font-bold text-black" onClick={() => window.location.reload()}>Reload</button></section>;
  }
}

window.addEventListener("vite:preloadError", (event) => {
  const preloadEvent = event as Event & { payload?: unknown };
  if (recoverFromStaleBuild(preloadEvent.payload)) preloadEvent.preventDefault();
});

if (!DEMO_MODE && !CLERK_PUBLISHABLE_KEY) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY environment variable");
}

function LogoutRoute() {
  const { signOut } = useClerk();
  useEffect(() => {
    signOut({ redirectUrl: "/auth/login" });
  }, [signOut]);
  return null;
}

function DemoLogoutRoute() {
  return <Redirect to="/" />;
}

function LoginRoute() {
  return <Redirect to="/auth/login" />;
}

function LegacyRegisterRoute() {
  return <Redirect to="/auth/register" />;
}

function Router() {
  const { setActiveTab } = useAppStore();
  const [location] = useLocation();

  // Update active tab when route changes
  useEffect(() => {
    const path = location.substring(1).split('/')[0];
    if (path === '') return setActiveTab('explore');
    if (path === 'post') return setActiveTab('explore');
    if (['marketplace', 'cart', 'orders', 'checkout', 'learn', 'courses'].includes(path)) return setActiveTab('marketplace');
    if (['create', 'studio', 'distribution', 'business', 'campaigns', 'earnings', 'products', 'automations'].includes(path)) return setActiveTab('create');
    if (['communities', 'events'].includes(path)) return setActiveTab('communities');
    if (['profile', 'user', 'saved-posts', 'followers', 'following', 'revenue', 'contacts', 'documents', 'moderation', 'settings'].includes(path)) return setActiveTab('profile');
    if (path === 'ai') return setActiveTab('create');
  }, [location, setActiveTab]);

  return (
    <Switch>
      <Route path="/auth/login" component={AuthPage} />
      <Route path="/auth/register" component={AuthPage} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/login" component={LoginRoute} />
      <Route path="/register" component={LegacyRegisterRoute} />
      <Route path="/logout" component={DEMO_MODE ? DemoLogoutRoute : LogoutRoute} />
      <Route path="/trust" component={TrustCenterPage} />
      <Route path="/legal/data-deletion" component={TrustPolicyPage} />
      <Route path="/legal/community-guidelines" component={TrustPolicyPage} />
      <Route path="/legal/ai-recording" component={TrustPolicyPage} />
      <ProtectedRoute path="/" component={Explore} />
      <ProtectedRoute path="/marketplace" component={Marketplace} />
      <ProtectedRoute path="/cart" component={CartPage} />
      <ProtectedRoute path="/orders" component={OrdersPage} />
      <ProtectedRoute path="/checkout/success" component={CheckoutSuccessPage} />
      <ProtectedRoute path="/learn" component={LearningLibraryPage} />
      <ProtectedRoute path="/learn/:id" component={CoursePlayer} />
      <ProtectedRoute path="/courses/:id/manage" component={CourseBuilder} />
      <ProtectedRoute path="/studio" component={DistributionStudio} />
      <ProtectedRoute path="/distribution" component={DistributionStudio} />
      <ProtectedRoute path="/distribution/connections" component={DistributionConnections} />
      <ProtectedRoute path="/business" component={BusinessDashboard} />
      <ProtectedRoute path="/business/approvals" component={UmhApprovalsPage} />
      <ProtectedRoute path="/earnings" component={EarningsPage} />
      <ProtectedRoute path="/moderation" component={ModerationPage} />
      <ProtectedRoute path="/campaigns" component={CampaignsPage} />
      <ProtectedRoute path="/ai" component={AI} />
      <ProtectedRoute path="/automations" component={AutomationsPage} />
      <ProtectedRoute path="/settings/privacy" component={PrivacySettingsPage} />
      <ProtectedRoute path="/communities/:communityId/rooms/:roomId" component={CommunityRoomPage} />
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
      <ProtectedRoute path="/products/:id/edit" component={OfferEditor} />
      <ProtectedRoute path="/marketplace/product/:id" component={ProductDetail} />
      <ProtectedRoute path="/create/post" component={CreatePostPage} />
      <ProtectedRoute path="/create/event" component={CreateEventPage} />
      <ProtectedRoute path="/events/:id/edit" component={CreateEventPage} />
      <ProtectedRoute path="/create" component={CreatePage} />
      <ProtectedRoute path="/messages" component={MessagesPage} />
      <ProtectedRoute path="/notifications" component={NotificationsPage} />
      <ProtectedRoute path="/search" component={SearchPage} />
      <ProtectedRoute path="/new-text-post" component={NewTextPostPage} />
      <ProtectedRoute path="/post/:id" component={PostDetailPage} />
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
  const chrome = routeChrome(location);

  return (
    <>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <div className={chrome.isAuth ? "app-container pb-0" : "app-container"}>
        <div id="main-content" tabIndex={-1} className="tab-content">
          <RouteErrorBoundary>
            <Suspense fallback={<div className="min-h-[40vh]" aria-busy="true" />}>
              <Router />
            </Suspense>
          </RouteErrorBoundary>
        </div>
        {chrome.showBottomNavigation && <BottomNavigation />}
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
