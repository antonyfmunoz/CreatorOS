import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Eye, EyeOff, Flag, Loader2, Radio, RefreshCw, Square, Volume2, VolumeX } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { transitionBroadcastScene, validateBroadcastStudioConfig, type BroadcastStudioConfig } from "@shared/broadcast-studio";
import type { CaptureNodeConfiguration } from "@shared/broadcast-field";

type Session = { id: string; state: string; outputMode: "stream" | "recording"; createdAt: string };
type CaptureNode = { id: string; name: string; kind: string; status: string; lastSeenAt: string | null; configuration: CaptureNodeConfiguration; lastTelemetry: { device: { batteryPct: number | null; thermalState: string }; links: Array<{ active: boolean; uplinkKbps: number }> } | null };
type Studio = { id: string; name: string; revision: number; config: BroadcastStudioConfig; access: { role: string; canEdit: boolean; canOperate: boolean }; sessions: Session[] };

export default function BroadcastControlPage() {
  const { id = "" } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [studio, setStudio] = useState<Studio | null>(null);
  const [nodes, setNodes] = useState<CaptureNode[]>([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const [studioResponse, nodeResponse] = await Promise.all([
      apiRequest("GET", `/api/broadcast/studios/${id}`),
      apiRequest("GET", `/api/broadcast/studios/${id}/capture-nodes`),
    ]);
    setStudio(await studioResponse.json() as Studio);
    setNodes((await nodeResponse.json() as CaptureNode[]).filter((node) => node.status !== "revoked"));
  }, [id]);

  useEffect(() => {
    void load().catch((error) => setMessage(error instanceof Error ? error.message : "This control surface is unavailable"));
    const timer = window.setInterval(() => void load().catch(() => undefined), 3_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const persist = useCallback(async (config: BroadcastStudioConfig, success: string) => {
    if (!studio?.access.canOperate) return;
    setBusy("studio"); setMessage("");
    try {
      const response = await fetch(`/api/broadcast/studios/${studio.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json", "If-Match": String(studio.revision) },
        body: JSON.stringify({ name: studio.name, config: validateBroadcastStudioConfig(config) }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({})) as { message?: string };
        if (response.status === 409) await load();
        throw new Error(detail.message ?? "The studio changed before this control was applied");
      }
      const next = await response.json() as Studio;
      setStudio((current) => current ? { ...current, ...next, sessions: current.sessions } : next);
      setMessage(success);
    } catch (error) { setMessage(error instanceof Error ? error.message : "The production control could not be applied"); }
    finally { setBusy(""); }
  }, [load, studio]);

  const activeSession = useMemo(() => studio?.sessions.find((session) => ["starting", "live", "stopping"].includes(session.state)) ?? null, [studio]);
  const programScene = studio?.config.scenes.find((scene) => scene.id === studio.config.programSceneId);
  const previewScene = studio?.config.scenes.find((scene) => scene.id === studio.config.previewSceneId);

  const updateProgramSource = (sourceId: string, change: "mute" | "visibility") => {
    if (!studio || !programScene) return;
    const config = { ...studio.config, scenes: studio.config.scenes.map((scene) => scene.id !== programScene.id ? scene : { ...scene, sources: scene.sources.map((source) => source.id !== sourceId ? source : change === "visibility" ? { ...source, visible: !source.visible } : { ...source, muted: !source.muted }) }) };
    void persist(config, `${change === "mute" ? "Audio" : "Visibility"} updated on program.`);
  };

  const addMarker = async () => {
    if (!activeSession) return;
    setBusy("marker"); setMessage("");
    try { await apiRequest("POST", `/api/broadcast/sessions/${activeSession.id}/markers`, { kind: "highlight", label: "Remote highlight" }); setMessage("Highlight marker added to the live recording."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The marker could not be added"); }
    finally { setBusy(""); }
  };

  const stopOutput = async () => {
    if (!activeSession) return;
    setBusy("stop"); setMessage("");
    try { await apiRequest("POST", `/api/broadcast/sessions/${activeSession.id}/stop`, {}); await load(); setMessage("Output stopped safely. Recording recovery is continuing if needed."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The output could not be stopped"); }
    finally { setBusy(""); }
  };

  const configureNode = async (node: CaptureNode, changes: Partial<CaptureNodeConfiguration>, success: string) => {
    if (!studio || studio.access.role !== "owner") return;
    setBusy(`node:${node.id}`); setMessage("");
    try {
      await apiRequest("PATCH", `/api/broadcast/studios/${studio.id}/capture-nodes/${node.id}`, { configuration: { ...node.configuration, ...changes } });
      await load();
      setMessage(success);
    } catch (error) { setMessage(error instanceof Error ? error.message : "The device command could not be applied"); }
    finally { setBusy(""); }
  };

  if (!studio) return <main className="flex min-h-screen items-center justify-center bg-black text-white">{message || <Loader2 className="h-6 w-6 animate-spin"/>}</main>;
  return <main className="min-h-screen bg-black px-3 py-4 text-white">
    <section className="mx-auto max-w-xl space-y-3">
      <header className="sticky top-0 z-20 -mx-3 -mt-4 flex items-center gap-3 border-b border-zinc-800 bg-black/95 px-3 py-3 backdrop-blur">
        <Button size="icon" variant="ghost" aria-label="Back to Broadcast Studio" onClick={() => setLocation(`/broadcast?studio=${studio.id}`)}><ArrowLeft className="h-4 w-4"/></Button>
        <div className="min-w-0 flex-1"><h1 className="truncate text-sm font-black">{studio.name}</h1><p className="text-[10px] uppercase tracking-wider text-zinc-500">Mobile production control · {studio.access.role}</p></div>
        <Button size="icon" variant="ghost" aria-label="Refresh production control" onClick={() => void load()}><RefreshCw className="h-4 w-4"/></Button>
        <span className={`h-2.5 w-2.5 rounded-full ${activeSession?.state === "live" ? "animate-pulse bg-red-500" : "bg-zinc-600"}`}/>
      </header>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4" aria-label="Remote program and preview">
        <div className="grid grid-cols-2 gap-3"><div className="rounded-xl border border-red-900/70 bg-red-950/20 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-red-400">Program</p><p className="mt-1 truncate text-sm font-bold">{programScene?.name ?? "Unavailable"}</p></div><div className="rounded-xl border border-emerald-900/70 bg-emerald-950/20 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-emerald-400">Preview</p><p className="mt-1 truncate text-sm font-bold">{previewScene?.name ?? "Unavailable"}</p></div></div>
        <Button className="mt-3 w-full bg-red-600 text-white hover:bg-red-500" disabled={busy === "studio" || !studio.access.canOperate || programScene?.id === previewScene?.id} onClick={() => void persist(transitionBroadcastScene(studio.config), `Took ${previewScene?.name ?? "preview"} to program.`)}><Radio className="mr-2 h-4 w-4"/>{studio.config.transition.type === "cut" ? "Take" : studio.config.transition.type.replace("_", " ")}</Button>
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4" aria-label="Remote scene selection"><h2 className="text-sm font-black">Scenes</h2><div className="mt-3 grid grid-cols-2 gap-2">{studio.config.scenes.map((scene, index) => <Button key={scene.id} variant={scene.id === studio.config.previewSceneId ? "default" : "outline"} className="h-auto min-h-14 justify-start whitespace-normal text-left" disabled={busy === "studio" || !studio.access.canOperate} aria-label={`Preview scene ${scene.name}`} onClick={() => void persist({ ...studio.config, previewSceneId: scene.id }, `${scene.name} is ready in preview.`)}><span className="mr-2 rounded bg-black/30 px-1.5 py-0.5 text-[10px]">{index + 1}</span>{scene.name}</Button>)}</div></section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4" aria-label="Remote program sources"><h2 className="text-sm font-black">Program sources</h2><div className="mt-3 space-y-2">{programScene?.sources.slice().reverse().map((source) => <div key={source.id} className="flex items-center gap-2 rounded-xl bg-black p-3"><span className="min-w-0 flex-1 truncate text-xs font-bold">{source.name}</span><button aria-label={`${source.visible ? "Hide" : "Show"} ${source.name}`} disabled={busy === "studio"} onClick={() => updateProgramSource(source.id, "visibility")}>{source.visible ? <Eye className="h-4 w-4"/> : <EyeOff className="h-4 w-4 text-zinc-600"/>}</button><button aria-label={`${source.muted ? "Unmute" : "Mute"} ${source.name}`} disabled={busy === "studio"} onClick={() => updateProgramSource(source.id, "mute")}>{source.muted ? <VolumeX className="h-4 w-4 text-red-400"/> : <Volume2 className="h-4 w-4"/>}</button></div>)}</div></section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4" aria-label="Remote field device health">
        <h2 className="text-sm font-black">Field devices</h2>
        <div className="mt-3 space-y-2">
          {nodes.map((node) => {
            const uplink = node.lastTelemetry?.links.filter((link) => link.active).reduce((sum, link) => sum + link.uplinkKbps, 0) ?? 0;
            return <div key={node.id} className="rounded-xl bg-black p-3">
              <div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${node.status === "live" ? "bg-emerald-400" : ["degraded", "reconnecting"].includes(node.status) ? "bg-amber-400" : ["offline", "error"].includes(node.status) ? "bg-red-500" : "bg-zinc-600"}`}/><span className="min-w-0 flex-1 truncate text-xs font-bold">{node.name}</span><span className="text-[9px] uppercase text-zinc-600">{node.status}</span></div>
              <p className="mt-2 text-[10px] text-zinc-500">{Math.round(uplink / 100) / 10} Mbps · {node.lastTelemetry?.device.batteryPct == null ? "battery unknown" : `${Math.round(node.lastTelemetry.device.batteryPct)}% battery`} · {node.lastTelemetry?.device.thermalState ?? "no telemetry"}</p>
              {studio.access.role === "owner" && <div className="mt-3 grid grid-cols-3 gap-1.5">
                <Button size="sm" variant={node.configuration.requestedState === "live" ? "default" : "outline"} disabled={Boolean(busy)} aria-label={`Direct ${node.name} live`} onClick={() => void configureNode(node, { requestedState: "live" }, `${node.name} directed live.`)}>Live</Button>
                <Button size="sm" variant={node.configuration.requestedState === "standby" ? "default" : "outline"} disabled={Boolean(busy)} aria-label={`Direct ${node.name} standby`} onClick={() => void configureNode(node, { requestedState: "standby" }, `${node.name} directed to standby.`)}>Standby</Button>
                <Button size="sm" variant={node.configuration.requestedState === "paused" ? "default" : "outline"} disabled={Boolean(busy)} aria-label={`Pause ${node.name}`} onClick={() => void configureNode(node, { requestedState: "paused" }, `${node.name} paused.`)}>Pause</Button>
                <Button size="sm" variant="outline" disabled={Boolean(busy) || node.configuration.captureMode !== "camera"} aria-label={`Switch ${node.name} camera`} onClick={() => void configureNode(node, { cameraFacing: node.configuration.cameraFacing === "rear" ? "front" : "rear" }, `${node.name} camera switched.`)}>{node.configuration.cameraFacing}</Button>
                <Button size="sm" variant="outline" disabled={Boolean(busy)} aria-label={`${node.configuration.microphoneMuted ? "Unmute" : "Mute"} ${node.name} microphone`} onClick={() => void configureNode(node, { microphoneMuted: !node.configuration.microphoneMuted }, `${node.name} microphone updated.`)}>{node.configuration.microphoneMuted ? "Unmute" : "Mute"}</Button>
                <Button size="sm" variant="outline" disabled={Boolean(busy) || node.configuration.captureMode !== "camera"} aria-label={`${node.configuration.torchEnabled ? "Turn off" : "Turn on"} ${node.name} torch`} onClick={() => void configureNode(node, { torchEnabled: !node.configuration.torchEnabled }, `${node.name} torch updated.`)}>Torch</Button>
              </div>}
            </div>;
          })}
          {!nodes.length && <p className="rounded-xl border border-dashed border-zinc-800 p-3 text-center text-xs text-zinc-600">No field devices paired</p>}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2 pb-8"><Button variant="outline" disabled={!activeSession || busy === "marker"} onClick={() => void addMarker()}>{busy === "marker" ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Flag className="mr-2 h-4 w-4"/>}Highlight</Button><Button variant="destructive" disabled={!activeSession || busy === "stop"} onClick={() => void stopOutput()}>{busy === "stop" ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Square className="mr-2 h-4 w-4"/>}Stop output</Button></section>
      {message && <p role="status" className="fixed inset-x-3 bottom-3 z-30 mx-auto max-w-xl rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-center text-xs shadow-2xl">{message}</p>}
    </section>
  </main>;
}
