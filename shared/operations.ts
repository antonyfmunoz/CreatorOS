import { z } from "zod";

export const operationalServices = [
  "playback",
  "messaging",
  "automation",
  "commerce",
  "realtime",
  "developer_api",
  "webhooks",
] as const;

export type OperationalService = (typeof operationalServices)[number];

export const operationalServiceLevels: ReadonlyArray<{
  service: OperationalService;
  name: string;
  targetAvailability: number;
  targetP95Ms: number;
  windowDays: number;
}> = [
  { service: "playback", name: "Media playback", targetAvailability: 0.995, targetP95Ms: 2_000, windowDays: 30 },
  { service: "messaging", name: "Messaging", targetAvailability: 0.999, targetP95Ms: 1_000, windowDays: 30 },
  { service: "automation", name: "Automations", targetAvailability: 0.995, targetP95Ms: 5_000, windowDays: 30 },
  { service: "commerce", name: "Commerce", targetAvailability: 0.999, targetP95Ms: 2_000, windowDays: 30 },
  { service: "realtime", name: "Realtime rooms", targetAvailability: 0.995, targetP95Ms: 1_500, windowDays: 30 },
  { service: "developer_api", name: "Developer API", targetAvailability: 0.999, targetP95Ms: 800, windowDays: 30 },
  { service: "webhooks", name: "Webhook delivery", targetAvailability: 0.995, targetP95Ms: 5_000, windowDays: 30 },
];

export const operationalBudgetSchema = z.object({
  service: z.enum(operationalServices),
  softLimitMicros: z.number().int().min(0).max(100_000_000_000),
  hardLimitMicros: z.number().int().min(0).max(100_000_000_000),
  enabled: z.boolean().default(true),
}).refine((value) => value.hardLimitMicros >= value.softLimitMicros, {
  message: "The hard limit must be at least the soft limit",
  path: ["hardLimitMicros"],
});

export function errorBudget(input: {
  total: number;
  failed: number;
  targetAvailability: number;
}) {
  const allowedFailures = input.total * (1 - input.targetAvailability);
  const remaining = Math.max(0, allowedFailures - input.failed);
  return {
    allowedFailures,
    remaining,
    consumedRatio: allowedFailures > 0 ? input.failed / allowedFailures : input.failed > 0 ? 1 : 0,
    state: input.total === 0 ? "unmeasured" : input.failed > allowedFailures ? "exhausted" : "healthy",
  } as const;
}
