import { z } from "zod";

export const creativeWorkKinds = ["content", "campaign", "broadcast", "cut", "ugc", "distribution", "event", "podcast", "design", "newsletter", "site", "product_gap"] as const;
export const creativeWorkStatuses = ["idea", "brief", "script", "production", "edit", "review", "scheduled", "published", "retrospective", "blocked", "cancelled"] as const;

export const creativeRecurrenceSchema = z.object({
  frequency: z.enum(["daily", "weekly", "monthly"]),
  interval: z.number().int().min(1).max(12).default(1),
  occurrences: z.number().int().min(2).max(52).default(4),
});

export const createCreativeWorkItemSchema = z.object({
  title: z.string().trim().min(1).max(200), description: z.string().trim().max(4_000).default(""),
  kind: z.enum(creativeWorkKinds), status: z.enum(creativeWorkStatuses).default("idea"), priority: z.number().int().min(0).max(100).default(50),
  assigneeUserId: z.number().int().positive().nullable().default(null), channel: z.string().trim().max(80).nullable().default(null),
  parentWorkItemId: z.string().uuid().nullable().default(null),
  startsAt: z.coerce.date().nullable().default(null), dueAt: z.coerce.date().nullable().default(null), recurrence: z.union([creativeRecurrenceSchema, z.object({}).strict()]).default({}),
  sourceType: z.string().trim().max(80).nullable().default(null), sourceId: z.string().trim().max(180).nullable().default(null), metadata: z.record(z.unknown()).default({}),
}).superRefine((value, ctx) => { if (value.startsAt && value.dueAt && value.dueAt < value.startsAt) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["dueAt"], message: "Due date cannot precede the start date" }); });

export const updateCreativeWorkItemSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(), description: z.string().trim().max(4_000).optional(), kind: z.enum(creativeWorkKinds).optional(), priority: z.number().int().min(0).max(100).optional(), assigneeUserId: z.number().int().positive().nullable().optional(), parentWorkItemId: z.string().uuid().nullable().optional(), channel: z.string().trim().max(80).nullable().optional(), startsAt: z.coerce.date().nullable().optional(), dueAt: z.coerce.date().nullable().optional(), recurrence: z.record(z.unknown()).optional(), metadata: z.record(z.unknown()).optional(), version: z.number().int().positive(),
});

export const transitionCreativeWorkItemSchema = z.object({
  status: z.enum(creativeWorkStatuses),
  version: z.number().int().positive().optional(),
});

export const createChannelVariantsSchema = z.object({ variants: z.array(z.object({ channel: z.string().trim().min(1).max(80), title: z.string().trim().min(1).max(200).optional(), dueAt: z.coerce.date().nullable().optional() })).min(1).max(20) });
export const recoverMissedWorkSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reschedule"), dueAt: z.coerce.date(), note: z.string().trim().max(1_000).default("") }),
  z.object({ action: z.literal("cancel"), note: z.string().trim().max(1_000).default("") }),
]);

const forward: Record<string, Set<string>> = {
  idea: new Set(["brief", "cancelled", "blocked"]), brief: new Set(["script", "production", "cancelled", "blocked"]), script: new Set(["production", "edit", "blocked", "cancelled"]), production: new Set(["edit", "review", "blocked", "cancelled"]), edit: new Set(["review", "production", "blocked", "cancelled"]), review: new Set(["edit", "scheduled", "published", "blocked", "cancelled"]), scheduled: new Set(["published", "review", "blocked", "cancelled"]), published: new Set(["retrospective"]), retrospective: new Set(), blocked: new Set(["idea", "brief", "script", "production", "edit", "review", "scheduled", "cancelled"]), cancelled: new Set(),
};
export function canTransitionCreativeWork(from: string, to: string) { return forward[from]?.has(to) ?? false; }
