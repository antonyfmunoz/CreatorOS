import { z } from "zod";

const sourceId = z.string().trim().min(1).max(200);
const url = z.string().url().max(2_000).nullable().optional();

export const portableProductSchema = z.object({
  sourceId,
  title: z.string().trim().min(1).max(200),
  description: z.string().max(20_000).default(""),
  price: z.number().finite().min(0).max(10_000_000),
  category: z.string().trim().min(1).max(100).default("Imported"),
  imageUrl: url,
  productType: z.enum(["digital_download", "course", "community", "membership", "bundle", "appointment", "event_ticket", "service"]).default("digital_download"),
  billingModel: z.enum(["one_time", "recurring"]).default("one_time"),
  billingInterval: z.enum(["month", "year"]).nullable().optional(),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
});

const portableLessonSchema = z.object({
  sourceId,
  title: z.string().trim().min(1).max(200),
  body: z.string().max(100_000).default(""),
  videoUrl: url,
  resourceUrls: z.array(z.string().url().max(2_000)).max(50).default([]),
  durationSeconds: z.number().int().min(0).max(86_400).default(0),
  availableAfterDays: z.number().int().min(0).max(3_650).default(0),
  published: z.boolean().default(false),
  assessment: z.object({
    passingScorePercent: z.number().int().min(1).max(100).default(70),
    questions: z.array(z.object({
      id: sourceId,
      prompt: z.string().trim().min(1).max(2_000),
      choices: z.array(z.string().max(1_000)).min(2).max(10),
      answerIndex: z.number().int().min(0),
    }).refine((question) => question.answerIndex < question.choices.length, "Answer index must identify a choice")).max(100),
  }).nullable().optional(),
});

export const portableCourseSchema = portableProductSchema.extend({
  productType: z.literal("course").default("course"),
  modules: z.array(z.object({
    sourceId,
    title: z.string().trim().min(1).max(200),
    description: z.string().max(10_000).default(""),
    lessons: z.array(portableLessonSchema).max(500),
  })).max(100),
});

export const portableContactSchema = z.object({
  sourceId,
  name: z.string().trim().min(1).max(200),
  imageUrl: url,
  purchaseInfo: z.string().max(10_000).nullable().optional(),
});

const portableAutomationStepSchema = z.object({
  stepKey: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(120),
  actionType: z.string().trim().min(1).max(120),
  config: z.record(z.string(), z.unknown()).default({}),
  position: z.number().int().min(0).max(1_000),
  approvalPolicy: z.enum(["none", "always", "consequential"]).default("none"),
  retryLimit: z.number().int().min(0).max(10).default(2),
  timeoutMs: z.number().int().min(100).max(300_000).default(30_000),
});

export const portableAutomationSchema = z.object({
  sourceId,
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2_000).default(""),
  triggerType: z.string().trim().min(1).max(100),
  triggerConfig: z.record(z.string(), z.unknown()).default({}),
  maxRunsPerHour: z.number().int().min(1).max(10_000).default(20),
  maxStepsPerRun: z.number().int().min(1).max(500).default(20),
  retentionDays: z.number().int().min(1).max(3_650).default(90),
  status: z.enum(["draft", "paused"]).default("draft"),
  steps: z.array(portableAutomationStepSchema).min(1).max(500),
});

export const portabilityPackageSchema = z.object({
  schemaVersion: z.literal("creativesos.portability.v1"),
  sourceSystem: z.string().trim().min(1).max(100),
  exportedAt: z.string().datetime().optional(),
  products: z.array(portableProductSchema).max(5_000).default([]),
  courses: z.array(portableCourseSchema).max(1_000).default([]),
  contacts: z.array(portableContactSchema).max(10_000).default([]),
  automations: z.array(portableAutomationSchema).max(1_000).default([]),
}).superRefine((input, context) => {
  for (const [domain, records] of Object.entries({ products: input.products, courses: input.courses, contacts: input.contacts, automations: input.automations })) {
    const seen = new Set<string>();
    records.forEach((record, index) => {
      if (seen.has(record.sourceId)) context.addIssue({ code: "custom", path: [domain, index, "sourceId"], message: "Source IDs must be unique within a domain" });
      seen.add(record.sourceId);
    });
  }
});

export const portabilityImportRequestSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(200),
  package: portabilityPackageSchema,
});

export type PortabilityPackage = z.infer<typeof portabilityPackageSchema>;
