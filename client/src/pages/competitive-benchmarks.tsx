import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink,
  LockKeyhole,
  Play,
  Scale,
  TimerReset,
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
  }>;
};

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
    evidenceUri: "",
    notes: "",
  });
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
          evidence: [{ kind: "operator_evidence", uri: values.evidenceUri }],
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
    <details className="rounded-xl border border-zinc-800 p-3">
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
      <Label className="mt-3 block">
        Evidence URI
        <Input
          value={values.evidenceUri}
          onChange={(event) => update("evidenceUri", event.target.value)}
          placeholder="artifact://…, r2://…, or approved report URL"
        />
      </Label>
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
  const completedNative = definition.runs.find(
    (run) => run.implementation === "creativesos" && run.status === "completed",
  );
  const completedComparison = definition.runs.find(
    (run) => run.implementation === "comparison" && run.status === "completed",
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
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["/api/benchmarks"] }),
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
        environment: { capturedBy: "operator" },
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
      },
    });
  };
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
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => start("creativesos", null)}
              disabled={mutate.isPending}
            >
              <Play className="mr-2 h-4 w-4" />
              Start CreativesOS run
            </Button>
            {definition.comparisonProducts.map((product) => (
              <Button
                key={product}
                variant="outline"
                onClick={() => start("comparison", product)}
                disabled={mutate.isPending}
              >
                Start {product}
              </Button>
            ))}
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
              disabled={mutate.isPending || reviewNote.trim().length < 40}
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
        </header>
        {isLoading ? (
          <p>Loading benchmark ledger…</p>
        ) : (
          data.map((definition) => (
            <BenchmarkCard key={definition.id} definition={definition} />
          ))
        )}
      </div>
    </main>
  );
}
