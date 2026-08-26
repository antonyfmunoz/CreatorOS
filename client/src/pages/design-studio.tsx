import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Download,
  Eye,
  ImagePlus,
  Layers3,
  Lock,
  Palette,
  Plus,
  Save,
  Shapes,
  Type,
  Unlock,
} from "lucide-react";
import { useLocation, useParams } from "wouter";
import type { DesignDocument, DesignElement } from "@shared/design-studio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";

type Project = {
  id: string;
  name: string;
  kind: string;
  width: number;
  height: number;
  revision: number;
  status: string;
  document: DesignDocument;
};
type Library = {
  projects: Project[];
  templates: Array<{ id: string; name: string }>;
  brandKits: Array<{ id: string; name: string }>;
};
type Detail = {
  project: Project;
  role: string;
  versions: Array<{
    id: string;
    label: string;
    revision: number;
    reviewStatus: string;
  }>;
  exports: Array<{ id: string; assetId: string; format: string }>;
};
type MediaAsset = {
  id: string;
  mimeType: string | null;
  originalFilename: string | null;
  status: string;
  storageProvider: string;
};

const presets = [
  { label: "YouTube thumbnail", kind: "thumbnail", width: 1280, height: 720 },
  { label: "Square social", kind: "social", width: 1080, height: 1080 },
  { label: "Story / Reel", kind: "social", width: 1080, height: 1920 },
  { label: "Podcast cover", kind: "cover", width: 3000, height: 3000 },
  { label: "Product art", kind: "product_art", width: 1600, height: 1200 },
];
const uid = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

function StudioHome() {
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const [preset, setPreset] = useState(0);
  const [busy, setBusy] = useState(false);
  const library = useQuery<Library>({ queryKey: ["/api/design"] });
  async function create() {
    setBusy(true);
    try {
      const selected = presets[preset];
      const response = await apiRequest("POST", "/api/design", {
        name,
        kind: selected.kind,
        width: selected.width,
        height: selected.height,
        brandKitId: null,
      });
      const project = (await response.json()) as Project;
      await queryClient.invalidateQueries({ queryKey: ["/api/design"] });
      setLocation(`/business/design/${project.id}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="min-h-dvh bg-black pb-24 text-white">
      <header className="border-b border-zinc-800">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/business")}
            aria-label="Back to business"
          >
            <ArrowLeft />
          </Button>
          <Palette className="text-[#1d9bf0]" />
          <div>
            <h1 className="font-black">DesignStudio</h1>
            <p className="text-[10px] text-zinc-500">
              Brand-consistent graphics connected to Media Cloud and
              Distribution
            </p>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-6 p-4 lg:grid-cols-[360px_1fr]">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          <h2 className="font-bold">Start a design</h2>
          <Input
            className="mt-3 border-zinc-800 bg-black"
            placeholder="Campaign launch thumbnail"
            aria-label="Design name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            {presets.map((item, index) => (
              <button
                key={item.label}
                onClick={() => setPreset(index)}
                className={`rounded-xl border p-3 text-left ${preset === index ? "border-[#1d9bf0] bg-[#1d9bf0]/10" : "border-zinc-800 bg-black"}`}
              >
                <strong className="block text-xs">{item.label}</strong>
                <span className="text-[10px] text-zinc-600">
                  {item.width} × {item.height}
                </span>
              </button>
            ))}
          </div>
          <Button
            className="mt-3 w-full bg-[#1d9bf0] text-black"
            disabled={!name || busy}
            onClick={() => void create()}
          >
            <Plus className="mr-1 h-4 w-4" />
            Create design
          </Button>
        </section>
        <section>
          <h2 className="mb-3 text-sm font-bold">Recent projects</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {library.data?.projects.map((project) => (
              <button
                key={project.id}
                onClick={() => setLocation(`/business/design/${project.id}`)}
                className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 text-left hover:border-zinc-600"
              >
                <div className="grid aspect-video place-items-center bg-zinc-900">
                  <Palette className="h-8 w-8 text-zinc-700" />
                </div>
                <div className="p-4">
                  <strong className="block text-sm">{project.name}</strong>
                  <span className="text-[10px] uppercase text-zinc-600">
                    {project.kind} · {project.width}×{project.height} ·{" "}
                    {project.status}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function StudioEditor({ id }: { id: string }) {
  const [, setLocation] = useLocation();
  const detail = useQuery<Detail>({ queryKey: [`/api/design/${id}`] });
  const media = useQuery<MediaAsset[]>({ queryKey: ["/api/media/assets"] });
  const [draft, setDraft] = useState<DesignDocument | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});
  const project = detail.data?.project;
  const document = draft ?? project?.document;
  const page = document?.pages[0];
  const selected = page?.elements.find((element) => element.id === selectedId);
  const scale = page ? Math.min(760 / page.width, 560 / page.height, 1) : 1;
  const managedImages = useMemo(
    () =>
      (media.data ?? []).filter(
        (asset) =>
          asset.status === "ready" &&
          asset.storageProvider !== "remote-import" &&
          asset.mimeType?.startsWith("image/"),
      ),
    [media.data],
  );
  const imageAssetIds = useMemo(
    () =>
      Array.from(
        new Set(
          document?.pages.flatMap((candidate) =>
            candidate.elements
              .filter(
                (
                  element,
                ): element is Extract<DesignElement, { type: "image" }> =>
                  element.type === "image",
              )
              .map((element) => element.assetId),
          ) ?? [],
        ),
      ),
    [document],
  );
  useEffect(() => {
    const missing = imageAssetIds.filter((assetId) => !assetUrls[assetId]);
    if (!missing.length) return;
    let active = true;
    void Promise.all(
      missing.map(async (assetId) => {
        const response = await apiRequest(
          "GET",
          `/api/assets/${assetId}/access`,
        );
        const access = (await response.json()) as { url: string };
        return [assetId, access.url] as const;
      }),
    )
      .then((entries) => {
        if (!active) return;
        setAssetUrls((current) => ({
          ...current,
          ...Object.fromEntries(entries),
        }));
      })
      .catch((error) => {
        if (active)
          setMessage(
            error instanceof Error
              ? `Unable to load a Media Cloud image: ${error.message}`
              : "Unable to load a Media Cloud image.",
          );
      });
    return () => {
      active = false;
    };
  }, [imageAssetIds, assetUrls]);
  function mutateElement(update: Partial<DesignElement>) {
    if (!document || !page || !selected) return;
    setDraft({
      ...document,
      pages: document.pages.map((candidate) =>
        candidate.id === page.id
          ? {
              ...candidate,
              elements: candidate.elements.map((element) =>
                element.id === selected.id
                  ? ({ ...element, ...update } as DesignElement)
                  : element,
              ),
            }
          : candidate,
      ),
    });
  }
  function add(element: DesignElement) {
    if (!document || !page) return;
    setDraft({
      ...document,
      pages: document.pages.map((candidate) =>
        candidate.id === page.id
          ? { ...candidate, elements: [...candidate.elements, element] }
          : candidate,
      ),
    });
    setSelectedId(element.id);
  }
  async function insertImage(assetId: string) {
    if (!page) return;
    setBusy("image");
    setMessage("");
    try {
      const response = await apiRequest("GET", `/api/assets/${assetId}/access`);
      const access = (await response.json()) as { url: string };
      setAssetUrls((current) => ({ ...current, [assetId]: access.url }));
      const asset = managedImages.find((candidate) => candidate.id === assetId);
      const width = Math.min(page.width * 0.6, 720);
      const height = Math.min(page.height * 0.6, 720);
      add({
        id: uid("image"),
        type: "image",
        assetId,
        sourceUrl: null,
        fit: "cover",
        alt: asset?.originalFilename ?? "Media Cloud image",
        x: (page.width - width) / 2,
        y: (page.height - height) / 2,
        width,
        height,
        rotation: 0,
        opacity: 1,
        locked: false,
        zIndex: page.elements.length + 1,
      });
      setMessage("Media Cloud image added to the design.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to add image",
      );
    } finally {
      setBusy("");
    }
  }
  async function act(key: string, run: () => Promise<unknown>, done: string) {
    setBusy(key);
    setMessage("");
    try {
      await run();
      setMessage(done);
      await detail.refetch();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy("");
    }
  }
  async function save() {
    if (!project || !document) return;
    await act(
      "save",
      async () => {
        const response = await apiRequest(
          "PATCH",
          `/api/design/${project.id}`,
          { revision: project.revision, document },
        );
        const updated = (await response.json()) as Project;
        setDraft(updated.document);
      },
      "Saved with conflict protection.",
    );
  }
  async function exportDesign() {
    if (!project || !page) return;
    await act(
      "export",
      () =>
        apiRequest("POST", `/api/design/${project.id}/export`, {
          format: "png",
          pageId: page.id,
          visibility: "private",
          quality: 92,
          scale: 1,
        }),
      "PNG exported to Media Cloud.",
    );
  }
  async function review() {
    if (!project) return;
    await act(
      "review",
      async () => {
        const versionResponse = await apiRequest(
          "POST",
          `/api/design/${project.id}/versions`,
          { label: `Review r${project.revision}` },
        );
        const version = (await versionResponse.json()) as { id: string };
        const linkResponse = await apiRequest(
          "POST",
          `/api/design/versions/${version.id}/review`,
          { label: "Creative review", days: 7 },
        );
        const link = (await linkResponse.json()) as { reviewUrl: string };
        await navigator.clipboard?.writeText(link.reviewUrl);
        setMessage(`Review link copied: ${link.reviewUrl}`);
      },
      "Review link copied.",
    );
  }
  if (!project || !page)
    return (
      <main className="grid min-h-dvh place-items-center bg-black text-zinc-500">
        Loading design…
      </main>
    );
  return (
    <main className="min-h-dvh bg-black text-white">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-zinc-800 bg-black px-3">
        <Button
          size="icon"
          variant="ghost"
          aria-label="Back to designs"
          onClick={() => setLocation("/business/design")}
        >
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-black">{project.name}</h1>
          <p className="text-[9px] text-zinc-600">
            r{project.revision} · {project.width}×{project.height} ·{" "}
            {project.status}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void review()}
          disabled={Boolean(busy)}
        >
          <Eye className="mr-1 h-3 w-3" />
          Review
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void exportDesign()}
          disabled={Boolean(busy)}
        >
          <Download className="mr-1 h-3 w-3" />
          Export
        </Button>
        <Button
          size="sm"
          className="bg-[#1d9bf0] text-black"
          onClick={() => void save()}
          disabled={!draft || Boolean(busy)}
        >
          <Save className="mr-1 h-3 w-3" />
          Save
        </Button>
      </header>
      {message && (
        <p className="border-b border-[#1d9bf0]/30 bg-[#1d9bf0]/10 px-4 py-2 text-xs">
          {message}
        </p>
      )}
      <div className="grid min-h-[calc(100dvh-3.5rem)] lg:grid-cols-[220px_1fr_260px]">
        <aside className="border-r border-zinc-800 bg-zinc-950 p-3">
          <h2 className="mb-3 text-[10px] font-black uppercase text-zinc-600">
            Insert
          </h2>
          <div className="grid gap-2">
            <Button
              variant="outline"
              className="justify-start"
              onClick={() =>
                add({
                  id: uid("text"),
                  type: "text",
                  x: 100,
                  y: 100,
                  width: 600,
                  height: 140,
                  rotation: 0,
                  opacity: 1,
                  locked: false,
                  zIndex: page.elements.length + 1,
                  text: "Your message",
                  fill: "#ffffff",
                  fontSize: 64,
                  fontFamily: "Arial",
                  fontWeight: "bold",
                  align: "left",
                })
              }
            >
              <Type className="mr-2 h-4 w-4" />
              Text
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              onClick={() =>
                add({
                  id: uid("shape"),
                  type: "shape",
                  shape: "rectangle",
                  x: 100,
                  y: 300,
                  width: 400,
                  height: 180,
                  rotation: 0,
                  opacity: 1,
                  locked: false,
                  zIndex: page.elements.length + 1,
                  fill: "#1d9bf0",
                  stroke: null,
                  strokeWidth: 0,
                  radius: 24,
                })
              }
            >
              <Shapes className="mr-2 h-4 w-4" />
              Shape
            </Button>
            {managedImages.length ? (
              <label className="relative flex items-center rounded-md border border-zinc-800 bg-black text-sm hover:bg-zinc-900">
                <ImagePlus className="pointer-events-none ml-3 h-4 w-4" />
                <select
                  aria-label="Media Cloud image"
                  value=""
                  disabled={busy === "image"}
                  onChange={(event) => {
                    if (event.target.value)
                      void insertImage(event.target.value);
                  }}
                  className="h-9 w-full appearance-none bg-transparent px-2 pr-7 text-sm outline-none disabled:opacity-50"
                >
                  <option value="">
                    {busy === "image" ? "Adding image…" : "Media Cloud image"}
                  </option>
                  {managedImages.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.originalFilename ||
                        `Image ${asset.id.slice(0, 8)}`}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <Button
                variant="outline"
                className="justify-start"
                onClick={() => setLocation("/library")}
              >
                <ImagePlus className="mr-2 h-4 w-4" />
                Add images in Media Cloud
              </Button>
            )}
          </div>
          <h2 className="mb-2 mt-6 text-[10px] font-black uppercase text-zinc-600">
            Layers
          </h2>
          <div className="space-y-1">
            {[...page.elements]
              .sort((a, b) => b.zIndex - a.zIndex)
              .map((element) => (
                <button
                  key={element.id}
                  onClick={() => setSelectedId(element.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs ${selectedId === element.id ? "bg-[#1d9bf0]/15 text-[#1d9bf0]" : "hover:bg-zinc-900"}`}
                >
                  <Layers3 className="h-3 w-3" />
                  <span className="truncate">
                    {element.type === "text" ? element.text : element.type}
                  </span>
                  {element.locked && <Lock className="ml-auto h-3 w-3" />}
                </button>
              ))}
          </div>
        </aside>
        <section className="grid min-h-[650px] place-items-center overflow-auto bg-zinc-900 p-8">
          <svg
            aria-label="Design canvas"
            width={page.width * scale}
            height={page.height * scale}
            viewBox={`0 0 ${page.width} ${page.height}`}
            className="max-h-[72vh] max-w-full shadow-2xl"
            style={{ background: page.background }}
            onPointerDown={() => setSelectedId("")}
          >
            {[...page.elements]
              .sort((a, b) => a.zIndex - b.zIndex)
              .map((element) => (
                <g
                  key={element.id}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    setSelectedId(element.id);
                  }}
                  opacity={element.opacity}
                  transform={`rotate(${element.rotation} ${element.x + element.width / 2} ${element.y + element.height / 2})`}
                >
                  {element.type === "shape" ? (
                    element.shape === "ellipse" ? (
                      <ellipse
                        cx={element.x + element.width / 2}
                        cy={element.y + element.height / 2}
                        rx={element.width / 2}
                        ry={element.height / 2}
                        fill={element.fill}
                      />
                    ) : (
                      <rect
                        x={element.x}
                        y={element.y}
                        width={element.width}
                        height={element.height}
                        rx={element.radius}
                        fill={element.fill}
                      />
                    )
                  ) : element.type === "text" ? (
                    <text
                      x={
                        element.align === "center"
                          ? element.x + element.width / 2
                          : element.align === "right"
                            ? element.x + element.width
                            : element.x
                      }
                      y={element.y + element.fontSize}
                      fill={element.fill}
                      fontFamily={element.fontFamily}
                      fontWeight={element.fontWeight}
                      fontSize={element.fontSize}
                      textAnchor={
                        element.align === "center"
                          ? "middle"
                          : element.align === "right"
                            ? "end"
                            : "start"
                      }
                    >
                      {element.text}
                    </text>
                  ) : element.type === "image" &&
                    (assetUrls[element.assetId] || element.sourceUrl) ? (
                    <image
                      href={
                        assetUrls[element.assetId] || element.sourceUrl || ""
                      }
                      x={element.x}
                      y={element.y}
                      width={element.width}
                      height={element.height}
                      preserveAspectRatio={
                        element.fit === "contain"
                          ? "xMidYMid meet"
                          : element.fit === "cover"
                            ? "xMidYMid slice"
                            : "none"
                      }
                    >
                      <title>{element.alt || "Design image"}</title>
                    </image>
                  ) : (
                    <rect
                      x={element.x}
                      y={element.y}
                      width={element.width}
                      height={element.height}
                      fill="#27272a"
                    />
                  )}
                  {selectedId === element.id && (
                    <rect
                      x={element.x - 4}
                      y={element.y - 4}
                      width={element.width + 8}
                      height={element.height + 8}
                      fill="none"
                      stroke="#1d9bf0"
                      strokeWidth={4 / scale}
                      strokeDasharray="12 8"
                    />
                  )}
                </g>
              ))}
          </svg>
        </section>
        <aside className="border-l border-zinc-800 bg-zinc-950 p-4">
          <h2 className="text-xs font-black">Properties</h2>
          {selected ? (
            <div className="mt-4 space-y-3">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => mutateElement({ locked: !selected.locked })}
              >
                {selected.locked ? (
                  <Unlock className="mr-2 h-4 w-4" />
                ) : (
                  <Lock className="mr-2 h-4 w-4" />
                )}
                {selected.locked ? "Unlock" : "Lock component"}
              </Button>
              {selected.type === "text" && (
                <>
                  <label className="block text-[10px] text-zinc-500">
                    Text
                    <textarea
                      className="mt-1 min-h-24 w-full rounded-lg border border-zinc-800 bg-black p-2 text-sm"
                      value={selected.text}
                      onChange={(event) =>
                        mutateElement({ text: event.target.value })
                      }
                    />
                  </label>
                  <label className="block text-[10px] text-zinc-500">
                    Size
                    <Input
                      type="number"
                      value={selected.fontSize}
                      onChange={(event) =>
                        mutateElement({ fontSize: Number(event.target.value) })
                      }
                      className="mt-1 bg-black"
                    />
                  </label>
                </>
              )}
              {(selected.type === "text" || selected.type === "shape") && (
                <label className="block text-[10px] text-zinc-500">
                  Color
                  <Input
                    type="color"
                    value={selected.fill}
                    onChange={(event) =>
                      mutateElement({ fill: event.target.value })
                    }
                    className="mt-1 bg-black"
                  />
                </label>
              )}
              {selected.type === "image" && (
                <>
                  <label className="block text-[10px] text-zinc-500">
                    Image fit
                    <select
                      value={selected.fit}
                      onChange={(event) =>
                        mutateElement({
                          fit: event.target.value as
                            | "cover"
                            | "contain"
                            | "fill",
                        })
                      }
                      className="mt-1 h-9 w-full rounded-md border border-zinc-800 bg-black px-3 text-sm text-white"
                    >
                      <option value="cover">Cover</option>
                      <option value="contain">Contain</option>
                      <option value="fill">Fill</option>
                    </select>
                  </label>
                  <label className="block text-[10px] text-zinc-500">
                    Alternative text
                    <Input
                      value={selected.alt}
                      maxLength={500}
                      onChange={(event) =>
                        mutateElement({ alt: event.target.value })
                      }
                      className="mt-1 bg-black"
                    />
                  </label>
                </>
              )}
              <div className="grid grid-cols-2 gap-2">
                {(["x", "y", "width", "height"] as const).map((key) => (
                  <label
                    key={key}
                    className="text-[10px] uppercase text-zinc-500"
                  >
                    {key}
                    <Input
                      type="number"
                      value={selected[key]}
                      disabled={selected.locked}
                      onChange={(event) =>
                        mutateElement({ [key]: Number(event.target.value) })
                      }
                      className="mt-1 bg-black"
                    />
                  </label>
                ))}
              </div>
              <Button
                variant="destructive"
                className="w-full"
                disabled={selected.locked}
                onClick={() => {
                  setDraft({
                    ...document,
                    pages: document.pages.map((candidate) =>
                      candidate.id === page.id
                        ? {
                            ...candidate,
                            elements: candidate.elements.filter(
                              (element) => element.id !== selected.id,
                            ),
                          }
                        : candidate,
                    ),
                  });
                  setSelectedId("");
                }}
              >
                Delete layer
              </Button>
            </div>
          ) : (
            <p className="mt-4 text-xs leading-5 text-zinc-600">
              Select a layer to edit its content, geometry, color, order, and
              lock state.
            </p>
          )}
          <div className="mt-8 border-t border-zinc-800 pt-4">
            <p className="text-[10px] text-zinc-600">Connected workflow</p>
            <p className="mt-2 text-xs leading-5 text-zinc-400">
              Exports become governed Media Cloud assets with lineage, then hand
              directly to Distribution, campaigns, products, sites, Broadcast,
              or CutStudio.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}

export default function DesignStudioPage() {
  const params = useParams<{ id?: string }>();
  return params.id ? <StudioEditor id={params.id} /> : <StudioHome />;
}
