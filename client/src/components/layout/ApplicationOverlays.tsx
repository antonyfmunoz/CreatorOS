import ChatInterface from "@/components/ai/ChatInterface";
import { MessageButton } from "@/components/messages";
import ToastContainer from "@/components/notifications/ToastContainer";
import { Toaster } from "@/components/ui/toaster";
import { useAIChatStore } from "@/lib/stores";

export default function ApplicationOverlays() {
  const { isOpen } = useAIChatStore();

  return (
    <>
      {isOpen && <ChatInterface />}
      <Toaster />
      <ToastContainer />
      <MessageButton showTrigger={false} />
    </>
  );
}
