import { z } from "zod";

export const cutLocalNodeCapabilitiesSchema = z.object({
  isolatedCode: z.boolean(),
  docker: z.boolean(),
  // The current isolated host is intentionally single-tenant. Raising this
  // requires a separately qualified multi-container scheduler and admission
  // policy; a capability declaration must not get ahead of that work.
  maxConcurrentJobs: z.literal(1).default(1),
  cpuCores: z.number().int().min(1).max(256),
  memoryMb: z.number().int().min(512).max(1_048_576),
  operatingSystem: z.enum(["windows", "macos", "linux"]),
});
export const cutLocalNodeClaimSchema = z.object({
  token: z.string().min(32).max(256),
  name: z.string().trim().min(1).max(120),
  capabilities: cutLocalNodeCapabilitiesSchema,
});
export const cutLocalNodeHeartbeatSchema = z.object({
  sequence: z.number().int().positive(),
  status: z.enum(["ready", "busy", "paused"]),
});

export const cutLocalNodeJobLeaseSchema = z.object({
  leaseToken: z.string().uuid(),
});

export const cutLocalNodeJobHeartbeatSchema = cutLocalNodeJobLeaseSchema.extend({
  progress: z.number().min(0.05).max(0.99).optional(),
  detail: z.string().trim().min(1).max(240).optional(),
});

export const cutLocalNodeJobFailureSchema = cutLocalNodeJobLeaseSchema.extend({
  code: z.string().trim().regex(/^[a-z0-9_]{3,80}$/).default("local_node_render_failed"),
  detail: z.string().trim().min(1).max(400),
});

export const cutLocalNodeJobCompletionSchema = cutLocalNodeJobLeaseSchema.extend({
  storageKey: z.string().trim().min(1).max(1_000),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  filename: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,160}$/),
});
export type CutLocalNodeCapabilities = z.infer<typeof cutLocalNodeCapabilitiesSchema>;
