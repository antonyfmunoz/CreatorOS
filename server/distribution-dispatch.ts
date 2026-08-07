import crypto from "node:crypto";

type DispatchEnvironment = Record<string, string | undefined>;

function configuredSecret(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

/**
 * The scheduler has its own capability, separate from user and provider
 * credentials. It can only ask the app to process jobs that are already due.
 */
export function isDistributionDispatchConfigured(
  environment: DispatchEnvironment = process.env,
) {
  return Boolean(configuredSecret(environment.DISTRIBUTION_DISPATCH_SECRET));
}

export function isAuthorizedDistributionDispatch(
  authorization: string | undefined,
  environment: DispatchEnvironment = process.env,
) {
  const expectedSecret = configuredSecret(
    environment.DISTRIBUTION_DISPATCH_SECRET,
  );
  const bearerPrefix = "Bearer ";
  if (!expectedSecret || !authorization?.startsWith(bearerPrefix)) return false;

  const presented = Buffer.from(authorization.slice(bearerPrefix.length), "utf8");
  const expected = Buffer.from(expectedSecret, "utf8");
  return (
    presented.length === expected.length &&
    crypto.timingSafeEqual(presented, expected)
  );
}
