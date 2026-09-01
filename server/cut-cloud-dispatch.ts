import "dotenv/config";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { cutCloudDispatchBodySchema, verifyCutCloudDispatch } from "./cut-cloud-contract";

const project = process.env.CUT_CLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || "";
const region = process.env.CUT_CLOUD_REGION || "us-central1";
const jobName = process.env.CUT_CLOUD_JOB_NAME || "creativesos-cut-worker";
const secret = process.env.CUT_CLOUD_DISPATCH_SECRET || "";
const port = Number(process.env.PORT) || 8080;
const recentNonces = new Map<string, number>();
const nonceTtlMs = 10 * 60_000;
const jobDispatchTtlMs = 30 * 60_000;

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const body = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += body.length;
    if (total > 16_384) throw Object.assign(new Error("Request body is too large"), { status: 413 });
    chunks.push(body);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function pruneNonces(now: number) {
  recentNonces.forEach((expiresAt, nonce) => {
    if (expiresAt <= now) recentNonces.delete(nonce);
  });
}

async function metadataAccessToken() {
  const response = await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", {
    headers: { "Metadata-Flavor": "Google" },
    signal: AbortSignal.timeout(3_000),
  });
  if (!response.ok) throw new Error(`Metadata token request failed with ${response.status}`);
  const payload = await response.json() as { access_token?: string };
  if (!payload.access_token) throw new Error("Metadata token response was incomplete");
  return payload.access_token;
}

async function runWorkerJob(configuredProject = project, configuredRegion = region, configuredJobName = jobName) {
  const token = await metadataAccessToken();
  const url = `https://run.googleapis.com/v2/projects/${encodeURIComponent(configuredProject)}/locations/${encodeURIComponent(configuredRegion)}/jobs/${encodeURIComponent(configuredJobName)}:run`;
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(10_000),
  });
  const payload = await response.json().catch(() => ({})) as { name?: string; error?: { message?: string } };
  if (!response.ok) throw new Error(payload.error?.message || `Cloud Run job execution failed with ${response.status}`);
  return payload.name ?? null;
}

type DispatchServerOptions = {
  project?: string;
  region?: string;
  jobName?: string;
  secret?: string;
  runWorker?: () => Promise<string | null>;
};

export function createCutCloudDispatchServer(options: DispatchServerOptions = {}) {
  const configuredProject = options.project ?? project;
  const configuredRegion = options.region ?? region;
  const configuredJobName = options.jobName ?? jobName;
  const configuredSecret = options.secret ?? secret;
  const executeWorker = options.runWorker ?? (() => runWorkerJob(configuredProject, configuredRegion, configuredJobName));
  const recentJobs = new Map<string, { expiresAt: number; execution: Promise<string | null> }>();
  if (!configuredProject) throw new Error("CUT_CLOUD_PROJECT or GOOGLE_CLOUD_PROJECT is required");
  if (configuredSecret.length < 32) throw new Error("CUT_CLOUD_DISPATCH_SECRET must contain at least 32 characters");
  return http.createServer(async (req, res) => {
    if (req.method === "GET" && (req.url === "/healthz" || req.url === "/readyz")) return json(res, 200, { status: "ok", project: configuredProject, region: configuredRegion, job: configuredJobName });
    if (req.method !== "POST" || req.url !== "/dispatch") return json(res, 404, { message: "Not found" });
    try {
      const parsed = cutCloudDispatchBodySchema.safeParse(await readJson(req));
      if (!parsed.success) return json(res, 400, { message: "Dispatch body is invalid" });
      const issuedAt = String(req.headers["x-creativesos-issued-at"] || "");
      const nonce = String(req.headers["x-creativesos-nonce"] || "");
      const signature = String(req.headers["x-creativesos-signature"] || "");
      if (!verifyCutCloudDispatch(configuredSecret, parsed.data, { issuedAt, nonce, signature })) return json(res, 401, { message: "Dispatch authorization failed" });
      const now = Date.now();
      pruneNonces(now);
      if (recentNonces.has(nonce)) return json(res, 202, { accepted: true, duplicate: true });
      recentNonces.set(nonce, now + nonceTtlMs);
      recentJobs.forEach((entry, queuedJobId) => {
        if (entry.expiresAt <= now) recentJobs.delete(queuedJobId);
      });
      const existing = recentJobs.get(parsed.data.jobId);
      if (existing) return json(res, 202, { accepted: true, duplicate: true, execution: await existing.execution });
      const requested = executeWorker();
      recentJobs.set(parsed.data.jobId, { expiresAt: now + jobDispatchTtlMs, execution: requested });
      let execution: string | null;
      try {
        execution = await requested;
      } catch (error) {
        recentJobs.delete(parsed.data.jobId);
        throw error;
      }
      process.stdout.write(`${JSON.stringify({ event: "cut.cloud.dispatched", jobId: parsed.data.jobId, execution })}\n`);
      return json(res, 202, { accepted: true, execution });
    } catch (error) {
      const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 502;
      console.error(JSON.stringify({ event: "cut.cloud.dispatch_failed", errorType: error instanceof Error ? error.name : typeof error }));
      return json(res, Number.isInteger(status) ? status : 502, { message: "The render worker could not be started" });
    }
  });
}

if (process.env.NODE_ENV !== "test") {
  createCutCloudDispatchServer().listen(port, "0.0.0.0", () => {
    process.stdout.write(`${JSON.stringify({ event: "cut.cloud.dispatcher.started", port, project, region, job: jobName })}\n`);
  });
}
