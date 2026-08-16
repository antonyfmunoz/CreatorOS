import { useEffect, useState } from "react";
import { BellRing, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  isNativeRuntime,
  nativeInstallationId,
  nativePushPermission,
  registerNativePush,
  revokeNativePush,
} from "@/lib/native-runtime";
import { apiRequest } from "@/lib/queryClient";

export default function NativeMobileControls({ enabled }: { enabled: boolean }) {
  const { toast } = useToast();
  const [permission, setPermission] = useState<string>("unknown");
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const native = isNativeRuntime();

  useEffect(() => {
    if (native) {
      void nativePushPermission().then(setPermission);
      void apiRequest("GET", "/api/mobile/devices")
        .then((response) => response.json())
        .then((body: { devices?: Array<{ installationId: string; status: string }> }) => {
          setConnected(Boolean(body.devices?.some((device) => device.installationId === nativeInstallationId() && device.status === "active")));
        })
        .catch(() => setConnected(false));
    }
  }, [native]);

  if (!native) return null;

  const enable = async () => {
    setBusy(true);
    try {
      await registerNativePush();
      setPermission("granted");
      setConnected(true);
      toast({ title: "Device connected", description: "This installation can now receive CreativesOS notifications." });
    } catch (error) {
      toast({ title: "Device was not connected", description: error instanceof Error ? error.message : "Try again from device settings.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await revokeNativePush();
      setConnected(false);
      toast({ title: "Device disconnected", description: "CreativesOS will no longer target this installation." });
    } catch (error) {
      toast({ title: "Device was not disconnected", description: error instanceof Error ? error.message : "Try again.", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#1d9bf0]/15 text-[#1d9bf0]"><Smartphone className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">This mobile device</p>
          <p className="mt-1 text-sm leading-5 text-zinc-400">{connected ? "Connected" : "Not connected"}. Permission: {permission}. Tokens are encrypted and never returned by the API.</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button disabled={busy || !enabled || connected} onClick={() => void enable()} className="bg-[#1d9bf0] font-bold text-black hover:bg-[#1a8cd8]"><BellRing className="mr-2 h-4 w-4" />Enable</Button>
        <Button disabled={busy || !connected} variant="outline" onClick={() => void disconnect()} className="border-zinc-700 bg-black font-bold text-white hover:bg-zinc-900">Disconnect</Button>
      </div>
    </div>
  );
}
