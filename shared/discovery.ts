import { z } from "zod";

export const feedModes = ["following", "chronological", "recommended"] as const;
export const discoveryWeightsSchema = z.object({ recency: z.number().min(0).max(10), engagement: z.number().min(0).max(10), relationship: z.number().min(0).max(10), interest: z.number().min(0).max(10), quality: z.number().min(0).max(10) }).strict();
export const discoveryGuardrailsSchema = z.object({ maxPerCreator: z.number().int().min(1).max(10), candidateWindow: z.number().int().min(20).max(500), sensitivePenalty: z.number().min(0).max(1), diversityTopics: z.boolean(), minimumCreatorShare: z.number().min(0).max(1) }).strict();
export const discoveryPolicySchema = z.object({ key: z.string().trim().min(1).max(80).default("native_feed"), version: z.number().int().positive(), weights: discoveryWeightsSchema, guardrails: discoveryGuardrailsSchema }).strict();
export const discoveryPreferenceSchema = z.object({ interests: z.array(z.string().trim().min(1).max(80)).max(50).transform((values) => Array.from(new Set(values.map((value) => value.toLowerCase())))), hiddenCreatorIds: z.array(z.number().int().positive()).max(1_000), sensitiveContent: z.enum(["allow", "reduce", "hide"]) }).strict();
export const contentModerationStateSchema = z.object({ targetType: z.enum(["post", "product", "community", "user"]), targetId: z.string().trim().min(1).max(120), visibility: z.enum(["visible", "restricted", "removed"]), sensitive: z.boolean().default(false), reason: z.string().trim().max(1_000).nullable().default(null) }).strict();

export type RankedDiscoveryItem<T> = { item: T; score: number; explanation: string[]; policyVersion: number; rank: number };
