const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST as string | undefined;

let clientPromise: Promise<typeof import("posthog-js").default> | undefined;

function loadPostHog() {
  if (!POSTHOG_KEY) return undefined;
  clientPromise ??= import("posthog-js").then(({ default: posthog }) => {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST ?? "https://us.i.posthog.com",
      capture_pageview: false,
      capture_pageleave: false,
      autocapture: false,
      capture_exceptions: true,
      persistence: "memory",
      person_profiles: "never",
      disable_session_recording: true,
      loaded: (ph) => {
        if (import.meta.env.DEV) ph.debug();
      },
    });
    return posthog;
  });
  return clientPromise;
}

export function initPostHog() {
  void loadPostHog();
}

export function capturePageView(path: string) {
  void loadPostHog()?.then((posthog) => {
    posthog.capture("$pageview", { $current_url: `${window.location.origin}${path}` });
  });
}

export function captureClientException(error: unknown) {
  void loadPostHog()?.then((posthog) => posthog.captureException(error));
}
