import { z } from "zod";

export const cutLocalNodeCapabilitiesSchema = z.object({
  isolatedCode: z.boolean(),
  docker: z.boolean(),
  maxConcurrentJobs: z.number().int().min(1).max(4).default(1),
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
export type CutLocalNodeCapabilities = z.infer<typeof cutLocalNodeCapabilitiesSchema>;
