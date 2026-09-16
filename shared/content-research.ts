import { z } from "zod";

const sourceSchema = z.object({
  label: z.string().trim().min(1).max(160),
  url: z.string().trim().url().max(2_000),
});

const competitorSchema = z.object({
  name: z.string().trim().min(1).max(160),
  platform: z.string().trim().max(80).default(""),
  url: z.string().trim().url().max(2_000).optional().or(z.literal("")),
  observation: z.string().trim().max(1_500).default(""),
});

export const contentResearchBriefSchema = z.object({
  topic: z.string().trim().min(1).max(240),
  audience: z.string().trim().max(500).default(""),
  objective: z.string().trim().max(1_000).default(""),
  angle: z.string().trim().max(1_500).default(""),
  workingTitle: z.string().trim().max(240).default(""),
  draftText: z.string().trim().max(2_200).default(""),
  plannedFor: z.string().datetime().nullable().default(null),
  sources: z.array(sourceSchema).max(30).default([]),
  competitors: z.array(competitorSchema).max(30).default([]),
});

export const contentResearchBriefUpdateSchema = contentResearchBriefSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one research field is required",
  });

export type ContentResearchBriefInput = z.infer<typeof contentResearchBriefSchema>;
