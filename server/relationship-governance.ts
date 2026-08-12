import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db";
import { relationshipConsents } from "../shared/schema";

export const relationshipConsentStatuses = ["unknown", "granted", "denied", "withdrawn"] as const;

export const recordRelationshipConsentSchema = z.object({
  channel: z.string().trim().min(1).max(100),
  purpose: z.string().trim().min(1).max(100).default("messaging"),
  status: z.enum(relationshipConsentStatuses),
  evidenceNote: z.string().trim().max(2_000).default(""),
  disclosureVersion: z.string().trim().max(100).nullable().optional(),
  occurredAt: z.coerce.date().optional(),
}).strict().superRefine((value, context) => {
  if (value.status === "granted" && value.evidenceNote.length < 10) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["evidenceNote"], message: "Granted consent requires a specific evidence note" });
  }
});

export const reviewRelationshipMemorySchema = z.object({
  decision: z.enum(["accept", "reject"]),
}).strict();

export function effectiveRelationshipConsent<T extends { updatedAt: Date; createdAt: Date }>(rows: T[]) {
  return [...rows].sort((left, right) =>
    right.updatedAt.getTime() - left.updatedAt.getTime()
    || right.createdAt.getTime() - left.createdAt.getTime(),
  )[0] ?? null;
}

export function relationshipConsentAllowsMessaging(status?: string | null) {
  return status !== "withdrawn" && status !== "denied";
}

export async function recordRelationshipConsent(input: {
  businessId: string;
  relationshipId: string;
  channel: string;
  purpose: string;
  status: (typeof relationshipConsentStatuses)[number];
  source: string;
  disclosureVersion?: string | null;
  occurredAt: Date;
  evidence: Record<string, unknown>;
}) {
  return db.transaction(async (tx) => {
    const lockScope = [input.businessId, input.relationshipId, input.channel, input.purpose].join(":");
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`relationship-consent:${lockScope}`}))`);
    const existingRows = await tx.select().from(relationshipConsents).where(and(
      eq(relationshipConsents.businessId, input.businessId),
      eq(relationshipConsents.relationshipId, input.relationshipId),
      eq(relationshipConsents.channel, input.channel),
      eq(relationshipConsents.purpose, input.purpose),
    )).orderBy(desc(relationshipConsents.updatedAt), desc(relationshipConsents.createdAt));
    const existing = effectiveRelationshipConsent(existingRows);
    const values = {
      status: input.status,
      source: input.source,
      disclosureVersion: input.disclosureVersion ?? existing?.disclosureVersion ?? null,
      grantedAt: input.status === "granted" ? input.occurredAt : existing?.grantedAt ?? null,
      withdrawnAt: input.status === "withdrawn" ? input.occurredAt : null,
      evidence: input.evidence,
      updatedAt: new Date(),
    };
    if (existing) {
      const [updated] = await tx.update(relationshipConsents).set(values).where(eq(relationshipConsents.id, existing.id)).returning();
      return updated;
    }
    const [created] = await tx.insert(relationshipConsents).values({
      businessId: input.businessId,
      relationshipId: input.relationshipId,
      channel: input.channel,
      purpose: input.purpose,
      ...values,
    }).returning();
    return created;
  });
}
