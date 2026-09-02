import { useEffect, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";

export function CutStudioFrameExport({ renders }: { renders: Array<{ id: string; state: string; output?: { filename?: string } }> }) {
  const complete = renders.filter((render) => render.state === "done");
  const [selectedId, setSelectedId] = useState("");
  const [frame, setFrame] = useState("0");
  const [format, setFormat] = useState("png");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const downloadUrl = useRef<string | null>(null);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current); }; }, []);
  const jobId = complete.some((render) => render.id === selectedId) ? selectedId : complete[0]?.id;
  if (!jobId) return null;
  const download = async () => {
    setBusy(true); setMessage("");
    try {
      const response = await apiRequest("GET", `/api/cut/jobs/${jobId}/still?frame=${encodeURIComponent(frame)}&format=${format}`);
      const blob = await response.blob();
      if (!active.current) return;
      if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
      downloadUrl.current = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl.current;
      link.download = `cut-${jobId.slice(0, 8)}-frame-${frame}.${format}`;
      document.body.appendChild(link); link.click(); link.remove();
      setMessage(`Frame ${frame} downloaded from the finished render. No new video render or public upload was created.`);
    } catch (error) {
      if (active.current) setMessage(error instanceof Error ? error.message : "Frame export failed.");
    } finally { if (active.current) setBusy(false); }
  };
  return <section aria-label="Export rendered frame" className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
    <h2 className="font-bold">Export a finished frame</h2>
    <p className="mt-1 text-xs text-zinc-500">Download a thumbnail or campaign image from a completed render. Frames start at 0. Renders up to 250 MB / 4K are supported.</p>
    <div className="mt-3 flex flex-wrap items-end gap-3 text-xs">
      <label className="min-w-0 flex-1">Finished render<select aria-label="Still source render" value={jobId} onChange={(event) => { setSelectedId(event.target.value); setMessage(""); }} className="mt-1 block w-full rounded-lg border border-zinc-700 bg-zinc-900 p-2">{complete.map((render) => <option key={render.id} value={render.id}>{render.output?.filename ?? "CutStudio render"} · {render.id.slice(0, 8)}</option>)}</select></label>
      <label>Frame<input aria-label="Still frame number" type="number" min={0} max={432000} step={1} value={frame} onChange={(event) => setFrame(event.target.value)} className="mt-1 block w-24 rounded-lg border border-zinc-700 bg-zinc-900 p-2"/></label>
      <label>Format<select aria-label="Still image format" value={format} onChange={(event) => setFormat(event.target.value)} className="mt-1 block rounded-lg border border-zinc-700 bg-zinc-900 p-2"><option value="png">PNG</option><option value="jpeg">JPEG</option><option value="webp">WebP</option></select></label>
      <Button size="sm" disabled={busy || !/^\d{1,7}$/.test(frame) || Number(frame) > 432000} onClick={() => void download()}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Download className="mr-2 h-4 w-4"/>}Download frame</Button>
    </div>
    {message && <p role="status" className="mt-3 text-xs text-zinc-300">{message}</p>}
  </section>;
}
