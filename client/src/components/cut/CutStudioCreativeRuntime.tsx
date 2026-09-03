import { useEffect, useMemo, useRef, useState } from "react";
import { Boxes, Camera, Check, ChevronDown, ChevronUp, Clapperboard, Loader2, Play, Plus, Sparkles, Workflow } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { CompositionAuthoringControls, CompositionVariantBatchControls, WorkflowAuthoringEditor } from "@/components/cut/CutStudioAuthoringEditors";
import { CutStudioCompositionPreview } from "@/components/cut/CutStudioCompositionPreview";
import { CutStudioSourceEditor, sourceDraftDirty, sourceDraftIdentity, type CutSourceDraft } from "@/components/cut/CutStudioSourceEditor";
import { buildCutSourceZip, starterCutSource, type CutSourceFile } from "@shared/cut-code-authoring";
import { generateCutSourceLockfile } from "@shared/cut-code-lockfile";
import { CutCreativeDrafts } from "@/lib/cut-creative-drafts";
import { motionTemplate } from "@/lib/cut-motion-templates";
import type { CutEdl } from "@shared/cut-studio";
import { type CutCodeCapsule, type CutCompositionManifest, type CutGenerativeWorkflow, type CutProductionBrief, type CutShotSpec } from "@shared/cut-studio-production";

type ProjectInput = { id: string; sourceAssetId: string; name: string; duration: number; mediaKind: "video" | "audio"; revision: number };
type ProjectMediaInput = { id: string; assetId: string; name: string; duration: number; mediaKind: "video" | "audio" | "image" | "font" | "lottie" | "rive" | "code_source" | "code_lockfile" };
type CompositionRow = { id: string; name: string; mode: "declarative" | "sandboxed_tsx"; manifest: CutCompositionManifest; codeCapsule: CutCodeCapsule | null; revision: number };
type PlanRow = { id: string; brief: CutProductionBrief; revision: number };
type ShotRow = { id: string; sequence: number; spec: CutShotSpec; revision: number; status: string; selectedVariantId?: string | null };
type JobRow = { id: string; shotId: string; provider: string; model: string; state: string; detail: string; createdAt: string };
type VariantRow = { id: string; shotId: string; generationJobId?: string | null; assetId?: string | null; provider: string; model: string; seed?: number | null; status: "candidate" | "selected" | "rejected" | "superseded"; provenance: Record<string, unknown> };
type WorkflowRow = { id: string; workflow: CutGenerativeWorkflow; revision: number };
type ProviderRow = { id: string; label: string; configured: boolean; capabilities: readonly string[] };
type RuntimePayload = {
  compositionRuntime: { declarative: string; packageAuthoring: string; isolatedCode: string; networkPolicy: string };
  generationRuntime: { dispatchEnabled: boolean; providers: ProviderRow[] };
  compositions: CompositionRow[];
  plan: PlanRow | null;
  elements: Array<{ id: string; spec: { kind: string; name: string } }>;
  shots: ShotRow[];
  jobs: JobRow[];
  workflows: WorkflowRow[];
  variants: VariantRow[];
};

const field = "mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-xs text-white outline-none focus:border-[#1d9bf0]";


function starterBrief(project: ProjectInput): CutProductionBrief {
  return { version: 1, title: project.name, objective: "", audience: "", genre: "general", era: "contemporary", tone: [], required: [], forbidden: [], referenceAssetIds: [], defaultAspect: "16:9", defaultResolution: "1080p", defaultFps: 24, pacing: "custom" };
}

function starterShot(name: string, prompt: string): CutShotSpec {
  return { version: 1, name, prompt, negativePrompt: "text artifacts, unstable identity, unwanted logos", durationSeconds: 5, aspect: "16:9", resolution: "1080p", fps: 24, operation: "text_to_video", model: "auto", seed: null, elementIds: [], firstFrameAssetId: null, lastFrameAssetId: null, visualReferenceAssetIds: [], motionReferenceAssetId: null, audioReferenceAssetId: null, camera: { cameraBody: "virtual cinema camera", lens: "spherical prime", focalLengthMm: 35, aperture: 2.8, shutterAngle: 180, iso: 800, filmStock: "digital neutral", movements: [{ kind: "dolly", direction: "in", intensity: .35, start: 0, end: 1 }] }, lighting: "soft motivated key with natural contrast", emotion: "confident", colorGrade: { preset: "cinematic neutral", temperature: 0, contrast: 1, saturation: 1 }, audioMode: "native", safety: { rightsConfirmed: false, likenessConsentConfirmed: false, syntheticMediaDisclosure: true } };
}

export function CutStudioCreativeRuntime({ project, media, onSaveCodeSource, onTimelineApplied: applyTimeline, onRenderBatchQueued: renderBatchQueued, onTimelineBusyChange, onUnsavedChange }: { project: ProjectInput; media: ProjectMediaInput[]; onSaveCodeSource: (file: File, lockfile?: File) => Promise<{ assetId: string; lockfileAssetId?: string }>; onTimelineApplied: (result: { edl: CutEdl; duration: number; revision: number }) => void; onRenderBatchQueued: () => void; onTimelineBusyChange?: (busy: boolean) => void; onUnsavedChange?: (dirty: boolean) => void }) {
  const [serverRuntime, setRuntime] = useState<RuntimePayload | null>(null);
  const compositions = useRef(new CutCreativeDrafts<CompositionRow, "manifest">("manifest"));
  const workflows = useRef(new CutCreativeDrafts<WorkflowRow, "workflow">("workflow"));
  const briefs = useRef(new CutCreativeDrafts<PlanRow, "brief">("brief"));
  const [, rerenderDrafts] = useState(0);
  const alive = useRef(true);
  const refreshGeneration = useRef(0);
  const actionPending = useRef(false);
  const [sourceDraft, setSourceDraft] = useState<CutSourceDraft | null>(null);
  const sourceDraftRef = useRef<CutSourceDraft | null>(null);
  const serverBrief: PlanRow = { id: "brief", revision: serverRuntime?.plan?.revision ?? 0, brief: serverRuntime?.plan?.brief ?? starterBrief(project) };
  const briefRow = briefs.current.view([serverBrief])[0];
  const brief = briefRow.brief;
  const runtime = serverRuntime ? { ...serverRuntime, compositions: compositions.current.view(serverRuntime.compositions), workflows: workflows.current.view(serverRuntime.workflows) } : null;
  const unsavedCount = compositions.current.size + workflows.current.size + briefs.current.size + Number(sourceDraftDirty(sourceDraft));
  const conflictCount = compositions.current.conflicts(serverRuntime?.compositions ?? []) + workflows.current.conflicts(serverRuntime?.workflows ?? []) + briefs.current.conflicts([serverBrief]);
  const notifyDrafts = () => {
    if (!alive.current) return;
    rerenderDrafts((value) => value + 1);
    onUnsavedChange?.(compositions.current.size + workflows.current.size + briefs.current.size > 0 || sourceDraftDirty(sourceDraftRef.current));
  };
  const changeSource = (draft: CutSourceDraft | null) => {
    sourceDraftRef.current = draft; setSourceDraft(draft); notifyDrafts();
  };
  const setBrief = (value: CutProductionBrief) => { briefs.current.edit(briefRow, value, serverBrief); notifyDrafts(); };
  const onTimelineApplied: typeof applyTimeline = (result) => { if (alive.current) applyTimeline(result); };
  const onRenderBatchQueued = () => { if (alive.current) renderBatchQueued(); };
  const [section, setSection] = useState<"motion" | "cinema" | "workflows">("motion");
  const [expanded, setExpanded] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [shotName, setShotName] = useState("Opening shot");
  const [shotPrompt, setShotPrompt] = useState("A cinematic opening that establishes the subject, environment, and creative promise");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [candidateAssetByShot, setCandidateAssetByShot] = useState<Record<string, string>>({});
  const [codeName, setCodeName] = useState(`${project.name} · code composition`);
  const [codeEntrypoint, setCodeEntrypoint] = useState("src/index.tsx");
  const [codeSourceAssetId, setCodeSourceAssetId] = useState("");
  const [codeLockfileAssetId, setCodeLockfileAssetId] = useState("");

  const refresh = async () => {
    const generation = ++refreshGeneration.current;
    const next = await (await apiRequest("GET", `/api/cut/projects/${project.id}/creative-runtime`)).json() as RuntimePayload;
    if (!alive.current || generation !== refreshGeneration.current) return;
    setRuntime(next);
  };

  useEffect(() => {
    alive.current = true;
    setRuntime(null); setMessage("");
    onUnsavedChange?.(false);
    void refresh().catch((error) => { if (alive.current) setMessage(error instanceof Error ? error.message : "Creative runtime could not load"); });
    return () => { alive.current = false; ++refreshGeneration.current; };
  }, [project.id]);
  useEffect(() => {
    setCodeSourceAssetId((current) => current || media.find((item) => item.mediaKind === "code_source")?.assetId || "");
  }, [media]);
  // CompositionFonts owns the active manifest's font loading and visible
  // readiness/error state. Do not eagerly fetch every library font here (the
  // media descriptor route returns JSON, not a font, and failures were hidden).
  const waitingJobs = useMemo(() => runtime?.jobs.filter((job) => job.state === "provider_pending").length ?? 0, [runtime]);
  const hasRenderedAnimationLayers = useMemo(() => runtime?.compositions.some((composition) => composition.manifest.layers.some((layer) => layer.kind === "lottie" || layer.kind === "rive")) ?? false, [runtime]);

  const act = async (key: string, action: () => Promise<void>) => {
    if (actionPending.current || !alive.current) return;
    actionPending.current = true;
    onTimelineBusyChange?.(true);
    setBusy(key); setMessage("");
    try { await action(); } catch (error) { setMessage(error instanceof Error ? error.message : "That action could not be completed"); }
    finally {
      actionPending.current = false;
      compositions.current.endPending(); workflows.current.endPending(); briefs.current.endPending();
      if (alive.current) { setBusy(""); onTimelineBusyChange?.(false); notifyDrafts(); }
    }
  };

  const createComposition = (template: "kinetic" | "lower_third" | "product") => act(`composition:${template}`, async () => {
    const manifest = motionTemplate(project, template);
    await apiRequest("POST", `/api/cut/projects/${project.id}/compositions`, { name: manifest.name, mode: "declarative", manifest, codeCapsule: null });
    await refresh(); setMessage("Motion composition saved. Review it, then apply it to the timeline.");
  });

  const applyComposition = (composition: CompositionRow) => act(`apply:${composition.id}`, async () => {
    if (compositions.current.has(composition.id)) throw new Error("Save this composition before applying it to the timeline.");
    const result = await (await apiRequest("POST", `/api/cut/projects/${project.id}/compositions/${composition.id}/apply`, {}, { "If-Match": String(project.revision) })).json() as { edl: CutEdl; duration: number; revision: number };
    onTimelineApplied(result); setMessage("The motion composition is now on the editable timeline.");
  });

  const updateCompositionDraft = (compositionId: string, update: (manifest: CutCompositionManifest) => CutCompositionManifest) => {
    const row = runtime?.compositions.find((item) => item.id === compositionId);
    if (!row) return;
    compositions.current.edit(row, update(row.manifest), serverRuntime?.compositions.find((item) => item.id === row.id) ?? null); notifyDrafts();
  };

  const saveComposition = (composition: CompositionRow) => act(`save:${composition.id}`, async () => {
    compositions.current.beginSave(composition);
    const saved = await (await apiRequest("PUT", `/api/cut/projects/${project.id}/compositions/${composition.id}`, { name: composition.name, mode: "declarative", manifest: composition.manifest, codeCapsule: null }, { "If-Match": String(composition.revision) })).json() as CompositionRow;
    compositions.current.saved(composition, saved);
    if (alive.current) setRuntime((current) => current ? { ...current, compositions: current.compositions.map((row) => row.id === saved.id ? saved : row) } : current);
    notifyDrafts();
    await refresh(); setMessage("Composition controls saved.");
  });

  const createCompositionVariants = (composition: CompositionRow, variants: Array<{ name: string; parameterValues: Record<string, string | number | boolean | null> }>, render = false) => act(`variants:${composition.id}`, async () => {
    if (compositions.current.has(composition.id)) throw new Error("Save this composition before creating variants.");
    const variantBatchId = `variants.${composition.id}.${crypto.randomUUID()}`;
    const response = await apiRequest("POST", `/api/cut/projects/${project.id}/compositions/${composition.id}/variants`, { idempotencyKey: variantBatchId, variants });
    const result = await response.json() as { count: number; variants: CompositionRow[] };
    if (render) {
      await apiRequest("POST", `/api/cut/projects/${project.id}/composition-render-batches`, {
        idempotencyKey: `${variantBatchId}.render`,
        compositionIds: result.variants.map((variant) => variant.id),
        render: {
          aspect: "source",
          captions: false,
          captionStyle: 1,
          cleanAudio: false,
          audioPreset: "original",
          masterGainDb: 0,
          quality: "social",
          resolution: composition.manifest.height > 1080 ? "2160p" : composition.manifest.height > 720 ? "1080p" : "720p",
          fps: composition.manifest.fps,
        },
      });
      onRenderBatchQueued();
    }
    await refresh(); setMessage(render ? `${result.count} parameterized variants created and queued for independent rendering.` : `${result.count} parameterized composition variants created.`);
  });

  const createCodeComposition = () => act("composition:code", async () => {
    if (sourceDraftDirty(sourceDraftRef.current)) throw new Error("Save or discard your source draft before registering its saved package.");
    if (!codeSourceAssetId || !codeLockfileAssetId) throw new Error("Attach a ZIP source capsule and a pinned package lockfile first");
    const manifest = { ...motionTemplate(project, "kinetic"), name: codeName.trim() };
    const codeCapsule: CutCodeCapsule = { version: 1, entrypoint: codeEntrypoint.trim(), sourceAssetId: codeSourceAssetId, lockfileAssetId: codeLockfileAssetId, runtime: "isolated_node", networkPolicy: "deny", maximumCpuMs: 10_000, maximumMemoryMb: 512, maximumOutputBytes: 268_435_456 };
    await apiRequest("POST", `/api/cut/projects/${project.id}/compositions`, { name: manifest.name, mode: "sandboxed_tsx", manifest, codeCapsule });
    await refresh();
    setMessage("Pinned code composition saved. The isolated executor still needs implementation and qualification; adding a provider URL alone does not enable execution.");
  });

  const loadSource = () => {
    if (sourceDraftDirty(sourceDraftRef.current) && !window.confirm("Discard the unsaved source draft and open the selected saved ZIP?")) return;
    void act("code:open", async () => {
      const result = await (await apiRequest("GET", `/api/cut/projects/${project.id}/code-sources/${encodeURIComponent(codeSourceAssetId)}?entrypoint=${encodeURIComponent(codeEntrypoint)}`)).json() as { files: CutSourceFile[]; entrypoint: string };
      if (!alive.current) return;
      changeSource({ ...result, saved: sourceDraftIdentity(result) });
      setMessage("Private source opened as text. Nothing was executed.");
    });
  };
  const saveSource = (withLockfile = false) => act("code:save", async () => {
    const draft = sourceDraftRef.current;
    if (!draft) return;
    const identity = sourceDraftIdentity(draft);
    const zip = buildCutSourceZip(draft.files, draft.entrypoint);
    const lockfile = withLockfile ? new File([generateCutSourceLockfile(draft.files)], "package-lock.json", { type: "application/json" }) : undefined;
    const result = await onSaveCodeSource(new File([zip], "cut-composition.zip", { type: "application/zip" }), lockfile);
    if (!alive.current) return;
    if (sourceDraftRef.current && sourceDraftIdentity(sourceDraftRef.current) === identity) changeSource({ ...draft, saved: identity });
    setCodeSourceAssetId(result.assetId); setCodeEntrypoint(draft.entrypoint);
    // A previous source's lockfile must never remain selected for a new source.
    setCodeLockfileAssetId(result.lockfileAssetId ?? "");
    setMessage(result.lockfileAssetId ? "New private source and matching lockfile saved and selected. You can register this code composition. Public execution remains unavailable." : "New private source ZIP saved and selected. Attach its matching lockfile before saving a code composition. Public execution remains unavailable.");
  });

  const saveBrief = () => act("brief", async () => {
    briefs.current.beginSave(briefRow);
    const headers = briefRow.revision > 0 ? { "If-Match": String(briefRow.revision) } : undefined;
    const saved = await (await apiRequest("PUT", `/api/cut/projects/${project.id}/production-brief`, brief, headers)).json() as PlanRow;
    briefs.current.saved(briefRow, { ...saved, id: "brief" });
    if (alive.current) setRuntime((current) => current ? { ...current, plan: saved } : current);
    notifyDrafts();
    await refresh(); setMessage("Production brief saved.");
  });

  const createShot = () => act("shot", async () => {
    const spec = starterShot(shotName.trim(), shotPrompt.trim());
    spec.safety.rightsConfirmed = rightsConfirmed;
    await apiRequest("POST", `/api/cut/projects/${project.id}/shots`, spec);
    await refresh(); setMessage("Shot added to the production plan.");
  });

  const queueGeneration = (shot: ShotRow) => act(`generate:${shot.id}`, async () => {
    const provider = runtime?.generationRuntime.providers.find((item) => item.configured)?.id ?? "self_hosted";
    await apiRequest("POST", `/api/cut/projects/${project.id}/shots/${shot.id}/generations`, { operation: shot.spec.operation, provider, model: shot.spec.model, prompt: shot.spec.prompt, negativePrompt: shot.spec.negativePrompt, inputs: [], parameters: { aspect: shot.spec.aspect, durationSeconds: shot.spec.durationSeconds, resolution: shot.spec.resolution, fps: shot.spec.fps, seed: shot.spec.seed }, variants: 1, idempotencyKey: `shot.${shot.id}.${crypto.randomUUID()}` });
    await refresh(); setMessage(runtime?.generationRuntime.providers.some((item) => item.configured) ? "Generation submitted." : "The job is safely staged; connect an approved model runtime to execute it.");
  });

  const importVariant = (shot: ShotRow) => act(`variant-import:${shot.id}`, async () => {
    const assetId = candidateAssetByShot[shot.id] ?? media.find((item) => item.mediaKind === "video")?.assetId;
    if (!assetId) throw new Error("Add private project video before creating a review candidate");
    const selected = media.find((item) => item.assetId === assetId);
    await apiRequest("POST", `/api/cut/projects/${project.id}/shots/${shot.id}/variants/import`, { assetId, label: selected?.name ?? "Imported candidate" });
    await refresh(); setMessage("The project video is ready for shot review with its source lineage retained.");
  });

  const decideVariant = (shot: ShotRow, variant: VariantRow, decision: "select" | "reject") => act(`variant-${decision}:${variant.id}`, async () => {
    await apiRequest("POST", `/api/cut/projects/${project.id}/shots/${shot.id}/variants/${variant.id}/${decision}`, {});
    await refresh(); setMessage(decision === "select" ? "Variant selected. You can now hand it directly to the editable timeline." : "Variant rejected without deleting its provenance.");
  });

  const handoffVariant = (shot: ShotRow, variant: VariantRow) => act(`variant-handoff:${variant.id}`, async () => {
    const result = await (await apiRequest("POST", `/api/cut/projects/${project.id}/shots/${shot.id}/variants/${variant.id}/handoff`, {}, { "If-Match": String(project.revision) })).json() as { edl: CutEdl; duration: number; revision: number; idempotent: boolean };
    onTimelineApplied(result); await refresh(); setMessage(result.idempotent ? "This selected variant is already on the editable timeline." : "Selected variant added to the editable timeline without export or re-upload.");
  });

  const createWorkflow = () => act("workflow", async () => {
    const workflow: CutGenerativeWorkflow = { version: 1, name: "Cinematic campaign pipeline", description: "Create the hero frame, animate it, then finish the audio layer.", nodes: [{ id: "hero_image", operation: "text_to_image", provider: "auto", model: "auto", prompt: brief.objective || "Create the campaign hero image", parameters: {}, inputs: [], position: { x: 0, y: 0 } }, { id: "hero_video", operation: "image_to_video", provider: "auto", model: "auto", prompt: "Add deliberate cinematic camera movement", parameters: {}, inputs: [{ slot: "start_frame", sourceNodeId: "hero_image", sourceOutput: "image", assetIds: [] }], position: { x: 280, y: 0 } }, { id: "sound", operation: "sound_effect_generation", provider: "auto", model: "auto", prompt: "Create a cohesive sound bed", parameters: {}, inputs: [{ slot: "source_video", sourceNodeId: "hero_video", sourceOutput: "video", assetIds: [] }], position: { x: 560, y: 0 } }], outputs: [{ nodeId: "hero_video", output: "video", label: "Hero video" }, { nodeId: "sound", output: "audio", label: "Sound bed" }] };
    await apiRequest("POST", `/api/cut/projects/${project.id}/generative-workflows`, { workflow });
    await refresh(); setMessage("Reusable generation workflow saved.");
  });

  const updateWorkflowDraft = (workflowId: string, workflow: CutGenerativeWorkflow) => {
    const row = runtime?.workflows.find((item) => item.id === workflowId);
    if (!row) return;
    workflows.current.edit(row, workflow, serverRuntime?.workflows.find((item) => item.id === row.id) ?? null); notifyDrafts();
  };

  const saveWorkflow = (row: WorkflowRow) => act(`workflow:${row.id}`, async () => {
    workflows.current.beginSave(row);
    const saved = await (await apiRequest("PUT", `/api/cut/projects/${project.id}/generative-workflows/${row.id}`, { workflow: row.workflow }, { "If-Match": String(row.revision) })).json() as WorkflowRow;
    workflows.current.saved(row, saved);
    if (alive.current) setRuntime((current) => current ? { ...current, workflows: current.workflows.map((item) => item.id === saved.id ? saved : item) } : current);
    notifyDrafts();
    await refresh(); setMessage("Workflow graph saved.");
  });

  return <div className="rounded-2xl border border-[#1d9bf0]/35 bg-zinc-950 p-4" aria-label="CutStudio creative runtime">
    {unsavedCount > 0 && <div aria-label="Unsaved creative edits" className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
      <p>{unsavedCount} unsaved creative {unsavedCount === 1 ? "draft" : "drafts"}. Save each composition, source package, workflow or brief to keep it.</p>
      {conflictCount > 0 && <p className="mt-1">Some saved records changed elsewhere or were removed. Your edits are preserved; their original revision still protects against overwriting someone else's work.</p>}
      <Button size="sm" variant="ghost" disabled={Boolean(busy)} onClick={() => { if (window.confirm("Discard all unsaved creative edits and use the latest loaded saved versions?")) { compositions.current.clear(); workflows.current.clear(); briefs.current.clear(); changeSource(null); notifyDrafts(); } }}>Discard creative edits</Button>
    </div>}
    <button className="flex w-full items-start justify-between gap-3 text-left" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
      <div><p className="text-[10px] font-black uppercase tracking-[.18em] text-[#1d9bf0]">Creative runtime</p><h2 className="mt-1 font-bold">Motion graphics + cinema studio</h2><p className="mt-1 text-xs leading-5 text-zinc-500">Parameterized compositions, shot continuity, camera direction, variants, and reusable model workflows.</p></div>{expanded ? <ChevronUp className="mt-1 h-4 w-4 text-zinc-500"/> : <ChevronDown className="mt-1 h-4 w-4 text-zinc-500"/>}
    </button>
    {expanded && <>
      <div className="sticky top-14 z-20 mt-4 grid grid-cols-3 gap-1 rounded-xl bg-black p-1">{([['motion','Motion',Boxes],['cinema','Cinema',Clapperboard],['workflows','Flows',Workflow]] as const).map(([id,label,Icon]) => <button key={id} className={`flex items-center justify-center gap-1 rounded-lg px-2 py-2 text-[10px] font-bold ${section === id ? "bg-[#1d9bf0] text-black" : "text-zinc-500"}`} onClick={() => setSection(id)}><Icon className="h-3.5 w-3.5"/>{label}</button>)}</div>
      {!runtime ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-[#1d9bf0]"/></div> : section === "motion" ? <div className="mt-4 space-y-3">
        <p className="text-xs leading-5 text-zinc-400">Start from an editable composition. Layers, keyframes, transitions, blend modes, effects, data bindings, 3D/Lottie/Rive descriptors, fonts, and audio-reactive signals remain first-class project data.</p>
        <div className="grid grid-cols-3 gap-2">{([['kinetic','Kinetic'],['lower_third','Lower third'],['product','Product']] as const).map(([id,label]) => <Button key={id} size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => void createComposition(id)}>{busy === `composition:${id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : label}</Button>)}</div>
        <div className="rounded-xl border border-zinc-800 bg-black p-3" aria-label="Code composition package">
          <div><p className="text-[10px] font-bold">Pinned code composition</p><p className="mt-1 text-[9px] leading-4 text-zinc-600">Package TypeScript/TSX as a ZIP with an exact lockfile. CreativesOS stores and validates it now. Public code rendering is not available yet; the isolated runtime still needs production integration and qualification.</p></div>
          <div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => {
            if (sourceDraftDirty(sourceDraftRef.current) && !window.confirm("Discard the unsaved source draft and start a new package?")) return;
            changeSource({ files: starterCutSource(), entrypoint: "src/index.tsx", saved: null });
          }}>New source package</Button><Button size="sm" variant="outline" disabled={Boolean(busy) || !codeSourceAssetId || !codeEntrypoint} onClick={loadSource}>Edit selected source ZIP</Button></div>
          {sourceDraft && <CutStudioSourceEditor draft={sourceDraft} busy={Boolean(busy)} onChange={changeSource} onSave={(withLockfile) => void saveSource(withLockfile)}/>}
          <input aria-label="Code composition name" className={field} value={codeName} onChange={(event) => setCodeName(event.target.value)}/>
          <input aria-label="Code composition entrypoint" className={field} value={codeEntrypoint} onChange={(event) => setCodeEntrypoint(event.target.value)} placeholder="src/index.tsx"/>
          <div className="mt-2 grid grid-cols-2 gap-2"><select aria-label="Code source capsule" className={field} disabled={Boolean(busy)} value={codeSourceAssetId} onChange={(event) => { setCodeSourceAssetId(event.target.value); setCodeLockfileAssetId(""); }}><option value="">ZIP source capsule</option>{media.filter((item) => item.mediaKind === "code_source").map((item) => <option key={item.id} value={item.assetId}>{item.name}</option>)}</select><select aria-label="Code dependency lockfile" className={field} disabled={Boolean(busy)} value={codeLockfileAssetId} onChange={(event) => setCodeLockfileAssetId(event.target.value)}><option value="">Dependency lockfile</option>{media.filter((item) => item.mediaKind === "code_lockfile").map((item) => <option key={item.id} value={item.assetId}>{item.name}</option>)}</select></div>
          <Button className="mt-2 w-full" size="sm" variant="outline" disabled={Boolean(busy) || sourceDraftDirty(sourceDraft) || !codeName.trim() || !codeSourceAssetId || !codeLockfileAssetId} onClick={() => void createCodeComposition()}>{busy === "composition:code" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin"/> : <Boxes className="mr-1 h-3.5 w-3.5"/>}Save isolated composition</Button>
        </div>
        {runtime.compositions.map((composition) => <div key={composition.id} aria-label={`Composition ${composition.name}`} className="rounded-xl border border-zinc-800 bg-black p-3"><div className="flex items-center justify-between gap-2"><div><p className="text-xs font-bold">{composition.name}</p><p className="mt-1 text-[10px] text-zinc-600">{composition.mode === "sandboxed_tsx" ? "isolated TSX" : `${composition.manifest.layers.length} layers`} · {composition.manifest.fps} fps · revision {composition.revision}</p></div>{composition.mode === "declarative" && <Button size="sm" disabled={Boolean(busy) || compositions.current.has(composition.id)} onClick={() => void applyComposition(composition)}>{busy === `apply:${composition.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <><Play className="mr-1 h-3.5 w-3.5"/>Apply</>}</Button>}</div>{composition.mode === "declarative" ? <><CutStudioCompositionPreview manifest={composition.manifest}/><CompositionAuthoringControls composition={composition} assets={media} busy={Boolean(busy)} onChange={(manifest) => updateCompositionDraft(composition.id, () => manifest)} onSave={() => void saveComposition(composition)}/><CompositionVariantBatchControls composition={composition} busy={Boolean(busy) || compositions.current.has(composition.id)} onCreate={(variants, render) => void createCompositionVariants(composition, variants, render)}/></> : <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-[10px] leading-5 text-amber-200"><p className="font-bold">{composition.codeCapsule?.entrypoint}</p><p>Runtime {composition.codeCapsule?.runtime} · network {composition.codeCapsule?.networkPolicy} · {composition.codeCapsule?.maximumMemoryMb} MB · {composition.codeCapsule?.maximumCpuMs} ms CPU</p><p>Package saved; isolated code execution still requires implementation and qualification.</p></div>}</div>)}
        {hasRenderedAnimationLayers && <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[10px] leading-4 text-emerald-300">Lottie and Rive layers are included in final exports through the isolated animation renderer. External network access stays blocked during rendering.</p>}
        <div className="rounded-lg bg-black px-3 py-2 text-[10px] text-zinc-500">Declarative runtime: {runtime.compositionRuntime.declarative} · code packaging: {runtime.compositionRuntime.packageAuthoring} · execution: {runtime.compositionRuntime.isolatedCode} · network: {runtime.compositionRuntime.networkPolicy}</div>
      </div> : section === "cinema" ? <div className="mt-4 space-y-3">
        <label className="block text-[10px] font-bold text-zinc-500">Production title<input className={field} value={brief.title} onChange={(event) => setBrief({ ...brief, title: event.target.value })}/></label>
        <label className="block text-[10px] font-bold text-zinc-500">Objective<textarea aria-label="Objective" className={`${field} min-h-20 resize-none`} value={brief.objective} onChange={(event) => setBrief({ ...brief, objective: event.target.value })} placeholder="What should this production accomplish?"/></label>
        <label className="block text-[10px] font-bold text-zinc-500">Audience<input className={field} value={brief.audience} onChange={(event) => setBrief({ ...brief, audience: event.target.value })}/></label>
        <Button size="sm" variant="outline" className="w-full" disabled={Boolean(busy)} onClick={() => void saveBrief()}>{busy === "brief" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin"/> : <Check className="mr-1 h-3.5 w-3.5"/>}Save brief</Button>
        <div className="border-t border-zinc-800 pt-3"><div className="flex items-center gap-2"><Camera className="h-4 w-4 text-[#1d9bf0]"/><p className="text-xs font-bold">Shot builder</p></div><input aria-label="Shot name" className={field} value={shotName} onChange={(event) => setShotName(event.target.value)}/><textarea aria-label="Shot prompt" className={`${field} min-h-20 resize-none`} value={shotPrompt} onChange={(event) => setShotPrompt(event.target.value)}/><label className="mt-2 flex items-start gap-2 text-[10px] leading-4 text-zinc-400"><input type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)} className="mt-0.5 accent-[#1d9bf0]"/>I control the media/model rights for this shot. Likeness consent is separately enforced when cast elements are used.</label><Button className="mt-3 w-full" size="sm" disabled={!shotName.trim() || !shotPrompt.trim() || Boolean(busy)} onClick={() => void createShot()}>{busy === "shot" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin"/> : <Plus className="mr-1 h-3.5 w-3.5"/>}Add shot</Button></div>
        {runtime.shots.map((shot) => {
          const shotVariants = runtime.variants.filter((variant) => variant.shotId === shot.id);
          const candidateVideos = media.filter((item) => item.mediaKind === "video");
          return <div key={shot.id} className="rounded-xl border border-zinc-800 bg-black p-3">
            <div className="flex items-start justify-between gap-2"><div><p className="text-xs font-bold">{shot.sequence}. {shot.spec.name}</p><p className="mt-1 line-clamp-2 text-[10px] leading-4 text-zinc-500">{shot.spec.prompt}</p><p className="mt-1 text-[10px] text-zinc-600">{shot.spec.camera.focalLengthMm}mm · {shot.spec.camera.movements.map((item) => item.kind).join(" + ") || "static"} · {shot.spec.durationSeconds}s</p></div><Button size="sm" variant="outline" aria-label={`Generate ${shot.spec.name}`} disabled={!shot.spec.safety.rightsConfirmed || Boolean(busy)} onClick={() => void queueGeneration(shot)}>{busy === `generate:${shot.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <Sparkles className="h-3.5 w-3.5"/>}</Button></div>
            {runtime.jobs.filter((job) => job.shotId === shot.id).slice(0, 1).map((job) => <p key={job.id} className={`mt-2 rounded px-2 py-1 text-[10px] ${job.state === "provider_pending" ? "bg-amber-950 text-amber-300" : "bg-zinc-900 text-zinc-400"}`}>{job.state.replace("_", " ")} · {job.detail}</p>)}
            <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950 p-2" aria-label={`Variant review for ${shot.spec.name}`}>
              <p className="text-[10px] font-bold uppercase tracking-[.14em] text-zinc-500">Variant review</p>
              <div className="mt-2 flex gap-2"><select aria-label={`Candidate video for ${shot.spec.name}`} className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-black px-2 py-1.5 text-[10px] text-white" value={candidateAssetByShot[shot.id] ?? candidateVideos[0]?.assetId ?? ""} onChange={(event) => setCandidateAssetByShot((current) => ({ ...current, [shot.id]: event.target.value }))}><option value="" disabled>Choose project video</option>{candidateVideos.map((item) => <option key={item.id} value={item.assetId}>{item.name}</option>)}</select><Button size="sm" variant="outline" aria-label={`Add candidate for ${shot.spec.name}`} disabled={!candidateVideos.length || Boolean(busy)} onClick={() => void importVariant(shot)}>{busy === `variant-import:${shot.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : "Add candidate"}</Button></div>
              {shotVariants.length === 0 ? <p className="py-3 text-center text-[10px] text-zinc-600">Provider results and imported project media appear here for review.</p> : <div className="mt-2 space-y-2">{shotVariants.map((variant) => {
                const projectMedia = media.find((item) => item.assetId === variant.assetId);
                return <div key={variant.id} className="rounded-lg border border-zinc-800 bg-black p-2">
                  {projectMedia && <video aria-label={`Preview ${projectMedia.name}`} className="aspect-video w-full rounded-md bg-zinc-950 object-contain" src={`/api/cut/projects/${encodeURIComponent(project.id)}/media-library/${encodeURIComponent(projectMedia.id)}/media-file`} muted controls preload="metadata"/>}
                  <div className="mt-2 flex items-center gap-2"><span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-bold">{typeof variant.provenance.label === "string" ? variant.provenance.label : projectMedia?.name ?? "Generated candidate"}</span><span className="text-[9px] text-zinc-600">{variant.provider} · {variant.model} · {variant.status}</span></span>{variant.status !== "rejected" && variant.status !== "selected" && <Button size="sm" variant="ghost" aria-label={`Reject ${projectMedia?.name ?? "candidate"}`} disabled={Boolean(busy)} onClick={() => void decideVariant(shot, variant, "reject")}>Reject</Button>}{variant.status !== "rejected" && variant.status !== "selected" && <Button size="sm" variant="outline" aria-label={`Select ${projectMedia?.name ?? "candidate"}`} disabled={Boolean(busy)} onClick={() => void decideVariant(shot, variant, "select")}>Select</Button>}{variant.status === "selected" && <Button size="sm" aria-label={`Add ${projectMedia?.name ?? "selected variant"} to timeline`} disabled={Boolean(busy)} onClick={() => void handoffVariant(shot, variant)}>{busy === `variant-handoff:${variant.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <><Play className="mr-1 h-3.5 w-3.5"/>Timeline</>}</Button>}</div>
                </div>;
              })}</div>}
            </div>
          </div>;
        })}
        {waitingJobs > 0 && <p className="rounded-lg bg-amber-950/60 p-2 text-[10px] leading-4 text-amber-300">{waitingJobs} generation job{waitingJobs === 1 ? " is" : "s are"} staged without pretending an external model executed.</p>}
      </div> : <div className="mt-4 space-y-3"><p className="text-xs leading-5 text-zinc-400">Build reusable capability-driven graphs instead of hard-coding one vendor. Inputs, outputs, model choice, prompts, and lineage remain portable.</p><Button className="w-full" size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => void createWorkflow()}>{busy === "workflow" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin"/> : <Plus className="mr-1 h-3.5 w-3.5"/>}Starter campaign flow</Button>{runtime.workflows.map((row) => <WorkflowAuthoringEditor key={row.id} workflow={row.workflow} revision={row.revision} busy={Boolean(busy)} onChange={(workflow) => updateWorkflowDraft(row.id, workflow)} onSave={() => void saveWorkflow(row)}/>)}</div>}
      {message && <p role="status" className="mt-3 rounded-lg border border-zinc-800 bg-black px-3 py-2 text-[10px] leading-4 text-zinc-300">{message}</p>}
    </>}
  </div>;
}
