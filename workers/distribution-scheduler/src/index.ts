const dispatchPath = "/api/internal/distribution/dispatch";
const dispatchTimeoutMs = 20_000;

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

export default {
  scheduled(_event, environment, context) {
    context.waitUntil(dispatchDueJobs(environment));
  },
} satisfies ExportedHandler<Env>;
