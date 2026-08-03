import { useEffect } from "react";
import { ArrowLeft, Bell, Download, Heart, MessageCircle, Package, UserPlus, Users } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useNotifications } from "@/lib/stores";
import { useAuth } from "@/hooks/use-auth";
import { Notification } from "@/types";

const icons: Record<Notification["type"], typeof Bell> = { like: Heart, comment: MessageCircle, mention: MessageCircle, follow: UserPlus, purchase: Package, system: Users };

export default function NotificationsPage() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { notifications, fetchNotifications, markAsRead } = useNotifications();
  useEffect(() => { if (user) void fetchNotifications(user.id); }, [fetchNotifications, user]);

  return (
    <main className="min-h-dvh bg-black text-white">
      <header className="flex h-16 items-center gap-2 border-b border-zinc-800 px-4"><Button variant="ghost" size="icon" className="-ml-2 text-white hover:bg-zinc-900 hover:text-white" aria-label="Back" onClick={() => setLocation("/")}><ArrowLeft className="h-7 w-7" /></Button><h1 className="text-3xl font-bold">Notifications</h1></header>
      <section className="divide-y divide-zinc-800">
        {notifications.map((notification) => {
          const Icon = icons[notification.type] ?? Bell;
          return <button key={notification.id} onClick={() => { void markAsRead(notification.id); if (notification.linkTo) setLocation(notification.linkTo); }} className={`flex w-full items-center gap-4 px-5 py-5 text-left hover:bg-zinc-950 ${notification.read ? "opacity-70" : ""}`}>
            {notification.relatedUserImage ? <Avatar className="h-12 w-12"><AvatarImage src={notification.relatedUserImage} /><AvatarFallback>N</AvatarFallback></Avatar> : <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-900"><Icon className="h-6 w-6" /></span>}
            <span className="min-w-0 flex-1"><span className="block text-lg leading-6 text-white">{notification.message}</span><span className="mt-1 block text-sm text-zinc-500">{new Date(notification.createdAt).toLocaleDateString()}</span></span>
            {notification.type === "purchase" && <Download className="h-5 w-5 text-zinc-400" />}
          </button>;
        })}
        {notifications.length === 0 && <div className="flex min-h-[50dvh] flex-col items-center justify-center px-8 text-center"><span className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-900"><Bell className="h-8 w-8 text-zinc-400" /></span><h2 className="mt-5 text-lg font-bold">No notifications yet</h2><p className="mt-2 text-sm text-zinc-500">Community activity, purchases, and creator updates will appear here.</p></div>}
      </section>
    </main>
  );
}
