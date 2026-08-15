import { z } from "zod";

export const audienceSubscriberStatuses = ["prospect", "subscribed", "unsubscribed", "suppressed"] as const;
export const audienceLifecycleStates = ["new", "engaged", "qualified", "customer", "advocate", "dormant", "churned"] as const;
export const notificationChannels = ["in_app", "email", "push"] as const;
export const notificationPurposes = ["essential", "product", "marketing", "community", "commerce"] as const;

export const upsertAudienceProfileSchema = z.object({
  subscriberStatus: z.enum(audienceSubscriberStatuses),
  lifecycleState: z.enum(audienceLifecycleStates),
  acquisitionSource: z.string().trim().min(1).max(120),
  interests: z.array(z.string().trim().min(1).max(80)).max(50).transform((values) => Array.from(new Set(values.map((value) => value.toLowerCase())))),
  engagementScore: z.number().min(0).max(100).default(0),
  fields: z.record(z.unknown()).default({}),
}).strict();

export const createAudienceSegmentSchema = z.object({ name: z.string().trim().min(1).max(120), description: z.string().trim().max(1_000).default(""), filter: z.object({ subscriberStatus: z.enum(audienceSubscriberStatuses).optional(), lifecycleState: z.enum(audienceLifecycleStates).optional(), interestsAny: z.array(z.string().trim().min(1).max(80)).max(20).optional(), acquisitionSource: z.string().trim().max(120).optional(), minimumEngagementScore: z.number().min(0).max(100).optional() }).default({}) }).strict();

export const notificationPreferenceSchema = z.object({
  recipientUserId: z.number().int().positive().optional(), relationshipId: z.string().uuid().optional(), channel: z.enum(notificationChannels), purpose: z.enum(notificationPurposes), enabled: z.boolean(), quietHoursStart: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().default(null), quietHoursEnd: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().default(null), timezone: z.string().trim().min(1).max(80).default("UTC"), digestCadence: z.enum(["immediate", "hourly", "daily", "weekly", "off"]).default("immediate"),
}).strict().refine((value) => Number(Boolean(value.recipientUserId)) + Number(Boolean(value.relationshipId)) === 1, "Choose exactly one recipient");

export const createNotificationEventSchema = z.object({
  recipientUserId: z.number().int().positive().optional(), relationshipId: z.string().uuid().optional(), eventType: z.string().trim().min(1).max(120), title: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(10_000), linkTo: z.string().trim().max(500).nullable().default(null), purpose: z.enum(notificationPurposes), urgency: z.enum(["low", "normal", "high", "critical"]).default("normal"), channels: z.array(z.enum(notificationChannels)).min(1).max(3).transform((values) => Array.from(new Set(values))), data: z.record(z.unknown()).default({}), dedupeKey: z.string().trim().min(8).max(200), scheduledAt: z.coerce.date().default(() => new Date()),
}).strict().refine((value) => Number(Boolean(value.recipientUserId)) + Number(Boolean(value.relationshipId)) === 1, "Choose exactly one recipient");

export type NotificationAdapterRequest = { deliveryId: string; channel: (typeof notificationChannels)[number]; recipient: { userId?: number; relationshipId?: string; address?: string }; title: string; body: string; linkTo: string | null; data: Record<string, unknown>; idempotencyKey: string };
export type NotificationAdapterResult = { status: "sent" | "provider_pending" | "failed"; providerReceiptId?: string; errorCode?: string; retryable?: boolean };
export interface NotificationAdapter { channel: (typeof notificationChannels)[number]; send(request: NotificationAdapterRequest): Promise<NotificationAdapterResult>; }

export const audienceFormFieldSchema = z.object({
  key: z.string().trim().regex(/^[a-z][a-z0-9_]{0,39}$/),
  label: z.string().trim().min(1).max(100),
  type: z.enum(["text", "email", "textarea", "select", "checkbox"]),
  required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
}).strict().refine((field) => field.type !== "select" || Boolean(field.options?.length), "Select fields require options");

export const createAudienceFormSchema = z.object({
  name: z.string().trim().min(1).max(120), title: z.string().trim().min(1).max(200), description: z.string().trim().max(2_000).default(""), fields: z.array(audienceFormFieldSchema).max(30).default([]), tags: z.array(z.string().trim().min(1).max(80)).max(20).transform((values) => Array.from(new Set(values.map((value) => value.toLowerCase())))), consentPurpose: z.enum(notificationPurposes).default("marketing"), disclosureVersion: z.string().trim().min(1).max(80).default("v1"), successMessage: z.string().trim().min(1).max(500).default("You are subscribed."),
}).strict().transform((form) => ({ ...form, fields: [{ key: "email", label: "Email", type: "email" as const, required: true }, ...form.fields.filter((field) => field.key !== "email")] }));

export const publicAudienceSubmissionSchema = z.object({
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()), displayName: z.string().trim().min(1).max(160).optional(), values: z.record(z.unknown()).default({}), consentGranted: z.literal(true),
}).strict();

export const createLandingPageSchema = z.object({
  name: z.string().trim().min(1).max(120), formId: z.string().uuid().nullable().default(null), headline: z.string().trim().min(1).max(200), subheadline: z.string().trim().max(1_000).default(""), sections: z.array(z.record(z.unknown())).max(40).default([]), theme: z.record(z.unknown()).default({}), seoTitle: z.string().trim().max(70).nullable().default(null), seoDescription: z.string().trim().max(160).nullable().default(null),
}).strict();

export const newsletterContentBlockSchema = z.object({
  id: z.string().trim().min(1).max(80), type: z.enum(["text", "heading", "image", "button", "divider", "social", "product", "signature"]), content: z.record(z.unknown()),
}).strict();

export const createNewsletterIssueSchema = z.object({
  name: z.string().trim().min(1).max(160), subject: z.string().trim().min(1).max(200), previewText: z.string().trim().max(300).default(""), segmentId: z.string().uuid().nullable().default(null), content: z.array(newsletterContentBlockSchema).min(1).max(100), variants: z.array(z.object({ key: z.string().trim().min(1).max(30), subject: z.string().trim().min(1).max(200), percentage: z.number().int().min(1).max(100) }).strict()).max(5).default([]), scheduledAt: z.coerce.date().nullable().default(null),
}).strict().refine((value) => !value.variants.length || value.variants.reduce((sum, variant) => sum + variant.percentage, 0) === 100, "A/B variant percentages must total 100");

export const createNewsletterSequenceSchema = z.object({
  name: z.string().trim().min(1).max(160), trigger: z.object({ type: z.enum(["manual", "form_submission", "segment_entry", "tag_added"]), value: z.string().trim().max(200).nullable().default(null) }).strict(), steps: z.array(z.object({ position: z.number().int().positive(), delayMinutes: z.number().int().min(0).max(525_600), subject: z.string().trim().min(1).max(200), previewText: z.string().trim().max(300).default(""), content: z.array(newsletterContentBlockSchema).min(1).max(100) }).strict()).min(1).max(100),
}).strict().refine((value) => new Set(value.steps.map((step) => step.position)).size === value.steps.length, "Step positions must be unique");

export const updatePublicPreferencesSchema = z.object({
  marketingEmail: z.boolean(), digestCadence: z.enum(["immediate", "daily", "weekly", "off"]).default("immediate"), timezone: z.string().trim().min(1).max(80).default("UTC"),
}).strict();
