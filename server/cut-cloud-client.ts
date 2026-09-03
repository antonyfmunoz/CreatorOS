import { cutCloudDispatchBodySchema, signCutCloudDispatch } from "./cut-cloud-contract";

const activeDispatches = new Set<string>();
export const cutCloudDispatchLeaseMs = 30 * 60_000;

export function cutCloudDispatchLeaseDue(heartbeatAt: Date | null, now = new Date()) {
  return !heartbeatAt || heartbeatAt.getTime() <= now.getTime() - cutCloudDispatchLeaseMs;
}

export function cutCloudDispatchConfigured(environment: NodeJS.ProcessEnv = process.env) {
  return Boolean(environment.CUT_CLOUD_DISPATCH_URL && environment.CUT_CLOUD_DISPATCH_SECRET?.length && environment.CUT_CLOUD_DISPATCH_SECRET.length >= 32);
}

export async function dispatchCutStudioCloudJob(jobId: string, environment: NodeJS.ProcessEnv = process.env) {
  const body = cutCloudDispatchBodySchema.parse({ jobId });
  const endpoint = environment.CUT_CLOUD_DISPATCH_URL?.trim();
  const secret = environment.CUT_CLOUD_DISPATCH_SECRET ?? "";
  if (!endpoint || secret.length < 32) throw Object.assign(new Error("CutStudio external processing is not configured"), { code: "cut_cloud_not_configured" });
  if (activeDispatches.has(jobId)) return { accepted: true, duplicate: true };
  activeDispatches.add(jobId);
  try {
    const envelope = signCutCloudDispatch(secret, body);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CreativesOS-Issued-At": envelope.issuedAt,
        "X-CreativesOS-Nonce": envelope.nonce,
        "X-CreativesOS-Signature": envelope.signature,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw Object.assign(new Error(`CutStudio cloud dispatch failed with ${response.status}`), { code: "cut_cloud_dispatch_failed", status: response.status });
    const result: unknown = await response.json();
    if (!result || typeof result !== "object" || !("accepted" in result) || result.accepted !== true) {
      throw Object.assign(new Error("CutStudio cloud start was not confirmed"), { code: "cut_cloud_dispatch_unconfirmed" });
    }
    return result as { accepted: true; duplicate?: boolean; execution?: string };
  } finally {
    activeDispatches.delete(jobId);
  }
}
