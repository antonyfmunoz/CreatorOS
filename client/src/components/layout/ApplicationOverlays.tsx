import { Component, lazy, Suspense, type ReactNode } from "react";
import ToastContainer from "@/components/notifications/ToastContainer";
import { Toaster } from "@/components/ui/toaster";
import { useAIChatStore } from "@/lib/stores";

const ChatInterface = lazy(() => import("@/components/ai/ChatInterface"));
const MessageButton = lazy(() => import("@/components/messages").then((module) => ({ default: module.MessageButton })));

class OptionalOverlayBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    if (!navigator.onLine) {
      window.addEventListener("online", () => window.location.reload(), { once: true });
    }
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function ApplicationOverlays() {
  const { isOpen } = useAIChatStore();

  return (
    <>
      <OptionalOverlayBoundary>
        <Suspense fallback={null}>
          {isOpen && <ChatInterface />}
          <MessageButton showTrigger={false} />
        </Suspense>
      </OptionalOverlayBoundary>
      <Toaster />
      <ToastContainer />
    </>
  );
}
