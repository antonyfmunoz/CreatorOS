const dispatchPath = "/api/internal/distribution/dispatch";
const dispatchTimeoutMs = 20_000;
const backupPath = "/api/internal/operations/backup";
const backupTimeoutMs = 14 * 60_000;

function dispatchUrl(baseUrl: string) {
  return new URL(dispatchPath, baseUrl).toString();
}

async function dispatchDueJobs(environment: Env) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), dispatchTimeoutMs);

  try {
    const response = await fetch(dispatchUrl(environment.API_BASE_URL), {
      method: "POST",
      headers: {
        authorization: `Bearer ${environment.DISTRIBUTION_DISPATCH_SECRET}`,
        "content-type": "application/json",
      },
      body: "{}",
      signal: controller.signal,
    });
    await response.body?.cancel();

    console.log(
      JSON.stringify({
        event: "distribution_dispatch",
        ok: response.ok,
        status: response.status,
      }),
    );
    if (!response.ok) {
      throw new Error(`Distribution dispatcher returned ${response.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function requestDailyBackup(environment: Env) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), backupTimeoutMs);
  try {
    const response = await fetch(new URL(backupPath, environment.API_BASE_URL), {
      method: "POST",
      headers: {
        authorization: `Bearer ${environment.DISTRIBUTION_DISPATCH_SECRET}`,
        "content-type": "application/json",
      },
      body: "{}",
      signal: controller.signal,
    });
    await response.body?.cancel();
    console.log(JSON.stringify({ event: "production_backup", ok: response.ok, status: response.status }));
    if (!response.ok) throw new Error(`Production backup returned ${response.status}`);
  } finally {
    clearTimeout(timeout);
  }
}

export default {
  scheduled(event, environment, context) {
    const tasks: Array<Promise<unknown>> = [dispatchDueJobs(environment)];
    if (event.cron === "17 9 * * *") tasks.push(requestDailyBackup(environment));
    context.waitUntil(Promise.all(tasks));
  },
} satisfies ExportedHandler<Env>;
