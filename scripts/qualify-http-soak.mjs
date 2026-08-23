#!/usr/bin/env node

const baseUrl = (process.env.LOAD_TEST_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");

function boundedNumber(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}

const durationSeconds = boundedNumber(process.env.SOAK_TEST_DURATION_SECONDS, 30, 10, 300);
const concurrency = boundedNumber(process.env.SOAK_TEST_CONCURRENCY, 24, 1, 100);
const minimumRequests = boundedNumber(process.env.SOAK_TEST_MINIMUM_REQUESTS, 5_000, 100, 1_000_000);
const maxP95Ms = boundedNumber(process.env.SOAK_TEST_MAX_P95_MS, 500, 25, 10_000);
const maxP99Ms = boundedNumber(process.env.SOAK_TEST_MAX_P99_MS, 1_000, 25, 20_000);
const paths = ["/api/health", "/api/ready"];
const deadline = performance.now() + durationSeconds * 1_000;
const durations = [];
const statuses = Object.fromEntries(paths.map((path) => [path, {}]));
const failureSamples = [];
let requests = 0;
let failures = 0;

async function worker(workerIndex) {
  let iteration = 0;
  while (performance.now() < deadline) {
    const path = paths[(workerIndex + iteration) % paths.length];
    const started = performance.now();
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        headers: { accept: "application/json" },
        redirect: "manual",
        signal: AbortSignal.timeout(5_000),
      });
      statuses[path][response.status] = (statuses[path][response.status] ?? 0) + 1;
      if (!response.ok) {
        failures += 1;
        if (failureSamples.length < 20) {
          failureSamples.push({ path, status: response.status, body: (await response.text()).slice(0, 500) });
        }
      } else {
        await response.arrayBuffer();
      }
    } catch (error) {
      failures += 1;
      if (failureSamples.length < 20) {
        failureSamples.push({ path, error: error instanceof Error ? error.message : String(error) });
      }
    } finally {
      requests += 1;
      durations.push(performance.now() - started);
      iteration += 1;
    }
  }
}

const started = performance.now();
await Promise.all(Array.from({ length: concurrency }, (_, index) => worker(index)));
const elapsedMs = performance.now() - started;
durations.sort((a, b) => a - b);

const percentile = (ratio) =>
  Number(durations[Math.min(durations.length - 1, Math.max(0, Math.ceil(durations.length * ratio) - 1))].toFixed(1));
const result = {
  schemaVersion: "creativesos.http-soak-qualification.v1",
  status: failures === 0 && requests >= minimumRequests ? "qualified" : "failed",
  baseUrl,
  durationSeconds: Number((elapsedMs / 1_000).toFixed(1)),
  concurrency,
  minimumRequests,
  requests,
  failures,
  failureSamples,
  throughputPerSecond: Number((requests / (elapsedMs / 1_000)).toFixed(1)),
  latencyMs: {
    p50: percentile(0.5),
    p95: percentile(0.95),
    p99: percentile(0.99),
    max: Number(durations.at(-1).toFixed(1)),
  },
  statuses,
};

console.log(JSON.stringify(result));
if (failures > 0 || requests < minimumRequests || result.latencyMs.p95 > maxP95Ms || result.latencyMs.p99 > maxP99Ms) {
  process.exit(1);
}
