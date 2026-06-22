import posthog from "posthog-js";

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST as string | undefined;

export function initPostHog() {
  if (!POSTHOG_KEY) return;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST ?? "https://us.i.posthog.com",
    loaded: (ph) => {
      if (import.meta.env.DEV) ph.debug();
    },
  });
}

export { posthog };
