import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, Clock3, Film, Folder, FolderPlus, Image as ImageIcon, Loader2, Music2, Play, RefreshCw, Search, Shield, Trash2, Upload, X } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { sendOrQueueMediaUpload } from "@/lib/offline-queue";
import { MediaPlayer } from "@/components/media/MediaPlayer";

type MediaJob = { id: string; kind: string; state: string; progress: number; errorMessage?: string | null };
type Rendition = { id: string; role: string; renditionKey: string; mimeType: string; width?: number | null; height?: number | null; manifestType?: string | null };
type AssetTag = { id: string; tag: string };
type AssetRight = { id: string; rightsHolderName: string; basis: string; permittedUses: string[]; territories: string[]; validFrom: string; expiresAt: string | null; status: string; effectiveStatus: string; syntheticMedia: boolean; clonedVoice: boolean; notes: string };
type MediaAsset = {
  id: string;
  kind: string;
  mimeType: string | null;
  originalFilename: string | null;
  publicUrl: string | null;
  visibility: "public" | "private";
  status: string;
  sizeBytes: number | null;
  createdAt: string;
  metadata: Record<string, unknown>;
  collectionIds: string[];
  processing: MediaJob[];
  renditions: Rendition[];
  textTracks: Array<{ id: string; kind: string; language: string; label: string; isDefault: boolean }>;
  tags: AssetTag[];
  rights: AssetRight[];
  usageCount: number;
  duplicateCount: number;
};
type Collection = { id: string; name: string; description: string; color: string; itemCount: number };

function kindFor(file: File) {
  if (file.type.startsWith("image/")) return "photo";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return null;
}

function readableBytes(value: number | null) {
  if (!value) return "—";
  if (value < 1_000_000) return `${Math.max(1, Math.round(value / 1_000))} KB`;
  if (value < 1_000_000_000) return `${(value / 1_000_000).toFixed(1)} MB`;
  return `${(value / 1_000_000_000).toFixed(1)} GB`;
}

function assetIcon(asset: MediaAsset) {
  if (asset.mimeType?.startsWith("video/")) return Film;
  if (asset.mimeType?.startsWith("audio/")) return Music2;
  return ImageIcon;
}

function latestState(asset: MediaAsset) {
  if (asset.processing.some((job) => job.state === "failed")) return "attention";
  if (asset.processing.some((job) => job.state === "queued" || job.state === "running")) return "processing";
  return "ready";
}

export default function MediaLibraryPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const fileInput = useRef<HTMLInputElement>(null);
  const previewRequest = useRef(0);
  useEffect(() => () => { previewRequest.current += 1; }, []);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const [collectionId, setCollectionId] = useState("all");
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [newCollection, setNewCollection] = useState("");
  const [newTag, setNewTag] = useState("");
  const [rightsHolder, setRightsHolder] = useState("");
  const [rightsBasis, setRightsBasis] = useState("owner_declaration");
  const [rightsExpiry, setRightsExpiry] = useState("");
  const [syntheticMedia, setSyntheticMedia] = useState(false);
  const [clonedVoice, setClonedVoice] = useState(false);

  const assetsQuery = useQuery<MediaAsset[]>({
    queryKey: ["/api/media/assets"],
    queryFn: async () => (await apiRequest("GET", "/api/media/assets")).json(),
    refetchInterval: (query) => query.state.data?.some((asset) => asset.processing.some((job) => ["queued", "running"].includes(job.state))) ? 5_000 : false,
  });
  const collectionsQuery = useQuery<Collection[]>({ queryKey: ["/api/media/collections"], queryFn: async () => (await apiRequest("GET", "/api/media/collections")).json() });
  const assets = assetsQuery.data ?? [];
  const collections = collectionsQuery.data ?? [];
  const selected = assets.find((asset) => asset.id === selectedId) ?? null;
  const filtered = useMemo(() => assets.filter((asset) => {
    if (kind !== "all" && asset.kind !== kind) return false;
    if (collectionId !== "all" && !asset.collectionIds.includes(collectionId)) return false;
    return !search.trim() || `${asset.originalFilename ?? ""} ${asset.kind} ${asset.tags.map((tag) => tag.tag).join(" ")}`.toLowerCase().includes(search.trim().toLowerCase());
  }), [assets, collectionId, kind, search]);

  async function refresh() {
    // Cancel ownership of older snapshots before fetching the post-mutation
    // state. A manual setQueryData did not stop a late initial query from
    // replacing the freshly uploaded item with its pre-upload snapshot.
    await Promise.all([
      queryClient.cancelQueries({ queryKey: ["/api/media/assets"], exact: true }),
      queryClient.cancelQueries({ queryKey: ["/api/media/collections"], exact: true }),
    ]);
    await Promise.all([
      queryClient.fetchQuery({ queryKey: ["/api/media/assets"], staleTime: 0, queryFn: async () => (await apiRequest("GET", `/api/media/assets?refresh=${Date.now()}`)).json() as Promise<MediaAsset[]> }),
      queryClient.fetchQuery({ queryKey: ["/api/media/collections"], staleTime: 0, queryFn: async () => (await apiRequest("GET", `/api/media/collections?refresh=${Date.now()}`)).json() as Promise<Collection[]> }),
    ]);
  }

  async function upload(file: File) {
    const mediaKind = kindFor(file);
    if (!mediaKind) return setMessage("Choose an image, video, or audio file.");
    if (!user) return setMessage("Sign in before uploading media.");
    setBusy("upload"); setMessage("");
    try {
      const result = await sendOrQueueMediaUpload({ ownerUserId: user.id, file, kind: mediaKind, visibility });
      if (result.state === "queued") {
        setMessage(`${file.name} is protected on this device and will upload when the connection recovers.`);
      } else {
        await refresh();
        setMessage(`${file.name} is in your library and processing now.`);
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "Upload failed"); }
    finally { setBusy(null); }
  }

  async function openAsset(asset: MediaAsset) {
    const request = ++previewRequest.current;
    setSelectedId(asset.id); setPreviewUrl(null); setBusy(`preview:${asset.id}`);
    const primaryRight = asset.rights[0];
    setRightsHolder(primaryRight?.rightsHolderName ?? ""); setRightsBasis(primaryRight?.basis ?? "owner_declaration"); setRightsExpiry(primaryRight?.expiresAt?.slice(0, 10) ?? ""); setSyntheticMedia(primaryRight?.syntheticMedia ?? false); setClonedVoice(primaryRight?.clonedVoice ?? false);
    try {
      const access = await (await apiRequest("GET", `/api/assets/${asset.id}/access`)).json();
      if (request === previewRequest.current) setPreviewUrl(access.url);
    }
    catch (error) { if (request === previewRequest.current) setMessage(error instanceof Error ? error.message : "Preview unavailable"); }
    finally { if (request === previewRequest.current) setBusy(current => current === `preview:${asset.id}` ? null : current); }
  }

  async function addTag() {
    if (!selected || !newTag.trim()) return;
    setBusy("tag");
    try { await apiRequest("POST", `/api/media/assets/${selected.id}/tags`, { tag: newTag.trim().toLowerCase() }); setNewTag(""); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Tag could not be added"); }
    finally { setBusy(null); }
  }

  async function removeTag(tag: string) {
    if (!selected) return;
    setBusy(`tag:${tag}`);
    try { await apiRequest("DELETE", `/api/media/assets/${selected.id}/tags/${encodeURIComponent(tag)}`); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Tag could not be removed"); }
    finally { setBusy(null); }
  }

  async function saveRights() {
    if (!selected || !rightsHolder.trim()) return;
    const current = selected.rights[0];
    setBusy("rights");
    const payload = { rightsHolderName: rightsHolder.trim(), basis: rightsBasis, permittedUses: ["all"], territories: ["worldwide"], validFrom: current?.validFrom ?? new Date().toISOString(), expiresAt: rightsExpiry ? new Date(`${rightsExpiry}T23:59:59.999Z`).toISOString() : null, evidenceAssetId: null, syntheticMedia, clonedVoice, notes: current?.notes ?? "" };
    try { await apiRequest(current ? "PATCH" : "POST", current ? `/api/media/assets/${selected.id}/rights/${current.id}` : `/api/media/assets/${selected.id}/rights`, payload); await refresh(); setMessage("Rights and provenance saved."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Rights could not be saved"); }
    finally { setBusy(null); }
  }

  async function setRightsStatus(status: "active" | "revoked" | "disputed") {
    if (!selected?.rights[0]) return;
    setBusy("rights-status");
    try { await apiRequest("POST", `/api/media/assets/${selected.id}/rights/${selected.rights[0].id}/status`, { status }); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Rights status could not be changed"); }
    finally { setBusy(null); }
  }

  async function createCollection() {
    if (!newCollection.trim()) return;
    setBusy("collection");
    try { await apiRequest("POST", "/api/media/collections", { name: newCollection.trim(), description: "", color: "#1d9bf0" }); setNewCollection(""); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Collection could not be created"); }
    finally { setBusy(null); }
  }

  async function toggleCollection(id: string) {
    if (!selected) return;
    const present = selected.collectionIds.includes(id);
    setBusy(`collection:${id}`);
    try { await apiRequest(present ? "DELETE" : "POST", `/api/media/collections/${id}/assets/${selected.id}`, present ? undefined : {}); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Collection could not be updated"); }
    finally { setBusy(null); }
  }

  async function jobAction(job: MediaJob, action: "retry" | "cancel") {
    setBusy(`${action}:${job.id}`);
    try { await apiRequest("POST", `/api/media/jobs/${job.id}/${action}`, {}); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Media job could not be updated"); }
    finally { setBusy(null); }
  }

  async function removeAsset(asset: MediaAsset) {
    if (!window.confirm(`Remove ${asset.originalFilename ?? "this asset"} from your library?`)) return;
    previewRequest.current += 1;
    setBusy(`delete:${asset.id}`);
    try { await apiRequest("DELETE", `/api/assets/${asset.id}`); setSelectedId(null); setPreviewUrl(null); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Asset could not be removed"); }
    finally { setBusy(null); }
  }

  return <main className="min-h-[calc(100dvh-3.5rem)] bg-black pb-24 text-white">
    <header className="sticky top-0 z-30 border-b border-zinc-800 bg-black/95 backdrop-blur"><div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4"><Button variant="ghost" size="icon" className="-ml-2 rounded-full" onClick={() => setLocation("/create")} aria-label="Back to Create"><ArrowLeft className="h-5 w-5"/></Button><div className="min-w-0 flex-1"><h1 className="text-lg font-black">Media Cloud</h1><p className="text-[10px] text-zinc-500">One library across every CreativesOS instrument</p></div><select aria-label="Upload visibility" value={visibility} onChange={(event) => setVisibility(event.target.value as typeof visibility)} className="h-9 rounded-lg border border-zinc-700 bg-zinc-950 px-2 text-xs"><option value="private">Private</option><option value="public">Public</option></select><Button size="sm" className="bg-[#1d9bf0] font-bold text-black hover:bg-[#1d9bf0]/90" disabled={busy === "upload"} onClick={() => fileInput.current?.click()}>{busy === "upload" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin"/> : <Upload className="mr-1.5 h-4 w-4"/>}Upload</Button><input ref={fileInput} className="sr-only" type="file" accept="image/*,video/*,audio/*" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void upload(file); }}/></div></header>
    <div className="mx-auto grid max-w-6xl gap-4 px-4 py-5 lg:grid-cols-[220px_minmax(0,1fr)_300px]">
      <aside className="space-y-4"><section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3"><p className="px-1 text-[10px] font-black uppercase tracking-widest text-zinc-500">Collections</p><button className={`mt-2 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs ${collectionId === "all" ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-900"}`} onClick={() => setCollectionId("all")}><Folder className="h-4 w-4"/>All assets<span className="ml-auto">{assets.length}</span></button>{collections.map((collection) => <button key={collection.id} className={`mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs ${collectionId === collection.id ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-900"}`} onClick={() => setCollectionId(collection.id)}><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: collection.color }}/><span className="min-w-0 flex-1 truncate">{collection.name}</span><span>{collection.itemCount}</span></button>)}<div className="mt-3 flex gap-1"><Input aria-label="New collection name" value={newCollection} onChange={(event) => setNewCollection(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void createCollection()} placeholder="New collection" className="h-8 border-zinc-800 bg-black text-xs"/><Button size="icon" variant="outline" className="h-8 w-8 shrink-0" disabled={!newCollection.trim() || busy === "collection"} onClick={() => void createCollection()} aria-label="Create collection"><FolderPlus className="h-3.5 w-3.5"/></Button></div></section>
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3"><p className="px-1 text-[10px] font-black uppercase tracking-widest text-zinc-500">Type</p>{["all", "photo", "video", "audio"].map((value) => <button key={value} className={`mt-1 block w-full rounded-lg px-2 py-2 text-left text-xs capitalize ${kind === value ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-900"}`} onClick={() => setKind(value)}>{value}</button>)}</section>
      </aside>
      <section><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"/><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search filename or media type" aria-label="Search media library" className="border-zinc-800 bg-zinc-950 pl-9"/></div>{message && <div className="mt-3 flex items-start gap-2 rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-300"><span className="min-w-0 flex-1">{message}</span><button onClick={() => setMessage("")} aria-label="Dismiss"><X className="h-4 w-4"/></button></div>}
        {assetsQuery.isLoading ? <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-[#1d9bf0]"/></div> : filtered.length ? <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{filtered.map((asset) => { const Icon = assetIcon(asset); const state = latestState(asset); const poster = asset.renditions.find((item) => item.role === "poster"); return <button key={asset.id} onClick={() => void openAsset(asset)} className={`overflow-hidden rounded-2xl border text-left transition-colors ${selected?.id === asset.id ? "border-[#1d9bf0] bg-[#1d9bf0]/10" : "border-zinc-800 bg-zinc-950 hover:border-zinc-600"}`}><div className="relative flex aspect-video items-center justify-center bg-zinc-900">{asset.mimeType?.startsWith("image/") && asset.publicUrl ? <img src={asset.publicUrl} alt="" className="h-full w-full object-cover"/> : poster && asset.visibility === "public" ? <ImageIcon className="h-8 w-8 text-zinc-600"/> : <Icon className="h-8 w-8 text-zinc-600"/>}<span className={`absolute right-2 top-2 rounded-full px-2 py-1 text-[9px] font-black uppercase ${state === "ready" ? "bg-emerald-500/20 text-emerald-300" : state === "processing" ? "bg-amber-500/20 text-amber-300" : "bg-red-500/20 text-red-300"}`}>{state}</span>{asset.visibility === "private" && <Shield className="absolute bottom-2 right-2 h-3.5 w-3.5 text-zinc-400"/>}</div><div className="p-3"><p className="truncate text-xs font-bold">{asset.originalFilename ?? `${asset.kind} asset`}</p><p className="mt-1 text-[10px] text-zinc-500">{asset.kind} · {readableBytes(asset.sizeBytes)}</p></div></button>; })}</div> : <div className="mt-4 flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-950 px-6 text-center"><Upload className="h-8 w-8 text-zinc-600"/><h2 className="mt-3 text-sm font-bold">No matching media</h2><p className="mt-1 max-w-xs text-xs leading-5 text-zinc-500">Upload once, organize it here, then reuse it in posts, products, courses, CutStudio, Broadcast, UGC, and distribution.</p></div>}
      </section>
      <aside>{selected ? <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"><div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-900">{(() => { const Icon = assetIcon(selected); return <Icon className="h-5 w-5"/>; })()}</div><div className="min-w-0 flex-1"><h2 className="truncate text-sm font-black">{selected.originalFilename ?? "Media asset"}</h2><p className="mt-1 text-[10px] text-zinc-500">{new Date(selected.createdAt).toLocaleString()}</p></div><button disabled={busy === `delete:${selected.id}`} onClick={() => void removeAsset(selected)} aria-label="Remove asset"><Trash2 className="h-4 w-4 text-zinc-500 hover:text-red-400"/></button></div>
          <div className="mt-4 flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-black">{busy === `preview:${selected.id}` ? <Loader2 className="h-6 w-6 animate-spin"/> : previewUrl && selected.mimeType?.startsWith("video/") ? <MediaPlayer key={selected.id} assetId={selected.id} fallbackSrc={previewUrl} telemetryContext={{ surface: "media_library" }} aria-label="Media library video preview" controls playsInline preload="metadata" className="h-full w-full"/> : previewUrl && selected.mimeType?.startsWith("audio/") ? <audio key={previewUrl} src={previewUrl} controls preload="metadata" className="w-[90%]"/> : previewUrl && selected.mimeType?.startsWith("image/") ? <img src={previewUrl} alt={selected.originalFilename ?? "Asset preview"} className="h-full w-full object-contain"/> : <Play className="h-8 w-8 text-zinc-700"/>}</div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-[10px]"><div className="rounded-lg bg-black p-2"><span className="text-zinc-600">Visibility</span><strong className="mt-1 block capitalize">{selected.visibility}</strong></div><div className="rounded-lg bg-black p-2"><span className="text-zinc-600">Renditions</span><strong className="mt-1 block">{selected.renditions.length}</strong></div><div className="rounded-lg bg-black p-2"><span className="text-zinc-600">Active uses</span><strong className="mt-1 block">{selected.usageCount}</strong></div><div className="rounded-lg bg-black p-2"><span className="text-zinc-600">Duplicates</span><strong className="mt-1 block">{selected.duplicateCount}</strong></div><div className="rounded-lg bg-black p-2"><span className="text-zinc-600">Captions</span><strong className="mt-1 block">{selected.textTracks.length}</strong></div><div className="rounded-lg bg-black p-2"><span className="text-zinc-600">Size</span><strong className="mt-1 block">{readableBytes(selected.sizeBytes)}</strong></div></div>
          <h3 className="mt-5 text-[10px] font-black uppercase tracking-widest text-zinc-500">Tags</h3><div className="mt-2 flex flex-wrap gap-1.5">{selected.tags.map((tag) => <button key={tag.id} disabled={busy === `tag:${tag.tag}`} onClick={() => void removeTag(tag.tag)} className="rounded-full border border-zinc-700 px-2 py-1 text-[10px] text-zinc-300 hover:border-red-500 hover:text-red-300" title="Remove tag">#{tag.tag} ×</button>)}</div><div className="mt-2 flex gap-1"><Input aria-label="New asset tag" value={newTag} onChange={(event) => setNewTag(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void addTag()} placeholder="campaign-tag" className="h-8 border-zinc-800 bg-black text-xs"/><Button size="sm" variant="outline" className="h-8" disabled={!newTag.trim() || busy === "tag"} onClick={() => void addTag()}>Add</Button></div>
          <h3 className="mt-5 text-[10px] font-black uppercase tracking-widest text-zinc-500">Rights & provenance</h3><div className="mt-2 space-y-2 rounded-xl bg-black p-3"><div className="flex items-center justify-between gap-2"><span className="text-[10px] text-zinc-500">Effective state</span><strong className={`text-[10px] uppercase ${selected.rights[0]?.effectiveStatus === "active" ? "text-emerald-300" : "text-red-300"}`}>{selected.rights[0]?.effectiveStatus ?? "undeclared"}</strong></div><Input aria-label="Rights holder" value={rightsHolder} onChange={(event) => setRightsHolder(event.target.value)} placeholder="Rights holder" className="h-8 border-zinc-800 bg-zinc-950 text-xs"/><select aria-label="Rights basis" value={rightsBasis} onChange={(event) => setRightsBasis(event.target.value)} className="h-8 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 text-xs"><option value="owner_declaration">Owner declaration</option><option value="work_for_hire">Work for hire</option><option value="assignment">Assignment</option><option value="license">License</option><option value="public_domain">Public domain</option><option value="platform_grant">Platform grant</option><option value="contributor_release">Contributor release</option></select><label className="block text-[10px] text-zinc-500">Expires<input aria-label="Rights expiration" type="date" value={rightsExpiry} onChange={(event) => setRightsExpiry(event.target.value)} className="mt-1 h-8 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 text-xs text-white"/></label><label className="flex items-center gap-2 text-[10px] text-zinc-300"><input type="checkbox" checked={syntheticMedia} onChange={(event) => setSyntheticMedia(event.target.checked)}/>Contains synthetic media</label><label className="flex items-center gap-2 text-[10px] text-zinc-300"><input type="checkbox" checked={clonedVoice} onChange={(event) => setClonedVoice(event.target.checked)}/>Contains cloned voice</label><div className="flex gap-1"><Button size="sm" className="h-8 flex-1 bg-[#1d9bf0] text-black" disabled={!rightsHolder.trim() || busy === "rights"} onClick={() => void saveRights()}>Save rights</Button>{selected.rights[0]?.effectiveStatus === "active" ? <Button size="sm" variant="outline" className="h-8 text-red-300" disabled={busy === "rights-status"} onClick={() => void setRightsStatus("revoked")}>Revoke</Button> : <Button size="sm" variant="outline" className="h-8 text-emerald-300" disabled={busy === "rights-status"} onClick={() => void setRightsStatus("active")}>Restore</Button>}</div></div>
          <h3 className="mt-5 text-[10px] font-black uppercase tracking-widest text-zinc-500">Collections</h3><div className="mt-2 flex flex-wrap gap-1.5">{collections.length ? collections.map((collection) => { const added = selected.collectionIds.includes(collection.id); return <button key={collection.id} disabled={busy === `collection:${collection.id}`} onClick={() => void toggleCollection(collection.id)} className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] ${added ? "border-[#1d9bf0] bg-[#1d9bf0]/10 text-[#1d9bf0]" : "border-zinc-700 text-zinc-400"}`}>{added && <Check className="h-3 w-3"/>}{collection.name}</button>; }) : <p className="text-[10px] text-zinc-600">Create a collection to organize this asset.</p>}</div>
          <h3 className="mt-5 text-[10px] font-black uppercase tracking-widest text-zinc-500">Processing</h3><div className="mt-2 space-y-2">{selected.processing.length ? selected.processing.map((job) => <div key={job.id} className="rounded-lg bg-black p-2"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${job.state === "succeeded" ? "bg-emerald-400" : job.state === "failed" ? "bg-red-400" : "bg-amber-400"}`}/><span className="min-w-0 flex-1 text-[10px] font-bold capitalize">{job.kind.replace("_", " ")}</span><span className="text-[9px] uppercase text-zinc-600">{job.state}</span>{job.state === "failed" && <button onClick={() => void jobAction(job, "retry")} aria-label={`Retry ${job.kind}`}><RefreshCw className="h-3 w-3"/></button>}{["queued", "running"].includes(job.state) && <button onClick={() => void jobAction(job, "cancel")} aria-label={`Cancel ${job.kind}`}><X className="h-3 w-3"/></button>}</div>{["queued", "running"].includes(job.state) && <div className="mt-2 h-1 overflow-hidden rounded bg-zinc-800"><div className="h-full bg-[#1d9bf0]" style={{ width: `${Math.max(5, job.progress * 100)}%` }}/></div>}{job.errorMessage && <p className="mt-1 text-[9px] leading-4 text-red-300">{job.errorMessage}</p>}</div>) : <p className="text-[10px] text-zinc-600">No derived-media jobs yet.</p>}</div>
          <div className="mt-5 grid grid-cols-2 gap-2"><Button variant="outline" size="sm" onClick={() => setLocation(`/cut-studio?asset=${selected.id}`)} disabled={!selected.mimeType?.startsWith("video/") && !selected.mimeType?.startsWith("audio/")}><Film className="mr-1 h-3.5 w-3.5"/>Edit</Button><Button variant="outline" size="sm" onClick={() => setLocation(`/studio?asset=${selected.id}`)}><Clock3 className="mr-1 h-3.5 w-3.5"/>Distribute</Button></div>
        </section> : <section className="hidden rounded-2xl border border-zinc-800 bg-zinc-950 p-6 text-center lg:block"><Folder className="mx-auto h-7 w-7 text-zinc-700"/><p className="mt-3 text-xs font-bold">Select an asset</p><p className="mt-1 text-[10px] leading-4 text-zinc-600">Preview, organize, inspect renditions, and control processing.</p></section>}</aside>
    </div>
  </main>;
}
