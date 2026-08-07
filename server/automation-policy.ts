import { z } from "zod";

export const automationDefinitionStatuses = ["draft", "active", "paused", "archived"] as const;
export const automationRunStatuses = [
  "queued",
  "running",
  "waiting_approval",
  "succeeded",
  "failed",
  "canceled",
  "dead_letter",
] as const;
export const automationTriggerTypes = ["manual", "event", "schedule", "message"] as const;
export const automationApprovalPolicies = ["none", "always", "consequential"] as const;

const safeObject = z.record(z.unknown()).default({});

const forbiddenSecretKey = /(^|_)(secret|password|api_?key|apikey|access_?key|accesskey|private_?key|privatekey|authorization|token)($|_)/i;
const secretLikeValue = /(sk_(live|test)_|pk_(live|test)_|whsec_|-----BEGIN .*PRIVATE KEY-----)/i;

export function automationConfigContainsSecret(value: unknown): boolean {
  if (typeof value === "string") return secretLikeValue.test(value);
  if (Array.isArray(value)) return value.some(automationConfigContainsSecret);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, nested]) => forbiddenSecretKey.test(key) || automationConfigContainsSecret(nested),
  );
}

export const automationStepInputSchema = z.object({
  stepKey: z.string().trim().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/),
  name: z.string().trim().min(1).max(120),
  actionType: z.string().trim().min(1).max(100).regex(/^[a-z][a-z0-9_.]*$/),
  config: safeObject,
  position: z.number().int().min(0).max(99),
  approvalPolicy: z.enum(automationApprovalPolicies).default("none"),
  retryLimit: z.number().int().min(0).max(10).default(2),
  timeoutMs: z.number().int().min(1_000).max(300_000).default(30_000),
});

const automationDefinitionObjectSchema = z.object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1_000).default(""),
    businessId: z.string().uuid().nullable().optional(),
    triggerType: z.enum(automationTriggerTypes).default("manual"),
    triggerConfig: safeObject,
    maxRunsPerHour: z.number().int().min(1).max(1_000).default(20),
    maxStepsPerRun: z.number().int().min(1).max(100).default(20),
    retentionDays: z.number().int().min(1).max(3_650).default(90),
  steps: z.array(automationStepInputSchema).min(1).max(100),
});

export const automationDefinitionInputSchema = automationDefinitionObjectSchema.superRefine((value, context) => {
    const keys = new Set<string>();
    const positions = new Set<number>();
    for (const step of value.steps) {
      if (keys.has(step.stepKey)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["steps"], message: `Duplicate step key: ${step.stepKey}` });
      }
      if (positions.has(step.position)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["steps"], message: `Duplicate step position: ${step.position}` });
      }
      keys.add(step.stepKey);
      positions.add(step.position);
    }
    if (value.steps.length > value.maxStepsPerRun) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["maxStepsPerRun"], message: "The run step budget is lower than the configured workflow" });
    }
    if (automationConfigContainsSecret(value.triggerConfig) || value.steps.some((step) => automationConfigContainsSecret(step.config))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["steps"], message: "Credentials and secret values cannot be stored in automation configuration" });
    }
});

export const automationDefinitionUpdateSchema = automationDefinitionObjectSchema
  .omit({ businessId: true })
  .partial()
  .extend({ status: z.enum(automationDefinitionStatuses).optional() });

export const automationRunInputSchema = z.object({
  input: safeObject,
  idempotencyKey: z.string().trim().min(8).max(200).optional(),
  maxCostUnits: z.number().int().min(1).max(100_000).default(100),
});

export const automationApprovalDecisionSchema = z.object({
  decision: z.enum(["approved", "declined"]),
  note: z.string().trim().max(1_000).optional(),
});

export const automationThreadMessageSchema = z.object({
  content: z.string().trim().min(1).max(10_000),
});

export const automationEventInputSchema = z.object({
  eventType: z.string().trim().min(1).max(120).regex(/^[a-z][a-z0-9_.]*$/),
  businessId: z.string().uuid().nullable().optional(),
  payload: safeObject,
  idempotencyKey: z.string().trim().min(8).max(200),
});

export function automationBackoffMs(attempt: number) {
  return Math.min(60_000, 1_000 * 2 ** Math.max(0, attempt - 1));
}

export function isTerminalAutomationStatus(status: string) {
  return status === "succeeded" || status === "failed" || status === "canceled" || status === "dead_letter";
}

export function requiresAutomationApproval(
  policy: (typeof automationApprovalPolicies)[number],
  actionIsConsequential: boolean,
) {
  return policy === "always" || (policy === "consequential" && actionIsConsequential);
}

export function sanitizeAutomationError(error: unknown) {
  const message = error instanceof Error ? error.message : "Automation action failed";
  return message.replace(/(sk_|pk_|whsec_|Bearer\s+)[A-Za-z0-9._-]+/gi, "$1[redacted]").slice(0, 1_000);
}
