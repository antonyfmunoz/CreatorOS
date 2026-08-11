import { useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Image,
  Link2,
  Send,
  Upload,
  Video,
} from "lucide-react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  DistributionConnectionsResponse,
  DistributionJob,
  DistributionPlatform,
} from "@/lib/distribution";

const platforms: DistributionPlatform[] = [
  "CreativesOS",
  "Instagram",
  "TikTok",
  "YouTube",
  "X",
  "LinkedIn",
];
type StudioTab = "compose" | "queue" | "calendar";
type LibraryAsset = {
  id: string;
  kind: string;
  mimeType: string | null;
  publicUrl: string | null;
  originalFilename: string | null;
  status: string;
  visibility: string;
};

type AssetUploadIntent = {
  asset: { id: string };
  upload: { uploadUrl: string };
};

type CampaignContext = {
  id: string;
  name: string;
  deliverables: Array<{ id: string; title: string }>;
};

function libraryAssetKind(file: File): string | null {
  if (file.type.startsWith("image/")) return "photo";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type === "application/pdf" || file.type.startsWith("text/"))
    return "document";
  return null;
}

function queueStatus(job: DistributionJob) {
  if (job.status === "needs_connection") return "Connect channels";
  if (job.status === "needs_provider") return "Provider activation";
  return job.status;
}

function deliveryStatus(
  status: NonNullable<DistributionJob["deliveries"]>[number]["status"],
) {
  if (status === "published") return "Published";
  if (status === "failed") return "Needs attention";
  if (status === "waiting_for_connection") return "Connect account";
  return "Provider activation";
}

export default function DistributionStudio() {
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<StudioTab>("compose");
  const [content, setContent] = useState("");
  const [format, setFormat] = useState<DistributionJob["format"]>("Text");
  const [selectedPlatforms, setSelectedPlatforms] = useState<
    DistributionPlatform[]
  >(["CreativesOS"]);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [schedule, setSchedule] = useState(false);
  const [scheduledFor, setScheduledFor] = useState("");
  const [isUploadingAsset, setIsUploadingAsset] = useState(false);
  const assetInputRef = useRef<HTMLInputElement>(null);
  // Wouter's location value is pathname-oriented in production, so campaign
  // linkage must be read from the browser query string itself.
  const studioParams = new URLSearchParams(window.location.search);
  const campaignId = studioParams.get("campaign");
  const campaignDeliverableId = studioParams.get("deliverable");
  const { data: jobs = [] } = useQuery<DistributionJob[]>({
    queryKey: ["/api/distribution-jobs"],
    enabled: Boolean(user),
  });
  const { data: assets = [] } = useQuery<LibraryAsset[]>({
    queryKey: ["/api/assets", "public"],
    enabled: Boolean(user),
    queryFn: async () =>
      (await apiRequest("GET", "/api/assets?visibility=public")).json(),
  });
  const { data: connectionData } = useQuery<DistributionConnectionsResponse>({
    queryKey: ["/api/distribution/connections"],
    enabled: Boolean(user),
  });
  const { data: campaignContext } = useQuery<CampaignContext>({
    queryKey: ["/api/campaigns", campaignId],
    enabled: Boolean(user && campaignId),
    queryFn: async () =>
      (await apiRequest("GET", `/api/campaigns/${campaignId}`)).json(),
  });
  const linkedDeliverable = campaignContext?.deliverables.find(
    (deliverable) => deliverable.id === campaignDeliverableId,
  );
  const readyAssets = assets.filter(
    (asset) => asset.status === "ready" && asset.visibility === "public",
  );
  const createDistributionJob = useMutation({
    mutationFn: async (job: DistributionJob) =>
      (await apiRequest("POST", "/api/distribution-jobs", job)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/distribution-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
    },
  });
  const changeQueueJob = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "retry" | "cancel" }) =>
      (await apiRequest("POST", `/api/distribution-jobs/${id}/${action}`)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/distribution-jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
    },
    onError: (error: Error) =>
      toast({ title: "Queue update failed", description: error.message, variant: "destructive" }),
  });

  const uploadLibraryAsset = async (file: File | undefined) => {
    if (!file) return;
    const kind = libraryAssetKind(file);
    if (!kind) {
      toast({
        title: "Unsupported media",
        description:
          "Upload an image, video, audio file, PDF, or text document.",
        variant: "destructive",
      });
      return;
    }
    if (!user) {
      toast({
        title: "Sign in to upload",
        description: "Your content library belongs to your creator account.",
        variant: "destructive",
      });
      return;
    }
    setIsUploadingAsset(true);
    try {
      let intent: AssetUploadIntent | undefined;
      let uploadedAsset: LibraryAsset | undefined;
      try {
        intent = (await (
          await apiRequest("POST", "/api/assets/upload-intents", {
            kind,
            filename: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
            visibility: "public",
          })
        ).json()) as AssetUploadIntent;
        const stored = await fetch(intent.upload.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!stored.ok)
          throw new Error("Media storage did not accept this file");
        const completed = (await (
          await apiRequest(
            "POST",
            `/api/assets/${intent.asset.id}/complete`,
            {},
          )
        ).json()) as { asset: LibraryAsset };
        uploadedAsset = completed.asset;
      } catch (directUploadError) {
        if (intent) {
          await apiRequest("DELETE", `/api/assets/${intent.asset.id}`).catch(
            () => undefined,
          );
        }
        if (!["photo", "video", "audio"].includes(kind))
          throw directUploadError;
        const form = new FormData();
        form.append("kind", kind);
        form.append(kind === "photo" ? "image" : kind, file);
        const proxied = await fetch("/api/assets/upload-proxy", {
          method: "POST",
          credentials: "include",
          body: form,
        });
        if (!proxied.ok) {
          const body = (await proxied.json().catch(() => null)) as {
            message?: string;
          } | null;
          throw new Error(
            body?.message ?? "Media storage did not accept this file",
          );
        }
        uploadedAsset = ((await proxied.json()) as { asset: LibraryAsset })
          .asset;
      }
      if (!uploadedAsset) throw new Error("Media upload returned no asset");
      setSelectedAssetIds((ids) =>
        ids.length >= 4 ? ids : [...ids, uploadedAsset.id],
      );
      queryClient.invalidateQueries({ queryKey: ["/api/assets", "public"] });
      toast({
        title: "Added to your content library",
        description:
          "This public asset is ready to distribute without creating a feed post.",
      });
    } catch (error) {
      toast({
        title: "Could not upload media",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploadingAsset(false);
      if (assetInputRef.current) assetInputRef.current.value = "";
    }
  };

  const createJob = async () => {
    if (!content.trim()) {
      toast({
        title: "Add your message",
        description: "Write the content you want to share first.",
        variant: "destructive",
      });
      return;
    }
    if (!user) {
      toast({
        title: "Sign in to publish",
        description:
          "Your distribution workspace needs an active creator account.",
        variant: "destructive",
      });
      return;
    }
    if (schedule && !scheduledFor) {
      toast({
        title: "Choose a date and time",
        description: "Scheduling needs a publish time.",
        variant: "destructive",
      });
      return;
    }
    if (
      selectedPlatforms.includes("YouTube") &&
      !readyAssets.some(
        (asset) =>
          selectedAssetIds.includes(asset.id) &&
          asset.kind === "video" &&
          asset.mimeType?.startsWith("video/"),
      )
    ) {
      toast({
        title: "Choose a video for YouTube",
        description:
          "YouTube distribution requires one ready public video from your content library.",
        variant: "destructive",
      });
      return;
    }
    const when = schedule ? scheduledFor : new Date().toISOString();
    try {
      const externalTargets = selectedPlatforms.filter(
        (platform) => platform !== "CreativesOS",
      );
      const job: DistributionJob & { campaignDeliverableId?: string } = {
        id: crypto.randomUUID(),
        content,
        format,
        platforms: selectedPlatforms,
        assetIds: selectedAssetIds,
        scheduledFor: when,
        status: "scheduled",
        createdAt: new Date().toISOString(),
        ...(campaignDeliverableId ? { campaignDeliverableId } : {}),
      };
      await createDistributionJob.mutateAsync(job);
      setContent("");
      setSelectedAssetIds([]);
      setScheduledFor("");
      setSchedule(false);
      toast({
        title: schedule
          ? "Added to your publishing queue"
          : "Published to CreativesOS",
        description: externalTargets.length
          ? externalTargets.length === 1 && externalTargets[0] === "YouTube"
            ? "Your selected video will upload to YouTube as unlisted."
            : `${externalTargets.join(", ")} will publish when their connected providers are ready.`
          : "Your audience can see it in the feed now.",
      });
      setTab("queue");
    } catch (error) {
      toast({
        title: "Could not publish",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const byDate = useMemo(
    () =>
      jobs.reduce<Record<string, DistributionJob[]>>((groups, job) => {
        const date = new Date(job.scheduledFor).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        });
        (groups[date] ||= []).push(job);
        return groups;
      }, {}),
    [jobs],
  );

  return (
    <main className="min-h-[calc(100dvh-3.5rem)] bg-black pb-24 text-white">
      <header className="flex h-14 items-center gap-2 border-b border-zinc-800 px-4">
        <Button
          variant="ghost"
          size="icon"
          className="-ml-2 text-white hover:bg-zinc-900 hover:text-white"
          onClick={() => setLocation("/create")}
          aria-label="Back to create"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-lg font-bold">Distribution studio</h1>
          <p className="text-[11px] text-zinc-500">
            Create once. Publish everywhere.
          </p>
        </div>
      </header>
      <nav className="grid grid-cols-3 border-b border-zinc-800">
        {(["compose", "queue", "calendar"] as StudioTab[]).map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            className={`relative py-3 text-xs font-bold capitalize ${tab === item ? "text-white" : "text-zinc-500"}`}
          >
            {item}
            {tab === item && (
              <span className="absolute inset-x-5 bottom-0 h-0.5 bg-white" />
            )}
          </button>
        ))}
      </nav>

      {tab === "compose" && (
        <section className="p-4">
          {campaignContext && linkedDeliverable && (
            <section className="mb-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">
                Campaign deliverable
              </p>
              <p className="mt-1 text-sm font-bold">{linkedDeliverable.title}</p>
              <p className="mt-1 text-xs text-zinc-500">
                {campaignContext.name} · Publishing this composition will attach its delivery job here.
              </p>
            </section>
          )}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold">Universal composer</p>
              <span className="text-xs text-zinc-500">
                {content.length}/2,200
              </span>
            </div>
            <Textarea
              value={content}
              onChange={(event) =>
                setContent(event.target.value.slice(0, 2200))
              }
              placeholder="What do you want to share?"
              className="mt-4 min-h-36 resize-none border-0 bg-transparent p-0 text-base text-white shadow-none placeholder:text-zinc-600 focus-visible:ring-0"
            />
            <div className="mt-4 flex gap-2 border-t border-zinc-800 pt-3">
              {(["Text", "Image", "Video", "Story"] as const).map((item) => (
                <button
                  key={item}
                  onClick={() => setFormat(item)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold ${format === item ? "bg-white text-black" : "bg-zinc-900 text-zinc-400"}`}
                >
                  {item === "Image" && (
                    <Image className="mr-1 inline h-3.5 w-3.5" />
                  )}
                  {item === "Video" && (
                    <Video className="mr-1 inline h-3.5 w-3.5" />
                  )}
                  {item}
                </button>
              ))}
            </div>
          </div>

          <section className="mt-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold">Content library</h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Choose up to four ready public assets.
                </p>
              </div>
              <span className="text-xs font-bold text-zinc-400">
                {selectedAssetIds.length}/4
              </span>
            </div>
            <input
              ref={assetInputRef}
              id="library-asset-upload"
              type="file"
              className="sr-only"
              accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/wav,audio/ogg,audio/webm,application/pdf,text/plain,text/markdown,text/csv"
              onChange={(event) =>
                void uploadLibraryAsset(event.target.files?.[0])
              }
            />
            {readyAssets.length === 0 ? (
              <button
                className="mt-3 w-full rounded-xl border border-dashed border-zinc-700 px-4 py-4 text-left text-xs leading-5 text-zinc-400 hover:bg-zinc-950"
                onClick={() => assetInputRef.current?.click()}
                disabled={isUploadingAsset}
              >
                <Upload className="mr-2 inline h-4 w-4" />
                {isUploadingAsset
                  ? "Uploading media…"
                  : "Upload media to your public content library."}
              </button>
            ) : (
              <>
                <button
                  className="mt-3 rounded-lg border border-zinc-700 px-3 py-2 text-xs font-bold text-white hover:bg-zinc-900 disabled:opacity-50"
                  onClick={() => assetInputRef.current?.click()}
                  disabled={isUploadingAsset}
                >
                  <Upload className="mr-1.5 inline h-3.5 w-3.5" />
                  {isUploadingAsset ? "Uploading…" : "Add media"}
                </button>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {readyAssets.map((asset) => {
                    const selected = selectedAssetIds.includes(asset.id);
                    return (
                      <button
                        key={asset.id}
                        onClick={() =>
                          setSelectedAssetIds((ids) =>
                            selected
                              ? ids.filter((id) => id !== asset.id)
                              : ids.length >= 4
                                ? ids
                                : [...ids, asset.id],
                          )
                        }
                        className={`relative aspect-square overflow-hidden rounded-xl border text-left ${selected ? "border-white ring-1 ring-white" : "border-zinc-800"}`}
                      >
                        <>
                          {asset.publicUrl && asset.kind === "image" ? (
                            <img
                              src={asset.publicUrl}
                              alt={asset.originalFilename ?? "Creator asset"}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="flex h-full items-center justify-center bg-zinc-900 text-[10px] font-bold uppercase text-zinc-400">
                              {asset.kind}
                            </span>
                          )}
                        </>
                        {selected && (
                          <span className="absolute right-1 top-1 rounded-full bg-white p-1 text-black">
                            <CheckCircle2 className="h-3 w-3" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </section>

          <section className="mt-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold">Publish to</h2>
              <button
                onClick={() => setLocation("/distribution/connections")}
                className="text-xs font-bold text-white"
              >
                <Link2 className="mr-1 inline h-3.5 w-3.5" /> Manage connections
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {platforms.map((platform) => {
                const selected = selectedPlatforms.includes(platform);
                const external = platform !== "CreativesOS";
                const provider = connectionData?.providers.find(
                  (candidate) => candidate.label === platform,
                );
                const connected = provider?.connections.some(
                  (connection) => connection.status === "active",
                );
                return (
                  <button
                    key={platform}
                    onClick={() =>
                      setSelectedPlatforms((current) =>
                        selected
                          ? current.filter((item) => item !== platform)
                          : [...current, platform],
                      )
                    }
                    className={`flex items-center justify-between rounded-xl border p-3 text-left ${selected ? "border-white bg-white text-black" : "border-zinc-800 bg-zinc-950 text-zinc-400"}`}
                  >
                    <span className="text-sm font-bold">{platform}</span>
                    {external && (
                      <span
                        className={`text-[10px] font-semibold ${selected ? "text-black/60" : "text-zinc-600"}`}
                      >
                        {connected ? "Connected" : "Connect"}
                      </span>
                    )}
                    {selected && <CheckCircle2 className="h-4 w-4" />}
                  </button>
                );
              })}
            </div>
          </section>
          <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <label className="flex cursor-pointer items-center justify-between">
              <span>
                <span className="block text-sm font-bold">
                  Schedule for later
                </span>
                <span className="mt-1 block text-xs text-zinc-500">
                  Save this content to your publishing queue.
                </span>
              </span>
              <input
                checked={schedule}
                onChange={(event) => setSchedule(event.target.checked)}
                type="checkbox"
                className="h-4 w-4 accent-white"
              />
            </label>
            {schedule && (
              <input
                type="datetime-local"
                value={scheduledFor}
                onChange={(event) => setScheduledFor(event.target.value)}
                className="mt-4 w-full rounded-xl border border-zinc-700 bg-black px-3 py-2 text-sm text-white [color-scheme:dark]"
              />
            )}
          </section>
          <Button
            className="mt-6 h-12 w-full rounded-xl bg-white font-bold text-black hover:bg-zinc-200"
            disabled={
              createDistributionJob.isPending || selectedPlatforms.length === 0
            }
            onClick={createJob}
          >
            {schedule ? (
              <>
                <Clock3 className="mr-2 h-4 w-4" /> Add to queue
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" /> Publish now
              </>
            )}
          </Button>
        </section>
      )}

      {tab === "queue" && (
        <section className="p-4">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-base font-bold">Publishing queue</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Content waiting to publish or connect.
              </p>
            </div>
            <span className="text-sm font-bold">{jobs.length}</span>
          </div>
          {jobs.length === 0 ? (
            <p className="py-16 text-center text-sm text-zinc-500">
              Your next post will appear here.
            </p>
          ) : (
            <div className="mt-5 space-y-3">
              {jobs.map((job) => (
                <article
                  key={job.id}
                  className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="line-clamp-2 text-sm font-semibold">
                      {job.content}
                    </p>
                    <span
                      className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase ${job.status === "published" ? "bg-emerald-400 text-black" : job.status === "scheduled" ? "bg-white text-black" : "bg-zinc-800 text-zinc-300"}`}
                    >
                      {queueStatus(job)}
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-zinc-500">
                    {job.platforms.join(" · ")} ·{" "}
                    {new Date(job.scheduledFor).toLocaleString()}
                  </p>
                  {job.deliveries && job.deliveries.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {job.deliveries.map((delivery) =>
                        delivery.provider === "youtube" &&
                        delivery.providerContentId ? (
                          <a
                            key={delivery.id}
                            href={`https://youtu.be/${delivery.providerContentId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-full bg-zinc-900 px-2 py-1 text-[10px] font-semibold text-white underline"
                          >
                            YouTube · View unlisted video
                          </a>
                        ) : (
                          <span
                            key={delivery.id}
                            className={`rounded-full px-2 py-1 text-[10px] font-semibold ${delivery.status === "failed" ? "bg-red-950 text-red-300" : "bg-zinc-900 text-zinc-400"}`}
                          >
                            {delivery.provider} ·{" "}
                            {deliveryStatus(delivery.status)}
                          </span>
                        ),
                      )}
                    </div>
                  )}
                  {new Set(["needs_connection", "needs_provider", "failed", "canceled"]).has(job.status) && (
                    <div className="mt-3 flex gap-2">
                      <Button size="sm" variant="outline" className="border-zinc-700 bg-black text-white hover:bg-zinc-900 hover:text-white" disabled={changeQueueJob.isPending} onClick={() => changeQueueJob.mutate({ id: job.id, action: "retry" })}>Retry</Button>
                      {job.status !== "canceled" && <Button size="sm" variant="ghost" className="text-zinc-400 hover:bg-zinc-900 hover:text-white" disabled={changeQueueJob.isPending} onClick={() => changeQueueJob.mutate({ id: job.id, action: "cancel" })}>Cancel</Button>}
                    </div>
                  )}
                  {job.status === "scheduled" && (
                    <Button size="sm" variant="ghost" className="mt-3 text-zinc-400 hover:bg-zinc-900 hover:text-white" disabled={changeQueueJob.isPending} onClick={() => changeQueueJob.mutate({ id: job.id, action: "cancel" })}>Cancel scheduled post</Button>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}
      {tab === "calendar" && (
        <section className="p-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            <h2 className="text-base font-bold">Content calendar</h2>
          </div>
          {Object.keys(byDate).length === 0 ? (
            <p className="py-16 text-center text-sm text-zinc-500">
              Schedule content from the composer to build your calendar.
            </p>
          ) : (
            <div className="mt-5 space-y-5">
              {Object.entries(byDate).map(([date, dateJobs]) => (
                <section key={date}>
                  <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">
                    {date}
                  </h3>
                  <div className="mt-2 space-y-2">
                    {dateJobs.map((job) => (
                      <article
                        key={job.id}
                        className="rounded-xl border border-zinc-800 bg-zinc-950 p-3"
                      >
                        <p className="line-clamp-1 text-sm font-semibold">
                          {job.content}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {new Date(job.scheduledFor).toLocaleTimeString([], {
                            hour: "numeric",
                            minute: "2-digit",
                          })}{" "}
                          · {job.platforms.join(", ")}
                        </p>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
