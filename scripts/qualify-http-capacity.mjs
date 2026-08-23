#!/usr/bin/env node

const baseUrl = (process.env.LOAD_TEST_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
function boundedNumber(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}
const requestCount = boundedNumber(process.env.LOAD_TEST_REQUESTS, 500, 10, 10_000);
const concurrency = boundedNumber(process.env.LOAD_TEST_CONCURRENCY, 25, 1, 100);
const profile = process.env.LOAD_TEST_PROFILE === "mixed" ? "mixed" : "public";
const runId = process.env.LOAD_TEST_RUN_ID ?? crypto.randomUUID();
const paths = (process.env.LOAD_TEST_PATHS ?? "/api/health,/api/ready,/api/posts,/api/communities")
  .split(",")
  .map((value) => value.trim())
  .filter((value) => /^\/api\/[a-z0-9/_-]*$/i.test(value));
if (!paths.length) throw new Error("No safe capacity paths were configured");
const durations = [];
let failures = 0;
let next = 0;
const failureSamples = [];
const pathResults = Object.fromEntries((profile === "mixed" ? [] : paths).map((path) => [path, { requests: 0, failures: 0, durations: [] }]));

const mixedReads = [
  "/api/user",
  "/api/businesses",
  "/api/content-drafts",
  "/api/campaigns",
  "/api/distribution-jobs",
  "/api/media/assets",
  "/api/posts",
  "/api/communities",
];
if (profile === "mixed") {
  pathResults["POST /api/content-drafts"] = { requests: 0, failures: 0, durations: [] };
}

function requestFor(index) {
  if (profile !== "mixed") return { path: paths[index % paths.length], method: "GET", headers: {} };
  const userId = index % 2 === 0 ? "1" : "2";
  // Keep the normal-capacity phase below the endpoint's documented 240-request
  // protection budget. Abuse/rate-limit behavior is qualified separately.
  if (index % 64 === 0) {
    return {
      path: "/api/content-drafts",
      resultKey: "POST /api/content-drafts",
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: baseUrl,
        "x-creativesos-demo-user": userId,
      },
      body: JSON.stringify({ content: `capacity:${runId}:user:${userId}:request:${index}`, kind: "post", audience: "private" }),
    };
  }
  return {
    path: mixedReads[index % mixedReads.length],
    method: "GET",
    headers: { "x-creativesos-demo-user": userId },
  };
}

async function worker() {
  while (true) {
    const index = next++;
    if (index >= requestCount) return;
    const started = performance.now();
    const request = requestFor(index);
    const resultKey = request.resultKey ?? request.path;
    const pathResult = pathResults[resultKey] ??= { requests: 0, failures: 0, durations: [] };
    pathResult.requests += 1;
    try {
      const response = await fetch(`${baseUrl}${request.path}`, { method: request.method, headers: request.headers, body: request.body, redirect: "manual" });
      pathResult.statuses ??= {};
      pathResult.statuses[response.status] = (pathResult.statuses[response.status] ?? 0) + 1;
      if (!response.ok) {
        failures += 1;
        pathResult.failures += 1;
        if (failureSamples.length < 20) failureSamples.push({ method: request.method, path: request.path, status: response.status, body: (await response.clone().text()).slice(0, 500) });
      }
      const body = await response.arrayBuffer();
      if (profile === "mixed" && response.ok && request.path === "/api/content-drafts" && request.method === "GET") {
        const drafts = JSON.parse(new TextDecoder().decode(body));
        const expectedUser = request.headers["x-creativesos-demo-user"];
        if (!Array.isArray(drafts) || drafts.some((draft) => draft.userId !== Number(expectedUser))) {
          failures += 1;
          pathResult.failures += 1;
          if (failureSamples.length < 20) failureSamples.push({ method: request.method, path: request.path, status: response.status, body: `tenant isolation mismatch for user ${expectedUser}` });
        }
      }
    } catch {
      failures += 1;
      pathResult.failures += 1;
    } finally {
      const duration = performance.now() - started;
      durations.push(duration);
      pathResult.durations.push(duration);
    }
  }
}

const runStarted = performance.now();
await Promise.all(Array.from({ length: concurrency }, () => worker()));
const elapsedMs = performance.now() - runStarted;
durations.sort((a, b) => a - b);
const percentile = (value) => Number(durations[Math.min(durations.length - 1, Math.ceil(durations.length * value) - 1)].toFixed(1));
const result = {
  schemaVersion: "creativesos.capacity-qualification.v1",
  baseUrl,
  profile,
  runId,
  requestCount,
  concurrency,
  failures,
  failureSamples,
  errorRate: Number((failures / requestCount).toFixed(4)),
  throughputPerSecond: Number((requestCount / (elapsedMs / 1_000)).toFixed(1)),
  latencyMs: { p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99), max: Number(durations.at(-1).toFixed(1)) },
  paths: Object.fromEntries(Object.entries(pathResults).map(([path, value]) => {
    value.durations.sort((a, b) => a - b);
    const at = (ratio) => Number(value.durations[Math.min(value.durations.length - 1, Math.ceil(value.durations.length * ratio) - 1)].toFixed(1));
    return [path, { requests: value.requests, failures: value.failures, statuses: value.statuses ?? {}, p95Ms: at(0.95), p99Ms: at(0.99) }];
  })),
};
console.log(JSON.stringify(result));
if (failures > 0 || result.latencyMs.p95 > Number(process.env.LOAD_TEST_MAX_P95_MS ?? 1_000) || result.latencyMs.p99 > Number(process.env.LOAD_TEST_MAX_P99_MS ?? 2_000)) process.exit(1);
