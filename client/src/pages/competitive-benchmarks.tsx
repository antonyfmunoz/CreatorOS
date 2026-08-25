import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  LockKeyhole,
  Play,
  Scale,
  ShieldCheck,
  TimerReset,
  UploadCloud,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requiredBenchmarkEvidenceKinds } from "@shared/competitive-benchmarks";

type Run = {
  id: string;
  implementation: "creativesos" | "comparison";
  comparisonProduct: string | null;
  status: "in_progress" | "completed" | "failed" | "invalid";
  activeTimeMs: number | null;
  manualHandoffCount: number | null;
  outputQualityScore: number | null;
};

type Definition = {
  id: string;
  family: string;
  name: string;
  version: number;
  targetUser: string;
  workflow: string;
  comparisonProducts: string[];
  parityRequirements: Array<{
    id: string;
    comparisonProduct: string;
    capability: string;
    acceptanceCriterion: string;
    tier: "required_parity" | "specialist_edge" | "connected_advantage";
  }>;
  sourceReferences: Array<{ label: string; url: string; checkedAt: string }>;
  status: "draft" | "locked" | "retired";
  competitiveState:
    | "not_benchmarked"
    | "parity_failed"
    | "parity_met"
    | "connected_advantage_proven";
  runs: Run[];
  assessments: Array<{
    id: string;
    state: string;
    activeTimeReductionBps: number;
    handoffReductionBps: number;
    reviewerNote: string;
    requiredCapabilityCount: number;
    passedCapabilityCount: number;
    failedCapabilityCount: number;
  }>;
  remediations: Array<{
    id: string;
    comparisonProduct: string;
    requirementId: string;
    capability: string;
    acceptanceCriterion: string;
    status: "open" | "in_progress" | "ready_for_retest" | "resolved";
    priority: number;
    dueAt: string | null;
    operatorNote: string;
    failureCount: number;
    lastFailureNote: string;
    workItemId: string | null;
    resolvedAt: string | null;
  }>;
};

function RemediationPlanForm({
  remediation,
}: {
  remediation: Definition["remediations"][number];
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [priority, setPriority] = useState(String(remediation.priority));
  const [dueAt, setDueAt] = useState(remediation.dueAt?.slice(0, 10) ?? "");
  const [operatorNote, setOperatorNote] = useState(remediation.operatorNote);
  const save = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/benchmarks/remediations/${remediation.id}`, {
        priority: Number(priority),
        dueAt: dueAt ? `${dueAt}T23:59:59.000Z` : null,
        operatorNote,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/benchmarks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/planning/calendar"] });
      toast({ title: "Remediation plan saved" });
    },
    onError: (error) =>
      toast({
        title: "Could not save remediation plan",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      }),
  });
  return (
    <details className="mt-3 rounded-lg border border-zinc-800 bg-black/20 p-3">
      <summary className="cursor-pointer text-xs font-semibold text-zinc-300">
        Plan ownership and timing
      </summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`remediation-priority-${remediation.id}`}>Priority</Label>
          <Input
            id={`remediation-priority-${remediation.id}`}
            aria-label="Remediation priority"
            type="number"
            min="0"
            max="100"
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`remediation-due-${remediation.id}`}>Due date</Label>
          <Input
            id={`remediation-due-${remediation.id}`}
            aria-label="Remediation due date"
            type="date"
            value={dueAt}
            onChange={(event) => setDueAt(event.target.value)}
          />
        </div>
      </div>
      <div className="mt-3 space-y-1">
        <Label htmlFor={`remediation-note-${remediation.id}`}>Operator note</Label>
        <Textarea
          id={`remediation-note-${remediation.id}`}
          aria-label="Remediation operator note"
          value={operatorNote}
          onChange={(event) => setOperatorNote(event.target.value)}
          placeholder="Owner, next action, dependency, or release target"
        />
      </div>
      <Button
        className="mt-3"
        size="sm"
        variant="outline"
        disabled={save.isPending || !priority || Number(priority) > 100}
        onClick={() => save.mutate()}
      >
        {save.isPending ? "Saving…" : "Save plan"}
      </Button>
    </details>
  );
}

function RunCompletionForm({ run }: { run: Run }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [values, setValues] = useState({
    activeMinutes: "",
    elapsedMinutes: "",
    applicationCount: "1",
    exportCount: "0",
    uploadCount: "0",
    manualHandoffCount: "0",
    actionCount: "",
    retryCount: "0",
    failureCount: "0",
    unrecoverableErrorCount: "0",
    outputQualityScore: "",
    safetyScore: "",
    reliabilityScore: "",
    accessibilityScore: "",
    notes: "",
  });
  const [evidence, setEvidence] = useState(() =>
    Object.fromEntries(
      requiredBenchmarkEvidenceKinds.map((kind) => [
        kind,
        { uri: "", checksum: "", filename: "", verified: false },
      ]),
    ) as Record<
      (typeof requiredBenchmarkEvidenceKinds)[number],
      { uri: string; checksum: string; filename: string; verified: boolean }
    >,
  );
  const [uploadingEvidence, setUploadingEvidence] = useState<
    (typeof requiredBenchmarkEvidenceKinds)[number] | null
  >(null);
  const mutation = useMutation({
    mutationFn: async () =>
      (
        await apiRequest("PATCH", `/api/benchmarks/runs/${run.id}`, {
          status: "completed",
          activeTimeMs: Math.round(Number(values.activeMinutes) * 60_000),
          elapsedTimeMs: Math.round(Number(values.elapsedMinutes) * 60_000),
          applicationCount: Number(values.applicationCount),
          exportCount: Number(values.exportCount),
          uploadCount: Number(values.uploadCount),
          manualHandoffCount: Number(values.manualHandoffCount),
          actionCount: Number(values.actionCount),
          retryCount: Number(values.retryCount),
          failureCount: Number(values.failureCount),
          unrecoverableErrorCount: Number(values.unrecoverableErrorCount),
          outputQualityScore: Number(values.outputQualityScore),
          safetyScore: Number(values.safetyScore),
          reliabilityScore: Number(values.reliabilityScore),
          accessibilityScore: Number(values.accessibilityScore),
          notes: values.notes,
          evidence: requiredBenchmarkEvidenceKinds.map((kind) => ({
            kind,
            uri: evidence[kind].uri,
            checksum: evidence[kind].checksum,
          })),
        })
      ).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/benchmarks"] });
      toast({ title: "Benchmark evidence sealed" });
    },
    onError: (error) =>
      toast({
        title: "Run could not be completed",
        description:
          error instanceof Error ? error.message : "Check every field.",
        variant: "destructive",
      }),
  });
  const update = (key: keyof typeof values, value: string) =>
    setValues((current) => ({ ...current, [key]: value }));
  const uploadEvidence = async (
    kind: (typeof requiredBenchmarkEvidenceKinds)[number],
    file: File,
  ) => {
    if (file.size <= 0 || file.size > 500 * 1024 * 1024) {
      toast({
        title: "Evidence file is not valid",
        description: "Choose a non-empty file up to 500 MB.",
        variant: "destructive",
      });
      return;
    }
    setUploadingEvidence(kind);
    let pendingAssetId: string | null = null;
    let uploadedAssetId: string | null = null;
    try {
      const mimeType = file.type || "application/octet-stream";
      let asset: { id: string };
      try {
        const intent = (await (
          await apiRequest("POST", "/api/assets/upload-intents", {
            kind: "download",
            filename: file.name,
            mimeType,
            sizeBytes: file.size,
            visibility: "private",
            clientMutationId: crypto.randomUUID(),
          })
        ).json()) as {
          asset: { id: string };
          upload: { uploadUrl: string } | null;
          alreadyComplete?: boolean;
        };
        pendingAssetId = intent.asset.id;
        if (!intent.alreadyComplete) {
          if (!intent.upload?.uploadUrl)
            throw new Error("Direct storage upload was unavailable");
          const stored = await fetch(intent.upload.uploadUrl, {
            method: "PUT",
            body: file,
            headers: { "Content-Type": mimeType },
          });
          if (!stored.ok)
            throw new Error("Direct storage upload was unavailable");
          await apiRequest("POST", `/api/assets/${intent.asset.id}/complete`, {});
        }
        asset = intent.asset;
      } catch (directError) {
        if (pendingAssetId)
          await apiRequest("DELETE", `/api/assets/${pendingAssetId}`, {}).catch(
            () => undefined,
          );
        const body = new FormData();
        body.append("kind", "download");
        body.append("visibility", "private");
        body.append("clientMutationId", crypto.randomUUID());
        body.append("benchmark-evidence", file, file.name);
        const response = await fetch("/api/assets/upload-proxy", {
          method: "POST",
          credentials: "include",
          body,
        });
        if (!response.ok) {
          const result = (await response.json().catch(() => ({}))) as {
            message?: string;
          };
          throw new Error(
            result.message ??
              (directError instanceof Error
                ? directError.message
                : "Evidence upload failed"),
          );
        }
        asset = ((await response.json()) as { asset: { id: string } }).asset;
      }
      uploadedAssetId = asset.id;
      const attached = (await (
        await apiRequest("POST", `/api/benchmarks/runs/${run.id}/evidence`, {
          kind,
          assetId: asset.id,
        })
      ).json()) as {
        uri: string;
        checksum: string;
        filename: string | null;
      };
      setEvidence((current) => ({
        ...current,
        [kind]: {
          uri: attached.uri,
          checksum: attached.checksum,
          filename: attached.filename ?? file.name,
          verified: true,
        },
      }));
      toast({ title: `${kind.replaceAll("_", " ")} verified` });
    } catch (error) {
      if (uploadedAssetId)
        await apiRequest("DELETE", `/api/assets/${uploadedAssetId}`, {}).catch(
          () => undefined,
        );
      toast({
        title: "Evidence upload failed",
        description:
          error instanceof Error ? error.message : "Try this upload again.",
        variant: "destructive",
      });
    } finally {
      setUploadingEvidence(null);
    }
  };
  const scoreFields = [
    ["outputQualityScore", "Output quality"],
    ["safetyScore", "Safety"],
    ["reliabilityScore", "Reliability"],
    ["accessibilityScore", "Accessibility"],
  ] as const;
  const countFields = [
    ["applicationCount", "Applications"],
    ["exportCount", "Exports"],
    ["uploadCount", "Uploads"],
    ["manualHandoffCount", "Manual handoffs"],
    ["actionCount", "Operator actions"],
    ["retryCount", "Retries"],
    ["failureCount", "Failures"],
    ["unrecoverableErrorCount", "Unrecoverable errors"],
  ] as const;
  return (
    <details
      className="rounded-xl border border-zinc-800 p-3"
      data-testid={`benchmark-run-${run.id}`}
    >
      <summary className="cursor-pointer text-sm font-semibold text-white">
        Finish{" "}
        {run.implementation === "creativesos"
          ? "CreativesOS"
          : run.comparisonProduct}{" "}
        run
      </summary>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Label>
          Active operator minutes
          <Input
            value={values.activeMinutes}
            onChange={(event) => update("activeMinutes", event.target.value)}
            type="number"
            min="0.01"
            step="0.01"
          />
        </Label>
        <Label>
          End-to-end elapsed minutes
          <Input
            value={values.elapsedMinutes}
            onChange={(event) => update("elapsedMinutes", event.target.value)}
            type="number"
            min="0.01"
            step="0.01"
          />
        </Label>
        {countFields.map(([key, label]) => (
          <Label key={key}>
            {label}
            <Input
              value={values[key]}
              onChange={(event) => update(key, event.target.value)}
              type="number"
              min="0"
              step="1"
            />
          </Label>
        ))}
        {scoreFields.map(([key, label]) => (
          <Label key={key}>
            {label} (0–5)
            <Input
              value={values[key]}
              onChange={(event) => update(key, event.target.value)}
              type="number"
              min="0"
              max="5"
              step="0.1"
            />
          </Label>
        ))}
      </div>
      <div className="mt-3 space-y-3 rounded-xl border border-zinc-800 p-3">
        <p className="text-sm font-semibold text-zinc-200">
          Required tamper-evident artifacts
        </p>
        {requiredBenchmarkEvidenceKinds.map((kind) => (
          <div key={kind} className="rounded-lg border border-zinc-800 p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold capitalize text-zinc-200">
                  {kind.replaceAll("_", " ")}
                </p>
                <p className="text-[11px] text-zinc-500">
                  Private custody with a server-calculated SHA-256 checksum
                </p>
              </div>
              {evidence[kind].verified ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {evidence[kind].filename || "Verified"}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
                  <UploadCloud className="h-3.5 w-3.5" /> Upload preferred
                </span>
              )}
            </div>
            <Input
              aria-label={`Upload ${kind.replaceAll("_", " ")} evidence`}
              data-testid={`benchmark-evidence-${run.id}-${kind}`}
              type="file"
              disabled={uploadingEvidence !== null}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadEvidence(kind, file);
                event.currentTarget.value = "";
              }}
            />
            <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_0.7fr]">
            <Label>
              Evidence URI
              <Input
                data-testid={`benchmark-evidence-uri-${run.id}-${kind}`}
                value={evidence[kind].uri}
                onChange={(event) =>
                  setEvidence((current) => ({
                    ...current,
                    [kind]: {
                      ...current[kind],
                      uri: event.target.value,
                      verified: false,
                    },
                  }))
                }
                placeholder="artifact://…, r2://…, or approved report URL"
              />
            </Label>
            <Label>
              Checksum
              <Input
                data-testid={`benchmark-evidence-checksum-${run.id}-${kind}`}
                value={evidence[kind].checksum}
                onChange={(event) =>
                  setEvidence((current) => ({
                    ...current,
                    [kind]: {
                      ...current[kind],
                      checksum: event.target.value,
                      verified: false,
                    },
                  }))
                }
                placeholder="sha256:…"
              />
            </Label>
            </div>
          </div>
        ))}
      </div>
      <Label className="mt-3 block">
        Operator notes
        <Textarea
          value={values.notes}
          onChange={(event) => update("notes", event.target.value)}
          placeholder="Record outcome quality, failures, recovery, exclusions, and anything a reviewer must know."
        />
      </Label>
      <Button
        className="mt-3"
        disabled={mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        Seal run evidence
      </Button>
    </details>
  );
}

function BenchmarkCard({ definition }: { definition: Definition }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [reviewNote, setReviewNote] = useState("");
  const [qualityComparable, setQualityComparable] = useState(false);
  const [requirementReviews, setRequirementReviews] = useState<
    Record<string, { passed: boolean; note: string }>
  >({});
  const [runEnvironment, setRunEnvironment] = useState({
    protocolVersion: "1",
    sourceManifestId: "",
    deviceClass: "desktop-browser",
    networkClass: "broadband",
    operatorSkillLevel: "trained" as "novice" | "trained" | "expert",
    locale: "en-US",
  });
  const completedNative = definition.runs.find(
    (run) => run.implementation === "creativesos" && run.status === "completed",
  );
  const completedComparison = definition.runs.find(
    (run) => run.implementation === "comparison" && run.status === "completed",
  );
  const selectedRequirements = definition.parityRequirements.filter(
    (requirement) =>
      requirement.comparisonProduct === completedComparison?.comparisonProduct &&
      requirement.tier === "required_parity",
  );
  const requirementReviewsComplete =
    selectedRequirements.length > 0 &&
    selectedRequirements.every(
      (requirement) =>
        (requirementReviews[requirement.id]?.note.trim().length ?? 0) >= 10,
    );
  const mutate = useMutation({
    mutationFn: async (request: {
      method: string;
      url: string;
      body?: unknown;
    }) =>
      (
        await apiRequest(request.method, request.url, request.body ?? {})
      ).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/benchmarks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/planning/calendar"] });
    },
    onError: (error) =>
      toast({
        title: "Benchmark operation failed",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      }),
  });
  const start = (
    implementation: "creativesos" | "comparison",
    comparisonProduct: string | null,
  ) =>
    mutate.mutate({
      method: "POST",
      url: `/api/benchmarks/${definition.id}/runs`,
      body: {
        implementation,
        comparisonProduct,
        environment: runEnvironment,
      },
    });
  const assess = () => {
    if (!completedNative || !completedComparison) return;
    mutate.mutate({
      method: "POST",
      url: `/api/benchmarks/${definition.id}/assess`,
      body: {
        creativesOsRunId: completedNative.id,
        comparisonRunId: completedComparison.id,
        qualityComparable,
        reviewerNote: reviewNote,
        requirementResults: selectedRequirements.map((requirement) => ({
          requirementId: requirement.id,
          status: requirementReviews[requirement.id]?.passed
            ? "passed"
            : "failed",
          evidenceKinds: requiredBenchmarkEvidenceKinds,
          note: requirementReviews[requirement.id]?.note ?? "",
        })),
      },
    });
  };
  const updateRemediation = (
    id: string,
    status: "open" | "in_progress" | "ready_for_retest",
  ) =>
    mutate.mutate({
      method: "PATCH",
      url: `/api/benchmarks/remediations/${id}`,
      body: { status },
    });
  const activeRemediations = definition.remediations.filter(
    (remediation) => remediation.status !== "resolved",
  );
  return (
    <Card className="border-zinc-800 bg-zinc-950 text-white">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{definition.name}</CardTitle>
          <div className="flex gap-2">
            <Badge variant="outline">
              v{definition.version} · {definition.status}
            </Badge>
            <Badge>{definition.competitiveState.replaceAll("_", " ")}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-zinc-300">{definition.targetUser}</p>
        <p className="text-sm leading-6 text-zinc-400">{definition.workflow}</p>
        <div className="flex flex-wrap gap-2">
          {definition.comparisonProducts.map((product) => (
            <Badge key={product} variant="secondary">
              {product}
            </Badge>
          ))}
        </div>
        <details className="rounded-xl border border-zinc-800 p-3 text-sm text-zinc-400">
          <summary className="cursor-pointer font-semibold text-zinc-200">
            Specialist-substitution parity contract
          </summary>
          <p className="mt-2">
            Parity cannot pass until every required capability for the named
            comparison product has an evidence-linked reviewer verdict.
          </p>
          {definition.comparisonProducts.map((product) => {
            const requirements = definition.parityRequirements.filter(
              (item) =>
                item.comparisonProduct === product &&
                item.tier === "required_parity",
            );
            return (
              <div key={product} className="mt-3">
                <p className="font-semibold text-white">
                  {product} · {requirements.length} required capabilities
                </p>
                <ul className="mt-1 space-y-2">
                  {requirements.map((requirement) => (
                    <li key={requirement.id}>
                      <span className="text-zinc-200">{requirement.capability}</span>
                      <span className="block text-xs text-zinc-500">
                        {requirement.acceptanceCriterion}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </details>
        {definition.remediations.length > 0 ? (
          <section className="rounded-xl border border-zinc-800 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-white">
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  Mandatory parity remediation
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {activeRemediations.length} active ·{" "}
                  {definition.remediations.length - activeRemediations.length} resolved by locked retest
                </p>
              </div>
              <a
                href="/business/planner"
                className="text-xs font-semibold text-[#1d9bf0] hover:underline"
              >
                Open production planner
              </a>
            </div>
            <div className="mt-3 space-y-2">
              {definition.remediations.map((remediation) => (
                <article
                  key={remediation.id}
                  className={`rounded-lg border p-3 ${
                    remediation.status === "resolved"
                      ? "border-emerald-900 bg-emerald-950/20"
                      : "border-amber-900 bg-amber-950/20"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
                        {remediation.status === "resolved" ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-amber-400" />
                        )}
                        {remediation.capability}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {remediation.comparisonProduct} · {remediation.status.replaceAll("_", " ")} · priority {remediation.priority} · failed {remediation.failureCount} time{remediation.failureCount === 1 ? "" : "s"}
                      </p>
                      <p className="mt-2 text-xs text-zinc-400">
                        {remediation.acceptanceCriterion}
                      </p>
                      <p className="mt-1 text-xs text-amber-200/80">
                        Latest evidence: {remediation.lastFailureNote}
                      </p>
                    </div>
                    {remediation.status === "open" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={mutate.isPending}
                        onClick={() => updateRemediation(remediation.id, "in_progress")}
                      >
                        Start work
                      </Button>
                    ) : remediation.status === "in_progress" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={mutate.isPending}
                        onClick={() => updateRemediation(remediation.id, "ready_for_retest")}
                      >
                        Ready for retest
                      </Button>
                    ) : remediation.status === "ready_for_retest" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={mutate.isPending}
                        onClick={() => updateRemediation(remediation.id, "in_progress")}
                      >
                        Resume work
                      </Button>
                    ) : null}
                  </div>
                  {remediation.status !== "resolved" ? (
                    <RemediationPlanForm remediation={remediation} />
                  ) : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}
        <details className="text-sm text-zinc-400">
          <summary className="cursor-pointer font-semibold text-zinc-200">
            Current primary sources
          </summary>
          <ul className="mt-2 space-y-2">
            {definition.sourceReferences.map((source) => (
              <li key={source.url}>
                <a
                  className="inline-flex items-center gap-1 text-[#1d9bf0] hover:underline"
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {source.label}
                  <ExternalLink className="h-3 w-3" />
                </a>{" "}
                · checked {new Date(source.checkedAt).toLocaleDateString()}
              </li>
            ))}
          </ul>
        </details>
        {definition.status === "draft" ? (
          <Button
            onClick={() =>
              mutate.mutate({
                method: "POST",
                url: `/api/benchmarks/${definition.id}/lock`,
              })
            }
            disabled={mutate.isPending}
          >
            <LockKeyhole className="mr-2 h-4 w-4" />
            Lock inputs before testing
          </Button>
        ) : null}
        {definition.status === "locked" ? (
          <div className="space-y-3">
            <div className="grid gap-3 rounded-xl border border-zinc-800 p-3 sm:grid-cols-2">
              <Label>
                Locked source manifest ID
                <Input
                  value={runEnvironment.sourceManifestId}
                  onChange={(event) =>
                    setRunEnvironment((current) => ({
                      ...current,
                      sourceManifestId: event.target.value,
                    }))
                  }
                  placeholder="manifest:campaign-source-v1"
                />
              </Label>
              <Label>
                Device class
                <Input
                  value={runEnvironment.deviceClass}
                  onChange={(event) =>
                    setRunEnvironment((current) => ({
                      ...current,
                      deviceClass: event.target.value,
                    }))
                  }
                />
              </Label>
              <Label>
                Network class
                <Input
                  value={runEnvironment.networkClass}
                  onChange={(event) =>
                    setRunEnvironment((current) => ({
                      ...current,
                      networkClass: event.target.value,
                    }))
                  }
                />
              </Label>
              <Label>
                Locale
                <Input
                  value={runEnvironment.locale}
                  onChange={(event) =>
                    setRunEnvironment((current) => ({
                      ...current,
                      locale: event.target.value,
                    }))
                  }
                />
              </Label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => start("creativesos", null)}
                disabled={
                  mutate.isPending ||
                  runEnvironment.sourceManifestId.trim().length < 3
                }
              >
                <Play className="mr-2 h-4 w-4" />
                Start CreativesOS run
              </Button>
              {definition.comparisonProducts.map((product) => (
                <Button
                  key={product}
                  variant="outline"
                  onClick={() => start("comparison", product)}
                  disabled={
                    mutate.isPending ||
                    runEnvironment.sourceManifestId.trim().length < 3
                  }
                >
                  Start {product}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
        <div className="space-y-2">
          {definition.runs
            .filter((run) => run.status === "in_progress")
            .map((run) => (
              <RunCompletionForm key={run.id} run={run} />
            ))}
        </div>
        {completedNative && completedComparison ? (
          <div className="rounded-xl border border-zinc-800 p-3">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <Scale className="h-4 w-4" />
              Independent review
            </p>
            <Textarea
              value={reviewNote}
              onChange={(event) => setReviewNote(event.target.value)}
              placeholder="At least 40 characters: compare output quality and control, identify any material loss, and document the verdict."
            />
            <div className="mt-4 space-y-3">
              <p className="text-sm font-semibold text-white">
                Required capability verdicts for {completedComparison.comparisonProduct}
              </p>
              {selectedRequirements.map((requirement) => {
                const review = requirementReviews[requirement.id] ?? {
                  passed: false,
                  note: "",
                };
                return (
                  <div
                    key={requirement.id}
                    className="rounded-lg border border-zinc-800 p-3"
                  >
                    <Label className="flex items-start gap-2 text-sm font-normal text-zinc-200">
                      <Checkbox
                        checked={review.passed}
                        onCheckedChange={(checked) =>
                          setRequirementReviews((current) => ({
                            ...current,
                            [requirement.id]: {
                              ...review,
                              passed: checked === true,
                            },
                          }))
                        }
                        aria-label={`Pass capability ${requirement.capability}`}
                      />
                      <span>
                        <span className="block font-semibold">
                          {requirement.capability}
                        </span>
                        <span className="block text-xs text-zinc-500">
                          {requirement.acceptanceCriterion}
                        </span>
                      </span>
                    </Label>
                    <Input
                      className="mt-2"
                      value={review.note}
                      onChange={(event) =>
                        setRequirementReviews((current) => ({
                          ...current,
                          [requirement.id]: {
                            ...review,
                            note: event.target.value,
                          },
                        }))
                      }
                      aria-label={`Evidence note for ${requirement.capability}`}
                      placeholder="Describe the evidence and any material deficit"
                    />
                  </div>
                );
              })}
            </div>
            <Label className="mt-3 flex items-start gap-2 text-sm font-normal text-zinc-300">
              <Checkbox
                checked={qualityComparable}
                onCheckedChange={(checked) =>
                  setQualityComparable(checked === true)
                }
                aria-label="Outputs are materially comparable"
              />
              I reviewed the locked outputs and affirm they are materially
              comparable in quality, safety, reliability, and accessibility.
              Leave this unchecked to record a failed parity assessment.
            </Label>
            <Button
              className="mt-2"
              onClick={assess}
              disabled={
                mutate.isPending ||
                reviewNote.trim().length < 40 ||
                !requirementReviewsComplete
              }
            >
              Assess locked pair
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function CompetitiveBenchmarksPage() {
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const { data = [], isLoading } = useQuery<Definition[]>({
    queryKey: ["/api/benchmarks"],
  });
  const stateCounts = useMemo(
    () =>
      data.reduce<Record<string, number>>((counts, definition) => {
        counts[definition.competitiveState] =
          (counts[definition.competitiveState] ?? 0) + 1;
        return counts;
      }, {}),
    [data],
  );
  const filteredDefinitions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data.filter((definition) => {
      if (
        stateFilter !== "all" &&
        definition.competitiveState !== stateFilter
      ) {
        return false;
      }
      if (!query) return true;
      return [
        definition.family,
        definition.name,
        definition.targetUser,
        ...definition.comparisonProducts,
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [data, search, stateFilter]);
  return (
    <main className="min-h-dvh bg-black px-4 pb-24 pt-6 text-white">
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <div className="flex items-center gap-2 text-[#1d9bf0]">
            <TimerReset className="h-5 w-5" />
            <span className="text-sm font-semibold uppercase tracking-widest">
              Evidence laboratory
            </span>
          </div>
          <h1 className="mt-2 text-3xl font-black">Competitive Benchmarks</h1>
          <p className="mt-2 max-w-3xl text-zinc-400">
            Lock identical inputs, record both operator runs, preserve evidence,
            then let the rubric calculate parity and connected advantage. A
            feature checklist never upgrades the claim.
          </p>
          <p className="mt-3 text-sm text-zinc-500">
            {stateCounts.not_benchmarked ?? 0} not benchmarked ·{" "}
            {stateCounts.parity_met ?? 0} parity met ·{" "}
            {stateCounts.connected_advantage_proven ?? 0} connected advantages
            proven
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_220px]">
            <Input
              aria-label="Search benchmark families"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search a family or comparison product"
              className="border-zinc-800 bg-zinc-950"
            />
            <select
              aria-label="Filter benchmark state"
              value={stateFilter}
              onChange={(event) => setStateFilter(event.target.value)}
              className="h-10 rounded-md border border-zinc-800 bg-zinc-950 px-3 text-sm"
            >
              <option value="all">All competitive states</option>
              <option value="not_benchmarked">Not benchmarked</option>
              <option value="parity_failed">Parity failed</option>
              <option value="parity_met">Parity met</option>
              <option value="connected_advantage_proven">
                Connected advantage proven
              </option>
            </select>
          </div>
          <p className="mt-2 text-xs text-zinc-600">
            Showing {filteredDefinitions.length} of {data.length} families
          </p>
        </header>
        {isLoading ? (
          <p>Loading benchmark ledger…</p>
        ) : (
          filteredDefinitions.map((definition) => (
            <BenchmarkCard key={definition.id} definition={definition} />
          ))
        )}
      </div>
    </main>
  );
}
