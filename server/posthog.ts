import { PostHog } from "posthog-node";

const POSTHOG_KEY = process.env.POSTHOG_KEY as string | undefined;
const POSTHOG_HOST = process.env.POSTHOG_HOST as string | undefined;

export const posthog = POSTHOG_KEY
  ? new PostHog(POSTHOG_KEY, {
      host: POSTHOG_HOST ?? "https://us.i.posthog.com",
    })
  : null;

export async function shutdownPostHog() {
  await posthog?.shutdown();
}
