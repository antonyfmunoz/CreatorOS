import MessagePanel from "@/components/messages/MessagePanel";
import { useLocation } from "wouter";

/**
 * The Stitch system treats messages as a primary destination.  The existing
 * panel already owns the durable conversation, reply, group, and search logic;
 * this route gives that logic a first-class, bookmarkable home.
 */
export default function MessagesPage() {
  const [, setLocation] = useLocation();

  return (
    <main className="min-h-[calc(100dvh-3.5rem)] bg-white pb-14 text-black">
      <MessagePanel onClose={() => setLocation('/')} />
    </main>
  );
}
