import { z } from "zod";

export const nativeMediaWorkerCapabilities = [
  "probe",
  "thumbnail",
  "transcode",
  "package",
  "waveform",
  "cut_render",
  "cut_proxy",
  "cut_highlights",
  "cut_transcribe",
] as const;

const workerId = z.string().trim().min(1).max(180);
const region = z.string().trim().min(1).max(80);

export function normalizeMediaWorkerConfiguration(input: {
  id: string;
  region: string;
  capabilities?: string | string[];
  maxConcurrency?: string | number;
  version?: string | null;
  allowedCapabilities?: readonly string[];
}) {
  const allowed = input.allowedCapabilities ?? nativeMediaWorkerCapabilities;
  const explicitCapabilities = input.capabilities !== undefined;
  const values = Array.isArray(input.capabilities)
    ? input.capabilities
    : (input.capabilities ?? allowed.join(",")).split(",");
  const capabilities = Array.from(new Set(values.map((value) => value.trim())))
    .filter((value) => allowed.includes(value));
  if (explicitCapabilities && !capabilities.length) {
    throw new Error("A worker capability allowlist was provided, but none of its values are supported");
  }
  const requestedConcurrency = Number(input.maxConcurrency);
  return {
    id: workerId.parse(input.id),
    region: region.parse(input.region),
    capabilities: capabilities.length ? capabilities : [...allowed],
    maxConcurrency: Number.isFinite(requestedConcurrency)
      ? Math.max(1, Math.min(64, Math.trunc(requestedConcurrency)))
      : 2,
    version: input.version?.trim().slice(0, 240) || null,
  };
}
