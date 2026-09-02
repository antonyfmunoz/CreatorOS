import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function CutStudioRenderPreview({ jobId, filename }: { jobId: string; filename: string }) {
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    setUrl(""); setError(""); setReady(false);
    if (open) void (async () => {
      try {
        const response = await apiRequest("GET", `/api/cut/jobs/${jobId}/media`);
        const descriptor = await response.json() as { url?: string };
        if (!descriptor.url) throw new Error("Missing private media URL");
        const media = new URL(descriptor.url, window.location.origin);
        if (!["https:", "http:"].includes(media.protocol) || media.username || media.password) throw new Error("Invalid media location");
        if (active) setUrl(media.href);
      } catch {
        if (active) setError("The private render could not be opened. Check your access and try again.");
      }
    })();
    return () => { active = false; };
  }, [open, jobId, attempt]);
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button size="sm" variant="outline" aria-label={`Preview rendered video ${filename}`}><Play className="mr-1.5 h-3.5 w-3.5"/>Preview</Button></DialogTrigger>
    <DialogContent className="max-h-[90dvh] max-w-4xl overflow-y-auto border-zinc-800 bg-zinc-950 text-white">
      <DialogHeader><DialogTitle>Render preview</DialogTitle><DialogDescription className="break-words text-zinc-400">{filename} · Private project media</DialogDescription></DialogHeader>
      <DialogClose asChild><Button size="sm" variant="outline" className="justify-self-end">Close</Button></DialogClose>
      {open && url && <video key={url} aria-label="Rendered video preview" className="max-h-[65dvh] w-full rounded-xl bg-black" controls playsInline preload="metadata" src={url} onLoadedMetadata={() => setReady(true)} onError={() => setError("This video could not be loaded. Refresh its private access and try again.")}/>}
      {error ? <div role="alert" className="space-y-3"><p>{error}</p><Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>Retry preview</Button></div> : <p role="status" className="text-sm text-zinc-400">{ready ? "Private video ready. Use the player to play, seek or adjust sound." : "Opening private video…"}</p>}
    </DialogContent>
  </Dialog>;
}
