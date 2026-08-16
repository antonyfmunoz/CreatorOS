import { useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Bell, Contrast, Database, LogOut, ShieldCheck } from "lucide-react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import NativeMobileControls from "@/components/system/NativeMobileControls";

type UserSettings = {
  pushNotificationsEnabled: boolean;
  colorMode: "dark" | "high_contrast";
};

export default function SettingsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { signOut } = useAuth();
  const settings = useQuery<UserSettings>({ queryKey: ["/api/user/settings"] });
  const update = useMutation({
    mutationFn: async (patch: Partial<UserSettings>) => {
      const response = await apiRequest("PATCH", "/api/user/settings", patch);
      return response.json() as Promise<UserSettings>;
    },
    onSuccess: (value) => {
      queryClient.setQueryData(["/api/user/settings"], value);
      toast({ title: "Settings saved", description: "Your preference will follow this account." });
    },
    onError: (error: Error) => toast({ title: "Settings were not saved", description: error.message, variant: "destructive" }),
  });

  useEffect(() => {
    document.documentElement.dataset.colorMode = settings.data?.colorMode ?? "dark";
  }, [settings.data?.colorMode]);

  const current = settings.data ?? { pushNotificationsEnabled: true, colorMode: "dark" as const };

  return (
    <main className="min-h-dvh bg-black pb-24 text-white">
      <header className="sticky top-0 z-20 flex h-16 items-center border-b border-zinc-800 bg-black px-4">
        <Button variant="ghost" size="icon" aria-label="Back to profile" className="-ml-2 text-white hover:bg-zinc-900" onClick={() => setLocation("/profile")}><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="ml-1 text-xl font-bold">Settings</h1>
      </header>

      <section aria-labelledby="notifications-heading" className="border-b border-zinc-900 px-4 py-6">
        <h2 id="notifications-heading" className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-400">Notifications</h2>
        <div className="mt-4 flex items-center gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-zinc-900"><Bell className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1"><p className="font-bold">Push notifications</p><p className="mt-1 text-sm leading-5 text-zinc-400">Allow account and community activity alerts on supported devices.</p></div>
          <Switch aria-label="Push notifications" checked={current.pushNotificationsEnabled} disabled={settings.isLoading || update.isPending} onCheckedChange={(checked) => update.mutate({ pushNotificationsEnabled: checked })} />
        </div>
        <NativeMobileControls enabled={current.pushNotificationsEnabled} />
      </section>

      <section aria-labelledby="display-heading" className="border-b border-zinc-900 px-4 py-6">
        <h2 id="display-heading" className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-400">Display</h2>
        <div className="mt-4 flex items-center gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-zinc-900"><Contrast className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1"><p className="font-bold">Color Mode</p><p className="mt-1 text-sm leading-5 text-zinc-400">Use the high-contrast version of the Stitch dark palette.</p></div>
          <Switch aria-label="High-contrast color mode" checked={current.colorMode === "high_contrast"} disabled={settings.isLoading || update.isPending} onCheckedChange={(checked) => update.mutate({ colorMode: checked ? "high_contrast" : "dark" })} />
        </div>
      </section>

      <section aria-labelledby="account-heading" className="px-4 py-6">
        <h2 id="account-heading" className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-400">Account</h2>
        <nav aria-label="Account settings" className="mt-4 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
          <Link href="/settings/privacy" className="flex items-center gap-3 border-b border-zinc-800 px-4 py-4 hover:bg-zinc-900"><Database className="h-5 w-5 text-zinc-300" /><span className="flex-1 font-bold">Data &amp; privacy</span><span aria-hidden="true" className="text-zinc-400">›</span></Link>
          <Link href="/trust" className="flex items-center gap-3 px-4 py-4 hover:bg-zinc-900"><ShieldCheck className="h-5 w-5 text-zinc-300" /><span className="flex-1 font-bold">Trust Center</span><span aria-hidden="true" className="text-zinc-400">›</span></Link>
        </nav>
        <Button variant="outline" className="mt-8 h-12 w-full rounded-xl border-zinc-700 bg-white font-bold text-black hover:bg-zinc-200" onClick={() => void signOut({ redirectUrl: "/auth/login" })}><LogOut className="mr-2 h-4 w-4" />Log out</Button>
      </section>
    </main>
  );
}
