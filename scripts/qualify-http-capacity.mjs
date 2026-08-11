#!/usr/bin/env node

const baseUrl = (process.env.LOAD_TEST_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
function boundedNumber(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, parsed)) : fallback;
}
const requestCount = boundedNumber(process.env.LOAD_TEST_REQUESTS, 200, 10, 10_000);
const concurrency = boundedNumber(process.env.LOAD_TEST_CONCURRENCY, 20, 1, 100);
const paths = ["/api/health", "/api/ready"];
const durations = [];
let failures = 0;
let next = 0;

async function worker() {
  while (true) {
    const index = next++;
    if (index >= requestCount) return;
    const started = performance.now();
    try {
      const response = await fetch(`${baseUrl}${paths[index % paths.length]}`, { redirect: "manual" });
      if (!response.ok) failures += 1;
      await response.arrayBuffer();
    } catch {
      failures += 1;
    } finally {
      durations.push(performance.now() - started);
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
  requestCount,
  concurrency,
  failures,
  errorRate: Number((failures / requestCount).toFixed(4)),
  throughputPerSecond: Number((requestCount / (elapsedMs / 1_000)).toFixed(1)),
  latencyMs: { p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99), max: Number(durations.at(-1).toFixed(1)) },
};
console.log(JSON.stringify(result));
if (failures > 0 || result.latencyMs.p95 > Number(process.env.LOAD_TEST_MAX_P95_MS ?? 1_000)) process.exit(1);
