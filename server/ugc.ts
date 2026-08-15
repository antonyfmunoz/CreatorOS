import type { Express, RequestHandler, Response } from "express";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  assets,
  businessMembers,
  businesses,
  campaigns,
  conversationParticipants,
  conversations,
  notifications,
  ugcApplications,
  ugcCollaborations,
  ugcCreatorProfiles,
  ugcEarningsLedger,
  ugcOpportunities,
  ugcPerformanceSnapshots,
  ugcPortfolioItems,
  ugcSampleShipments,
  ugcSubmissions,
  users,
} from "@shared/schema";
import {
  canTransitionUgcApplication,
  canTransitionUgcCollaboration,
  canTransitionUgcSampleShipment,
  ugcApplicationInputSchema,
  ugcCommissionAmount,
  ugcCreatorProfileInputSchema,
  ugcEarningsSummary,
  ugcOpportunityInputSchema,
  ugcPerformanceInputSchema,
  ugcPortfolioInputSchema,
  ugcSubmissionInputSchema,
  ugcSampleRequestSchema,
  ugcSampleShipmentUpdateSchema,
  validateUgcCompensation,
} from "@shared/ugc";
import { attachUser } from "./auth";
import { ensureDefaultBusiness, userCanManageBusiness } from "./businesses";
import {
  createPrivateAssetReadUrl,
  materializePrivateAsset,
} from "./asset-storage";
import { db } from "./db";
import { emitProjectionEvent } from "./umh";
import {
  decryptSensitiveJson,
  decryptSensitiveValue,
  encryptSensitiveJson,
  encryptSensitiveValue,
  isSensitiveDataEncryptionConfigured,
} from "./sensitive-data";
import { apiRateLimiter } from "./security";

const idSchema = z.string().uuid();
const reviewApplicationSchema = z.object({
  status: z.enum(["shortlisted", "rejected"]),
});
const reviewSubmissionSchema = z.object({
  decision: z.enum(["approved", "revision_requested", "rejected"]),
  feedback: z.string().trim().max(5_000).default(""),
});
const collaborationStatusSchema = z.object({
  status: z.enum(["live", "completed", "cancelled", "disputed", "in_progress"]),
});
const UGC_MANAGER_ROLES = ["owner", "admin", "operator"];

const safe =
  (handler: RequestHandler): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };

function noStore(res: Response) {
  res.setHeader("Cache-Control", "no-store");
}

function invalid(res: Response, error: z.ZodError) {
  return res
    .status(400)
    .json({
      message: error.issues[0]?.message ?? "Invalid UGC request",
      issues: error.issues,
    });
}

async function notify(
  userId: number,
  type: string,
  message: string,
  linkTo: string,
  sourceId: string,
  relatedUserId?: number,
) {
  await db
    .insert(notifications)
    .values({
      userId,
      type,
      message,
      linkTo,
      relatedUserId,
      sourceType: "ugc",
      sourceId,
    })
    .onConflictDoNothing();
}

async function opportunityWithBrand(id: string) {
  const [row] = await db
    .select({
      opportunity: ugcOpportunities,
      brand: {
        id: businesses.id,
        name: businesses.name,
        handle: businesses.handle,
        logoUrl: businesses.logoUrl,
      },
    })
    .from(ugcOpportunities)
    .innerJoin(businesses, eq(businesses.id, ugcOpportunities.businessId))
    .where(eq(ugcOpportunities.id, id))
    .limit(1);
  return row ?? null;
}

async function collaborationAccess(userId: number, id: string) {
  const [collaboration] = await db
    .select()
    .from(ugcCollaborations)
    .where(eq(ugcCollaborations.id, id))
    .limit(1);
  if (!collaboration) return null;
  if (collaboration.creatorUserId === userId)
    return { collaboration, role: "creator" as const };
  if (await userCanManageBusiness(userId, collaboration.businessId))
    return { collaboration, role: "brand" as const };
  return null;
}

async function assetOwnedBy(userId: number, assetId: string) {
  const [asset] = await db
    .select()
    .from(assets)
    .where(
      and(
        eq(assets.id, assetId),
        eq(assets.ownerUserId, userId),
        eq(assets.status, "ready"),
      ),
    )
    .limit(1);
  return asset ?? null;
}

async function detailedWorkroom(userId: number, id: string) {
  const access = await collaborationAccess(userId, id);
  if (!access) return null;
  const [
    opportunity,
    creator,
    submissions,
    performance,
    earnings,
    sampleShipments,
  ] = await Promise.all([
    opportunityWithBrand(access.collaboration.opportunityId),
    db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        profileImageUrl: users.profileImageUrl,
      })
      .from(users)
      .where(eq(users.id, access.collaboration.creatorUserId))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({
        submission: ugcSubmissions,
        asset: {
          id: assets.id,
          kind: assets.kind,
          mimeType: assets.mimeType,
          originalFilename: assets.originalFilename,
          visibility: assets.visibility,
        },
      })
      .from(ugcSubmissions)
      .innerJoin(assets, eq(assets.id, ugcSubmissions.assetId))
      .where(eq(ugcSubmissions.collaborationId, id))
      .orderBy(desc(ugcSubmissions.version)),
    db
      .select()
      .from(ugcPerformanceSnapshots)
      .where(eq(ugcPerformanceSnapshots.collaborationId, id))
      .orderBy(desc(ugcPerformanceSnapshots.capturedAt)),
    db
      .select()
      .from(ugcEarningsLedger)
      .where(eq(ugcEarningsLedger.collaborationId, id))
      .orderBy(desc(ugcEarningsLedger.createdAt)),
    db
      .select()
      .from(ugcSampleShipments)
      .where(eq(ugcSampleShipments.collaborationId, id))
      .orderBy(desc(ugcSampleShipments.createdAt)),
  ]);
  return {
    role: access.role,
    collaboration: access.collaboration,
    opportunity,
    creator,
    submissions,
    performance,
    earnings,
    earningsSummary: ugcEarningsSummary(earnings),
    sampleLogisticsConfigured: isSensitiveDataEncryptionConfigured(),
    sampleShipments: sampleShipments.map((shipment) => ({
      id: shipment.id,
      direction: shipment.direction,
      items: shipment.items,
      recipientUserId: shipment.recipientUserId,
      addressSummary: shipment.addressSummary,
      recipientAddress: decryptSensitiveJson<Record<string, string>>(
        shipment.recipientAddressCiphertext,
      ),
      status: shipment.status,
      carrier: shipment.carrier,
      trackingNumber: shipment.trackingNumberCiphertext
        ? decryptSensitiveValue(shipment.trackingNumberCiphertext)
        : "",
      statusHistory: shipment.statusHistory,
      shippedAt: shipment.shippedAt,
      deliveredAt: shipment.deliveredAt,
      returnedAt: shipment.returnedAt,
      createdAt: shipment.createdAt,
      updatedAt: shipment.updatedAt,
    })),
  };
}

export function registerUgcRoutes(app: Express) {
  app.get(
    "/api/ugc/discover",
    attachUser,
    safe(async (req, res) => {
      try {
        const query =
          typeof req.query.q === "string"
            ? req.query.q.trim().toLowerCase().slice(0, 120)
            : "";
        const category =
          typeof req.query.category === "string"
            ? req.query.category.trim().toLowerCase().slice(0, 80)
            : "";
        const compensation =
          typeof req.query.compensation === "string"
            ? req.query.compensation.trim().toLowerCase().slice(0, 30)
            : "";
        const rows = await db
          .select({
            opportunity: ugcOpportunities,
            brand: {
              id: businesses.id,
              name: businesses.name,
              handle: businesses.handle,
              logoUrl: businesses.logoUrl,
            },
          })
          .from(ugcOpportunities)
          .innerJoin(businesses, eq(businesses.id, ugcOpportunities.businessId))
          .where(eq(ugcOpportunities.status, "open"))
          .orderBy(desc(ugcOpportunities.publishedAt))
          .limit(200);
        const opportunityIds = rows.map((row) => row.opportunity.id);
        const viewerApplications = opportunityIds.length
          ? await db
              .select({
                opportunityId: ugcApplications.opportunityId,
                id: ugcApplications.id,
                status: ugcApplications.status,
              })
              .from(ugcApplications)
              .where(
                and(
                  inArray(ugcApplications.opportunityId, opportunityIds),
                  eq(ugcApplications.creatorUserId, req.dbUser!.id),
                ),
              )
          : [];
        const byOpportunity = new Map(
          viewerApplications.map((application) => [
            application.opportunityId,
            application,
          ]),
        );
        const now = Date.now();
        return res.json(
          rows
            .filter(({ opportunity, brand }) => {
              if (
                opportunity.applicationDeadline &&
                opportunity.applicationDeadline.getTime() < now
              )
                return false;
              if (category && opportunity.category.toLowerCase() !== category)
                return false;
              if (
                compensation &&
                opportunity.compensationModel !== compensation
              )
                return false;
              if (
                query &&
                !`${opportunity.title} ${opportunity.description} ${opportunity.category} ${brand.name}`
                  .toLowerCase()
                  .includes(query)
              )
                return false;
              return true;
            })
            .map((row) => ({
              ...row,
              viewerApplication: byOpportunity.get(row.opportunity.id) ?? null,
            })),
        );
      } catch (error) {
        console.error("Unable to discover UGC opportunities", error);
        return res
          .status(500)
          .json({ message: "Unable to discover UGC opportunities" });
      }
    }),
  );

  app.get(
    "/api/ugc/profile",
    attachUser,
    safe(async (req, res) => {
      noStore(res);
      const [profile] = await db
        .select()
        .from(ugcCreatorProfiles)
        .where(eq(ugcCreatorProfiles.userId, req.dbUser!.id))
        .limit(1);
      return res.json(profile ?? null);
    }),
  );

  app.put(
    "/api/ugc/profile",
    attachUser,
    safe(async (req, res) => {
      const parsed = ugcCreatorProfileInputSchema.safeParse(req.body);
      if (!parsed.success) return invalid(res, parsed.error);
      const [profile] = await db
        .insert(ugcCreatorProfiles)
        .values({ userId: req.dbUser!.id, ...parsed.data })
        .onConflictDoUpdate({
          target: ugcCreatorProfiles.userId,
          set: { ...parsed.data, updatedAt: new Date() },
        })
        .returning();
      return res.json(profile);
    }),
  );

  app.get(
    "/api/ugc/creators/:userId",
    safe(async (req, res) => {
      const creatorUserId = Number(req.params.userId);
      if (!Number.isInteger(creatorUserId) || creatorUserId <= 0)
        return res.status(400).json({ message: "Invalid creator" });
      const [[profile], [creator], portfolio] = await Promise.all([
        db
          .select()
          .from(ugcCreatorProfiles)
          .where(eq(ugcCreatorProfiles.userId, creatorUserId))
          .limit(1),
        db
          .select({
            id: users.id,
            username: users.username,
            displayName: users.displayName,
            profileImageUrl: users.profileImageUrl,
            bio: users.bio,
          })
          .from(users)
          .where(eq(users.id, creatorUserId))
          .limit(1),
        db
          .select({
            item: ugcPortfolioItems,
            asset: {
              id: assets.id,
              kind: assets.kind,
              publicUrl: assets.publicUrl,
              mimeType: assets.mimeType,
            },
          })
          .from(ugcPortfolioItems)
          .innerJoin(assets, eq(assets.id, ugcPortfolioItems.assetId))
          .where(
            and(
              eq(ugcPortfolioItems.creatorUserId, creatorUserId),
              eq(ugcPortfolioItems.public, true),
              eq(assets.visibility, "public"),
              eq(assets.status, "ready"),
            ),
          )
          .orderBy(desc(ugcPortfolioItems.updatedAt)),
      ]);
      if (!profile || !creator || !profile.portfolioPublic)
        return res.status(404).json({ message: "Creator portfolio not found" });
      return res.json({ creator, profile, portfolio });
    }),
  );

  app.get(
    "/api/ugc/portfolio",
    attachUser,
    safe(async (req, res) => {
      const items = await db
        .select({
          item: ugcPortfolioItems,
          asset: {
            id: assets.id,
            kind: assets.kind,
            publicUrl: assets.publicUrl,
            mimeType: assets.mimeType,
            originalFilename: assets.originalFilename,
            visibility: assets.visibility,
          },
        })
        .from(ugcPortfolioItems)
        .innerJoin(assets, eq(assets.id, ugcPortfolioItems.assetId))
        .where(eq(ugcPortfolioItems.creatorUserId, req.dbUser!.id))
        .orderBy(desc(ugcPortfolioItems.updatedAt));
      return res.json(items);
    }),
  );

  app.post(
    "/api/ugc/portfolio",
    attachUser,
    safe(async (req, res) => {
      const parsed = ugcPortfolioInputSchema.safeParse(req.body);
      if (!parsed.success) return invalid(res, parsed.error);
      const asset = await assetOwnedBy(req.dbUser!.id, parsed.data.assetId);
      if (!asset)
        return res.status(404).json({ message: "Portfolio asset not found" });
      if (parsed.data.public && asset.visibility !== "public")
        return res
          .status(400)
          .json({ message: "Public portfolio work must use a public asset" });
      // Portfolio metrics are trust-sensitive. Creator-authored entries start at
      // zero and only gain verified results through brand/provider evidence.
      const { performance: _unverifiedPerformance, ...portfolio } = parsed.data;
      const [item] = await db
        .insert(ugcPortfolioItems)
        .values({
          creatorUserId: req.dbUser!.id,
          ...portfolio,
          performance: {
            impressions: 0,
            conversions: 0,
            attributedRevenueCents: 0,
          },
        })
        .returning();
      return res.status(201).json(item);
    }),
  );

  app.delete(
    "/api/ugc/portfolio/:id",
    attachUser,
    safe(async (req, res) => {
      if (!idSchema.safeParse(req.params.id).success)
        return res.status(400).json({ message: "Invalid portfolio item" });
      const deleted = await db
        .delete(ugcPortfolioItems)
        .where(
          and(
            eq(ugcPortfolioItems.id, req.params.id),
            eq(ugcPortfolioItems.creatorUserId, req.dbUser!.id),
          ),
        )
        .returning({ id: ugcPortfolioItems.id });
      if (!deleted.length)
        return res.status(404).json({ message: "Portfolio item not found" });
      return res.status(204).end();
    }),
  );

  app.get(
    "/api/ugc/opportunities",
    attachUser,
    safe(async (req, res) => {
      const memberships = await db
        .select({ businessId: businessMembers.businessId })
        .from(businessMembers)
        .where(
          and(
            eq(businessMembers.userId, req.dbUser!.id),
            inArray(businessMembers.role, UGC_MANAGER_ROLES),
          ),
        );
      if (!memberships.length) return res.json([]);
      const rows = await db
        .select({
          opportunity: ugcOpportunities,
          business: { name: businesses.name, handle: businesses.handle },
          applicationCount: sql<number>`count(${ugcApplications.id})::int`,
        })
        .from(ugcOpportunities)
        .innerJoin(businesses, eq(businesses.id, ugcOpportunities.businessId))
        .leftJoin(
          ugcApplications,
          eq(ugcApplications.opportunityId, ugcOpportunities.id),
        )
        .where(
          inArray(
            ugcOpportunities.businessId,
            memberships.map((item) => item.businessId),
          ),
        )
        .groupBy(ugcOpportunities.id, businesses.id)
        .orderBy(desc(ugcOpportunities.updatedAt));
      return res.json(rows);
    }),
  );

  app.post(
    "/api/ugc/opportunities",
    attachUser,
    safe(async (req, res) => {
      const parsed = ugcOpportunityInputSchema.safeParse(req.body);
      if (!parsed.success) return invalid(res, parsed.error);
      try {
        validateUgcCompensation(parsed.data);
      } catch (error) {
        return res
          .status(400)
          .json({
            message:
              error instanceof Error ? error.message : "Invalid compensation",
          });
      }
      const business = parsed.data.businessId
        ? null
        : await ensureDefaultBusiness(req.dbUser!);
      const businessId = parsed.data.businessId ?? business!.id;
      if (!(await userCanManageBusiness(req.dbUser!.id, businessId)))
        return res
          .status(403)
          .json({ message: "You do not have access to that business" });
      if (parsed.data.campaignId) {
        const [campaign] = await db
          .select({ businessId: campaigns.businessId })
          .from(campaigns)
          .where(eq(campaigns.id, parsed.data.campaignId))
          .limit(1);
        if (!campaign || campaign.businessId !== businessId)
          return res
            .status(400)
            .json({ message: "Campaign must belong to the same business" });
      }
      const { businessId: _ignored, ...data } = parsed.data;
      const [opportunity] = await db
        .insert(ugcOpportunities)
        .values({
          ...data,
          businessId,
          ownerUserId: req.dbUser!.id,
          status: "draft",
        })
        .returning();
      return res.status(201).json(opportunity);
    }),
  );

  app.get(
    "/api/ugc/opportunities/:id",
    attachUser,
    safe(async (req, res) => {
      if (!idSchema.safeParse(req.params.id).success)
        return res.status(400).json({ message: "Invalid opportunity" });
      const row = await opportunityWithBrand(req.params.id);
      if (!row)
        return res.status(404).json({ message: "Opportunity not found" });
      const manages = await userCanManageBusiness(
        req.dbUser!.id,
        row.opportunity.businessId,
      );
      if (row.opportunity.status !== "open" && !manages) {
        const [application] = await db
          .select({ id: ugcApplications.id })
          .from(ugcApplications)
          .where(
            and(
              eq(ugcApplications.opportunityId, row.opportunity.id),
              eq(ugcApplications.creatorUserId, req.dbUser!.id),
            ),
          )
          .limit(1);
        if (!application)
          return res.status(404).json({ message: "Opportunity not found" });
      }
      return res.json({ ...row, role: manages ? "brand" : "creator" });
    }),
  );

  app.patch(
    "/api/ugc/opportunities/:id",
    attachUser,
    safe(async (req, res) => {
      const existing = await opportunityWithBrand(req.params.id);
      if (!existing)
        return res.status(404).json({ message: "Opportunity not found" });
      if (
        !(await userCanManageBusiness(
          req.dbUser!.id,
          existing.opportunity.businessId,
        ))
      )
        return res
          .status(403)
          .json({ message: "You do not have access to this opportunity" });
      if (!["draft", "paused"].includes(existing.opportunity.status))
        return res
          .status(409)
          .json({ message: "Only draft or paused briefs can be edited" });
      const parsed = ugcOpportunityInputSchema
        .partial()
        .omit({ businessId: true })
        .safeParse(req.body);
      if (!parsed.success) return invalid(res, parsed.error);
      const merged = {
        compensationModel:
          parsed.data.compensationModel ??
          (existing.opportunity.compensationModel as
            "fixed" | "commission" | "hybrid" | "gifted"),
        fixedFeeCents:
          parsed.data.fixedFeeCents ?? existing.opportunity.fixedFeeCents,
        commissionBps:
          parsed.data.commissionBps ?? existing.opportunity.commissionBps,
      };
      try {
        validateUgcCompensation(merged);
      } catch (error) {
        return res
          .status(400)
          .json({
            message:
              error instanceof Error ? error.message : "Invalid compensation",
          });
      }
      const [updated] = await db
        .update(ugcOpportunities)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(ugcOpportunities.id, existing.opportunity.id))
        .returning();
      return res.json(updated);
    }),
  );

  app.post(
    "/api/ugc/opportunities/:id/publish",
    attachUser,
    safe(async (req, res) => {
      const row = await opportunityWithBrand(req.params.id);
      if (!row)
        return res.status(404).json({ message: "Opportunity not found" });
      if (
        !(await userCanManageBusiness(
          req.dbUser!.id,
          row.opportunity.businessId,
        ))
      )
        return res
          .status(403)
          .json({ message: "You do not have access to this opportunity" });
      if (!["draft", "paused"].includes(row.opportunity.status))
        return res
          .status(409)
          .json({
            message: "This brief cannot be published from its current status",
          });
      const now = new Date();
      const [updated] = await db
        .update(ugcOpportunities)
        .set({
          status: "open",
          publishedAt: row.opportunity.publishedAt ?? now,
          updatedAt: now,
        })
        .where(eq(ugcOpportunities.id, row.opportunity.id))
        .returning();
      void emitProjectionEvent({
        aggregateType: "ugc_opportunity",
        aggregateId: updated.id,
        eventType: "ugc_opportunity.published",
        actorUserId: req.dbUser!.id,
        payload: { businessId: updated.businessId, category: updated.category },
        idempotencyKey: `ugc_opportunity.published:${updated.id}:${updated.publishedAt?.toISOString()}`,
      }).catch((error) => console.error("Unable to project UGC brief", error));
      return res.json(updated);
    }),
  );

  app.post(
    "/api/ugc/opportunities/:id/close",
    attachUser,
    safe(async (req, res) => {
      const row = await opportunityWithBrand(req.params.id);
      if (!row)
        return res.status(404).json({ message: "Opportunity not found" });
      if (
        !(await userCanManageBusiness(
          req.dbUser!.id,
          row.opportunity.businessId,
        ))
      )
        return res
          .status(403)
          .json({ message: "You do not have access to this opportunity" });
      if (!["open", "paused"].includes(row.opportunity.status))
        return res.status(409).json({ message: "This brief is not open" });
      const [updated] = await db
        .update(ugcOpportunities)
        .set({ status: "closed", updatedAt: new Date() })
        .where(eq(ugcOpportunities.id, row.opportunity.id))
        .returning();
      return res.json(updated);
    }),
  );

  app.post(
    "/api/ugc/opportunities/:id/applications",
    attachUser,
    safe(async (req, res) => {
      const parsed = ugcApplicationInputSchema.safeParse(req.body);
      if (!parsed.success) return invalid(res, parsed.error);
      const row = await opportunityWithBrand(req.params.id);
      if (!row || row.opportunity.status !== "open")
        return res.status(404).json({ message: "Open opportunity not found" });
      if (
        row.opportunity.applicationDeadline &&
        row.opportunity.applicationDeadline.getTime() < Date.now()
      )
        return res.status(409).json({ message: "Applications are closed" });
      if (
        await userCanManageBusiness(req.dbUser!.id, row.opportunity.businessId)
      )
        return res
          .status(409)
          .json({ message: "A brand team cannot apply to its own brief" });
      const [profile] = await db
        .select()
        .from(ugcCreatorProfiles)
        .where(eq(ugcCreatorProfiles.userId, req.dbUser!.id))
        .limit(1);
      if (!profile)
        return res
          .status(409)
          .json({
            message: "Complete your UGC creator profile before applying",
          });
      if (
        row.opportunity.eligibility.requiresPortfolio &&
        parsed.data.portfolioItemIds.length === 0
      )
        return res
          .status(409)
          .json({ message: "This opportunity requires portfolio work" });
      if (parsed.data.portfolioItemIds.length) {
        const selected = await db
          .select({ id: ugcPortfolioItems.id })
          .from(ugcPortfolioItems)
          .where(
            and(
              inArray(ugcPortfolioItems.id, parsed.data.portfolioItemIds),
              eq(ugcPortfolioItems.creatorUserId, req.dbUser!.id),
            ),
          );
        if (selected.length !== new Set(parsed.data.portfolioItemIds).size)
          return res
            .status(400)
            .json({ message: "Portfolio selection is invalid" });
      }
      if (
        parsed.data.previewAssetId &&
        !(await assetOwnedBy(req.dbUser!.id, parsed.data.previewAssetId))
      )
        return res.status(404).json({ message: "Preview asset not found" });
      try {
        const [application] = await db
          .insert(ugcApplications)
          .values({
            opportunityId: row.opportunity.id,
            creatorUserId: req.dbUser!.id,
            ...parsed.data,
          })
          .returning();
        await notify(
          row.opportunity.ownerUserId,
          "ugc_application",
          `${req.dbUser!.displayName} applied to ${row.opportunity.title}`,
          `/ugc?tab=brand&opportunity=${row.opportunity.id}`,
          `application:${application.id}`,
          req.dbUser!.id,
        );
        return res.status(201).json(application);
      } catch (error: any) {
        if (error?.code === "23505")
          return res
            .status(409)
            .json({ message: "You already applied to this opportunity" });
        throw error;
      }
    }),
  );

  app.get(
    "/api/ugc/applications",
    attachUser,
    safe(async (req, res) => {
      const rows = await db
        .select({
          application: ugcApplications,
          opportunity: ugcOpportunities,
          brand: { name: businesses.name, handle: businesses.handle },
        })
        .from(ugcApplications)
        .innerJoin(
          ugcOpportunities,
          eq(ugcOpportunities.id, ugcApplications.opportunityId),
        )
        .innerJoin(businesses, eq(businesses.id, ugcOpportunities.businessId))
        .where(eq(ugcApplications.creatorUserId, req.dbUser!.id))
        .orderBy(desc(ugcApplications.updatedAt));
      return res.json(rows);
    }),
  );

  app.post(
    "/api/ugc/applications/:id/withdraw",
    attachUser,
    safe(async (req, res) => {
      const [application] = await db
        .select()
        .from(ugcApplications)
        .where(
          and(
            eq(ugcApplications.id, req.params.id),
            eq(ugcApplications.creatorUserId, req.dbUser!.id),
          ),
        )
        .limit(1);
      if (!application)
        return res.status(404).json({ message: "Application not found" });
      if (!canTransitionUgcApplication(application.status, "withdrawn"))
        return res
          .status(409)
          .json({ message: "This application cannot be withdrawn" });
      const [updated] = await db
        .update(ugcApplications)
        .set({ status: "withdrawn", updatedAt: new Date() })
        .where(eq(ugcApplications.id, application.id))
        .returning();
      return res.json(updated);
    }),
  );

  app.get(
    "/api/ugc/opportunities/:id/applications",
    attachUser,
    safe(async (req, res) => {
      const row = await opportunityWithBrand(req.params.id);
      if (!row)
        return res.status(404).json({ message: "Opportunity not found" });
      if (
        !(await userCanManageBusiness(
          req.dbUser!.id,
          row.opportunity.businessId,
        ))
      )
        return res
          .status(403)
          .json({ message: "You do not have access to these applications" });
      const applications = await db
        .select({
          application: ugcApplications,
          creator: {
            id: users.id,
            username: users.username,
            displayName: users.displayName,
            profileImageUrl: users.profileImageUrl,
          },
          profile: ugcCreatorProfiles,
        })
        .from(ugcApplications)
        .innerJoin(users, eq(users.id, ugcApplications.creatorUserId))
        .leftJoin(
          ugcCreatorProfiles,
          eq(ugcCreatorProfiles.userId, ugcApplications.creatorUserId),
        )
        .where(eq(ugcApplications.opportunityId, row.opportunity.id))
        .orderBy(desc(ugcApplications.updatedAt));
      return res.json(applications);
    }),
  );

  app.patch(
    "/api/ugc/applications/:id",
    attachUser,
    safe(async (req, res) => {
      const parsed = reviewApplicationSchema.safeParse(req.body);
      if (!parsed.success) return invalid(res, parsed.error);
      const [application] = await db
        .select()
        .from(ugcApplications)
        .where(eq(ugcApplications.id, req.params.id))
        .limit(1);
      if (!application)
        return res.status(404).json({ message: "Application not found" });
      const row = await opportunityWithBrand(application.opportunityId);
      if (
        !row ||
        !(await userCanManageBusiness(
          req.dbUser!.id,
          row.opportunity.businessId,
        ))
      )
        return res
          .status(403)
          .json({ message: "You do not have access to this application" });
      if (!canTransitionUgcApplication(application.status, parsed.data.status))
        return res
          .status(409)
          .json({ message: "Invalid application transition" });
      const [updated] = await db
        .update(ugcApplications)
        .set({ status: parsed.data.status, updatedAt: new Date() })
        .where(eq(ugcApplications.id, application.id))
        .returning();
      await notify(
        application.creatorUserId,
        "ugc_application",
        `Your application for ${row.opportunity.title} was ${parsed.data.status}`,
        "/ugc?tab=work",
        `application:${application.id}:${parsed.data.status}`,
        req.dbUser!.id,
      );
      return res.json(updated);
    }),
  );

  app.post(
    "/api/ugc/applications/:id/accept",
    attachUser,
    safe(async (req, res) => {
      const [application] = await db
        .select()
        .from(ugcApplications)
        .where(eq(ugcApplications.id, req.params.id))
        .limit(1);
      if (!application)
        return res.status(404).json({ message: "Application not found" });
      const row = await opportunityWithBrand(application.opportunityId);
      if (
        !row ||
        !(await userCanManageBusiness(
          req.dbUser!.id,
          row.opportunity.businessId,
        ))
      )
        return res
          .status(403)
          .json({ message: "You do not have access to this application" });
      if (!canTransitionUgcApplication(application.status, "accepted"))
        return res
          .status(409)
          .json({ message: "This application cannot be accepted" });
      const collaboration = await db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(ugcCollaborations)
          .where(eq(ugcCollaborations.applicationId, application.id))
          .limit(1);
        if (existing) return existing;
        const [conversation] = await tx
          .insert(conversations)
          .values({
            isGroup: true,
            name: `${row.opportunity.title} · UGC workroom`,
          })
          .returning();
        const managers = await tx
          .select({ userId: businessMembers.userId })
          .from(businessMembers)
          .where(
            and(
              eq(businessMembers.businessId, row.opportunity.businessId),
              inArray(businessMembers.role, UGC_MANAGER_ROLES),
            ),
          );
        const participantIds = new Set([
          row.opportunity.ownerUserId,
          req.dbUser!.id,
          application.creatorUserId,
          ...managers.map((manager) => manager.userId),
        ]);
        await tx
          .insert(conversationParticipants)
          .values(
            Array.from(participantIds).map((userId) => ({
              conversationId: conversation.id,
              userId,
              isAdmin: userId !== application.creatorUserId,
            })),
          )
          .onConflictDoNothing();
        const [created] = await tx
          .insert(ugcCollaborations)
          .values({
            opportunityId: row.opportunity.id,
            applicationId: application.id,
            businessId: row.opportunity.businessId,
            creatorUserId: application.creatorUserId,
            conversationId: conversation.id,
            compensation: {
              model: row.opportunity.compensationModel,
              fixedFeeCents: row.opportunity.fixedFeeCents,
              commissionBps: row.opportunity.commissionBps,
              currency: row.opportunity.currency,
            },
            usageRights: row.opportunity.usageRights,
            revisionLimit: row.opportunity.revisionLimit,
          })
          .returning();
        await tx
          .update(ugcApplications)
          .set({ status: "accepted", updatedAt: new Date() })
          .where(eq(ugcApplications.id, application.id));
        return created;
      });
      await notify(
        application.creatorUserId,
        "ugc_collaboration",
        `You were selected for ${row.opportunity.title}`,
        `/ugc?tab=work&workroom=${collaboration.id}`,
        `collaboration:${collaboration.id}`,
        req.dbUser!.id,
      );
      void emitProjectionEvent({
        aggregateType: "ugc_collaboration",
        aggregateId: collaboration.id,
        eventType: "ugc_collaboration.accepted",
        actorUserId: req.dbUser!.id,
        payload: {
          businessId: collaboration.businessId,
          creatorUserId: collaboration.creatorUserId,
          opportunityId: collaboration.opportunityId,
        },
        idempotencyKey: `ugc_collaboration.accepted:${collaboration.id}`,
      }).catch((error) =>
        console.error("Unable to project UGC collaboration", error),
      );
      return res.status(201).json(collaboration);
    }),
  );

  app.get(
    "/api/ugc/workrooms",
    attachUser,
    safe(async (req, res) => {
      const memberships = await db
        .select({ businessId: businessMembers.businessId })
        .from(businessMembers)
        .where(
          and(
            eq(businessMembers.userId, req.dbUser!.id),
            inArray(businessMembers.role, UGC_MANAGER_ROLES),
          ),
        );
      const businessIds = memberships.map((item) => item.businessId);
      const condition = businessIds.length
        ? or(
            eq(ugcCollaborations.creatorUserId, req.dbUser!.id),
            inArray(ugcCollaborations.businessId, businessIds),
          )
        : eq(ugcCollaborations.creatorUserId, req.dbUser!.id);
      const rows = await db
        .select({
          collaboration: ugcCollaborations,
          opportunity: ugcOpportunities,
          brand: { name: businesses.name, handle: businesses.handle },
          creator: {
            id: users.id,
            displayName: users.displayName,
            username: users.username,
            profileImageUrl: users.profileImageUrl,
          },
        })
        .from(ugcCollaborations)
        .innerJoin(
          ugcOpportunities,
          eq(ugcOpportunities.id, ugcCollaborations.opportunityId),
        )
        .innerJoin(businesses, eq(businesses.id, ugcCollaborations.businessId))
        .innerJoin(users, eq(users.id, ugcCollaborations.creatorUserId))
        .where(condition)
        .orderBy(desc(ugcCollaborations.updatedAt));
      return res.json(rows);
    }),
  );

  app.get(
    "/api/ugc/workrooms/:id",
    attachUser,
    safe(async (req, res) => {
      noStore(res);
      const workroom = await detailedWorkroom(req.dbUser!.id, req.params.id);
      if (!workroom)
        return res.status(404).json({ message: "UGC workroom not found" });
      return res.json(workroom);
    }),
  );

  app.post(
    "/api/ugc/workrooms/:id/submissions",
    attachUser,
    safe(async (req, res) => {
      const parsed = ugcSubmissionInputSchema.safeParse(req.body);
      if (!parsed.success) return invalid(res, parsed.error);
      const access = await collaborationAccess(req.dbUser!.id, req.params.id);
      if (!access)
        return res.status(404).json({ message: "UGC workroom not found" });
      if (access.role !== "creator")
        return res
          .status(403)
          .json({ message: "Only the selected creator can submit work" });
      if (
        !["in_progress", "revision_requested"].includes(
          access.collaboration.status,
        )
      )
        return res
          .status(409)
          .json({ message: "This workroom is not accepting submissions" });
      const asset = await assetOwnedBy(req.dbUser!.id, parsed.data.assetId);
      if (!asset)
        return res.status(404).json({ message: "Submission asset not found" });
      if (asset.visibility !== "private")
        return res
          .status(400)
          .json({ message: "UGC review submissions must use private assets" });
      const submission = await db.transaction(async (tx) => {
        const [version] = await tx
          .select({
            value: sql<number>`coalesce(max(${ugcSubmissions.version}), 0)::int`,
          })
          .from(ugcSubmissions)
          .where(eq(ugcSubmissions.collaborationId, access.collaboration.id));
        const [created] = await tx
          .insert(ugcSubmissions)
          .values({
            collaborationId: access.collaboration.id,
            creatorUserId: req.dbUser!.id,
            version: Number(version?.value ?? 0) + 1,
            ...parsed.data,
          })
          .returning();
        await tx
          .update(ugcCollaborations)
          .set({ status: "submitted", updatedAt: new Date() })
          .where(eq(ugcCollaborations.id, access.collaboration.id));
        return created;
      });
      const opportunity = await opportunityWithBrand(
        access.collaboration.opportunityId,
      );
      if (opportunity)
        await notify(
          opportunity.opportunity.ownerUserId,
          "ugc_submission",
          `${req.dbUser!.displayName} submitted version ${submission.version} for ${opportunity.opportunity.title}`,
          `/ugc?tab=work&workroom=${access.collaboration.id}`,
          `submission:${submission.id}`,
          req.dbUser!.id,
        );
      return res.status(201).json(submission);
    }),
  );

  app.post(
    "/api/ugc/submissions/:id/review",
    attachUser,
    safe(async (req, res) => {
      const parsed = reviewSubmissionSchema.safeParse(req.body);
      if (!parsed.success) return invalid(res, parsed.error);
      const [submission] = await db
        .select()
        .from(ugcSubmissions)
        .where(eq(ugcSubmissions.id, req.params.id))
        .limit(1);
      if (!submission)
        return res.status(404).json({ message: "Submission not found" });
      const access = await collaborationAccess(
        req.dbUser!.id,
        submission.collaborationId,
      );
      if (!access || access.role !== "brand")
        return res
          .status(403)
          .json({ message: "Only the brand team can review this submission" });
      if (
        submission.status !== "submitted" ||
        access.collaboration.status !== "submitted"
      )
        return res
          .status(409)
          .json({ message: "This submission is not awaiting review" });
      const priorRevisions = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(ugcSubmissions)
        .where(
          and(
            eq(ugcSubmissions.collaborationId, submission.collaborationId),
            eq(ugcSubmissions.status, "revision_requested"),
          ),
        );
      if (
        parsed.data.decision === "revision_requested" &&
        Number(priorRevisions[0]?.count ?? 0) >=
          access.collaboration.revisionLimit
      )
        return res
          .status(409)
          .json({ message: "The agreed revision limit has been reached" });
      const result = await db.transaction(async (tx) => {
        const now = new Date();
        const [updated] = await tx
          .update(ugcSubmissions)
          .set({
            status: parsed.data.decision,
            feedback: parsed.data.feedback || null,
            reviewedByUserId: req.dbUser!.id,
            reviewedAt: now,
            updatedAt: now,
          })
          .where(eq(ugcSubmissions.id, submission.id))
          .returning();
        const collaborationStatus =
          parsed.data.decision === "approved"
            ? "approved"
            : parsed.data.decision === "revision_requested"
              ? "revision_requested"
              : "cancelled";
        await tx
          .update(ugcCollaborations)
          .set({
            status: collaborationStatus,
            approvedAt: parsed.data.decision === "approved" ? now : null,
            updatedAt: now,
          })
          .where(eq(ugcCollaborations.id, access.collaboration.id));
        if (
          parsed.data.decision === "approved" &&
          access.collaboration.compensation.fixedFeeCents > 0
        ) {
          await tx
            .insert(ugcEarningsLedger)
            .values({
              collaborationId: access.collaboration.id,
              creatorUserId: access.collaboration.creatorUserId,
              kind: "fixed_fee",
              sourceType: "submission",
              sourceId: submission.id,
              amountCents: access.collaboration.compensation.fixedFeeCents,
              currency: access.collaboration.compensation.currency,
              status: "approved",
            })
            .onConflictDoNothing();
        }
        return updated;
      });
      const opportunity = await opportunityWithBrand(
        access.collaboration.opportunityId,
      );
      await notify(
        access.collaboration.creatorUserId,
        "ugc_review",
        `${opportunity?.opportunity.title ?? "Your UGC work"}: ${parsed.data.decision.replaceAll("_", " ")}`,
        `/ugc?tab=work&workroom=${access.collaboration.id}`,
        `submission:${submission.id}:${parsed.data.decision}`,
        req.dbUser!.id,
      );
      return res.json(result);
    }),
  );

  app.get(
    "/api/ugc/submissions/:id/access",
    attachUser,
    safe(async (req, res) => {
      noStore(res);
      const [row] = await db
        .select({ submission: ugcSubmissions, asset: assets })
        .from(ugcSubmissions)
        .innerJoin(assets, eq(assets.id, ugcSubmissions.assetId))
        .where(eq(ugcSubmissions.id, req.params.id))
        .limit(1);
      if (!row)
        return res.status(404).json({ message: "Submission not found" });
      if (
        !(await collaborationAccess(
          req.dbUser!.id,
          row.submission.collaborationId,
        ))
      )
        return res
          .status(403)
          .json({ message: "You do not have access to this submission" });
      if (row.asset.visibility === "public")
        return res.json({ url: row.asset.publicUrl, expiresAt: null });
      if (
        row.asset.storageProvider === "local" &&
        process.env.NODE_ENV !== "production"
      )
        return res.json({
          url: `/api/ugc/submissions/${row.submission.id}/stream`,
          expiresAt: null,
        });
      return res.json(await createPrivateAssetReadUrl(row.asset.storageKey));
    }),
  );

  app.get(
    "/api/ugc/submissions/:id/stream",
    attachUser,
    apiRateLimiter({ max: 240 }),
    safe(async (req, res) => {
      let temp: string | null = null;
      try {
        noStore(res);
        const [row] = await db
          .select({ submission: ugcSubmissions, asset: assets })
          .from(ugcSubmissions)
          .innerJoin(assets, eq(assets.id, ugcSubmissions.assetId))
          .where(eq(ugcSubmissions.id, req.params.id))
          .limit(1);
        if (!row || row.asset.visibility !== "private")
          return res.status(404).json({ message: "Submission not found" });
        if (
          !(await collaborationAccess(
            req.dbUser!.id,
            row.submission.collaborationId,
          ))
        )
          return res
            .status(403)
            .json({ message: "You do not have access to this submission" });
        temp = await fs.mkdtemp(
          path.join(os.tmpdir(), "creativesos-ugc-submission-"),
        );
        const outputPath = path.join(
          temp,
          row.asset.originalFilename?.replace(/[^A-Za-z0-9._-]/g, "-") ||
            "submission.bin",
        );
        await materializePrivateAsset(row.asset.storageKey, outputPath);
        res.type(row.asset.mimeType ?? "application/octet-stream");
        res.setHeader(
          "Content-Disposition",
          `inline; filename="${path.basename(outputPath)}"`,
        );
        return res.sendFile(outputPath, { acceptRanges: true }, (error) => {
          if (temp) void fs.rm(temp, { recursive: true, force: true });
          if (error && !res.headersSent) res.status(500).end();
        });
      } catch (error) {
        if (temp)
          await fs
            .rm(temp, { recursive: true, force: true })
            .catch(() => undefined);
        console.error("Unable to stream UGC submission", error);
        if (!res.headersSent)
          return res
            .status(500)
            .json({ message: "Unable to stream submission" });
      }
    }),
  );

  app.post(
    "/api/ugc/workrooms/:id/sample-shipments",
    attachUser,
    safe(async (req, res) => {
      const parsed = ugcSampleRequestSchema.safeParse(req.body);
      if (!parsed.success) return invalid(res, parsed.error);
      const access = await collaborationAccess(req.dbUser!.id, req.params.id);
      if (!access)
        return res.status(404).json({ message: "UGC workroom not found" });
      if (access.role !== "creator")
        return res
          .status(403)
          .json({
            message:
              "Only the selected creator can provide a sample delivery address",
          });
      if (!isSensitiveDataEncryptionConfigured())
        return res
          .status(503)
          .json({ message: "Private sample logistics are not configured" });
      const opportunity = await opportunityWithBrand(
        access.collaboration.opportunityId,
      );
      if (!opportunity?.opportunity.sampleTerms.required)
        return res
          .status(409)
          .json({
            message: "This collaboration does not include a product sample",
          });
      const [openShipment] = await db
        .select({ id: ugcSampleShipments.id })
        .from(ugcSampleShipments)
        .where(
          and(
            eq(ugcSampleShipments.collaborationId, access.collaboration.id),
            inArray(ugcSampleShipments.status, [
              "requested",
              "approved",
              "shipped",
              "delivered",
              "return_requested",
              "issue",
            ]),
          ),
        )
        .limit(1);
      if (openShipment)
        return res
          .status(409)
          .json({
            message: "This workroom already has an active sample shipment",
          });
      const now = new Date();
      const address = parsed.data;
      const [shipment] = await db
        .insert(ugcSampleShipments)
        .values({
          collaborationId: access.collaboration.id,
          requestedByUserId: req.dbUser!.id,
          recipientUserId: req.dbUser!.id,
          direction: "brand_to_creator",
          items: opportunity.opportunity.sampleTerms.items,
          recipientAddressCiphertext: encryptSensitiveJson(address),
          addressSummary: {
            city: address.city,
            region: address.region,
            country: address.country,
          },
          status: "requested",
          statusHistory: [
            {
              status: "requested",
              actorUserId: req.dbUser!.id,
              at: now.toISOString(),
              note: "Creator requested the agreed product sample.",
            },
          ],
        })
        .returning();
      await notify(
        opportunity.opportunity.ownerUserId,
        "ugc_sample",
        `${req.dbUser!.displayName} requested the sample for ${opportunity.opportunity.title}`,
        `/ugc?tab=work&workroom=${access.collaboration.id}`,
        `sample:${shipment.id}:requested`,
        req.dbUser!.id,
      );
      void emitProjectionEvent({
        aggregateType: "ugc_sample_shipment",
        aggregateId: shipment.id,
        eventType: "ugc_sample.requested",
        actorUserId: req.dbUser!.id,
        payload: {
          businessId: access.collaboration.businessId,
          collaborationId: access.collaboration.id,
          itemCount: shipment.items.reduce(
            (total, item) => total + item.quantity,
            0,
          ),
          destinationCountry: address.country,
        },
        idempotencyKey: `ugc_sample.requested:${shipment.id}`,
      }).catch((error) =>
        console.error("Unable to project UGC sample request", error),
      );
      return res.status(201).json({ id: shipment.id, status: shipment.status });
    }),
  );

  app.patch(
    "/api/ugc/sample-shipments/:id",
    attachUser,
    safe(async (req, res) => {
      const parsed = ugcSampleShipmentUpdateSchema.safeParse(req.body);
      if (!parsed.success) return invalid(res, parsed.error);
      const [shipment] = await db
        .select()
        .from(ugcSampleShipments)
        .where(eq(ugcSampleShipments.id, req.params.id))
        .limit(1);
      if (!shipment)
        return res.status(404).json({ message: "Sample shipment not found" });
      const access = await collaborationAccess(
        req.dbUser!.id,
        shipment.collaborationId,
      );
      if (!access)
        return res.status(404).json({ message: "Sample shipment not found" });
      if (!canTransitionUgcSampleShipment(shipment.status, parsed.data.status))
        return res
          .status(409)
          .json({
            message: `Sample shipment cannot move from ${shipment.status} to ${parsed.data.status}`,
          });
      const brandStatuses = new Set([
        "approved",
        "shipped",
        "cancelled",
        "issue",
        "return_requested",
      ]);
      const creatorStatuses = new Set([
        "delivered",
        "returned",
        "issue",
        "cancelled",
      ]);
      if (access.role === "brand" && !brandStatuses.has(parsed.data.status))
        return res
          .status(403)
          .json({
            message: "The creator must confirm that shipment milestone",
          });
      if (access.role === "creator" && !creatorStatuses.has(parsed.data.status))
        return res
          .status(403)
          .json({ message: "The brand must confirm that shipment milestone" });
      if (
        parsed.data.status === "shipped" &&
        (!parsed.data.carrier || !parsed.data.trackingNumber)
      )
        return res
          .status(400)
          .json({
            message:
              "Carrier and tracking number are required when a sample ships",
          });
      const now = new Date();
      const statusHistory = [
        ...shipment.statusHistory,
        {
          status: parsed.data.status,
          actorUserId: req.dbUser!.id,
          at: now.toISOString(),
          note: parsed.data.note,
        },
      ];
      const [updated] = await db
        .update(ugcSampleShipments)
        .set({
          status: parsed.data.status,
          carrier: parsed.data.carrier || shipment.carrier,
          trackingNumberCiphertext: parsed.data.trackingNumber
            ? encryptSensitiveValue(parsed.data.trackingNumber)
            : shipment.trackingNumberCiphertext,
          statusHistory,
          shippedAt:
            parsed.data.status === "shipped" ? now : shipment.shippedAt,
          deliveredAt:
            parsed.data.status === "delivered" ? now : shipment.deliveredAt,
          returnedAt:
            parsed.data.status === "returned" ? now : shipment.returnedAt,
          updatedAt: now,
        })
        .where(eq(ugcSampleShipments.id, shipment.id))
        .returning();
      const recipientUserId =
        access.role === "brand"
          ? shipment.recipientUserId
          : (await opportunityWithBrand(access.collaboration.opportunityId))
              ?.opportunity.ownerUserId;
      if (recipientUserId)
        await notify(
          recipientUserId,
          "ugc_sample",
          `Sample shipment is now ${updated.status.replaceAll("_", " ")}`,
          `/ugc?tab=work&workroom=${shipment.collaborationId}`,
          `sample:${shipment.id}:${updated.status}`,
          req.dbUser!.id,
        );
      void emitProjectionEvent({
        aggregateType: "ugc_sample_shipment",
        aggregateId: shipment.id,
        eventType: `ugc_sample.${updated.status}`,
        actorUserId: req.dbUser!.id,
        payload: {
          businessId: access.collaboration.businessId,
          collaborationId: shipment.collaborationId,
          status: updated.status,
          carrier: updated.carrier,
        },
        idempotencyKey: `ugc_sample.${updated.status}:${shipment.id}:${now.toISOString()}`,
      }).catch((error) =>
        console.error("Unable to project UGC sample update", error),
      );
      return res.json({
        id: updated.id,
        status: updated.status,
        carrier: updated.carrier,
        updatedAt: updated.updatedAt,
      });
    }),
  );

  app.post(
    "/api/ugc/workrooms/:id/performance",
    attachUser,
    safe(async (req, res) => {
      const parsed = ugcPerformanceInputSchema.safeParse(req.body);
      if (!parsed.success) return invalid(res, parsed.error);
      const access = await collaborationAccess(req.dbUser!.id, req.params.id);
      if (!access || access.role !== "brand")
        return res
          .status(403)
          .json({ message: "Only the brand team can record performance" });
      if (
        !["approved", "live", "completed"].includes(access.collaboration.status)
      )
        return res
          .status(409)
          .json({
            message: "Approve the creative before recording performance",
          });
      const commissionAmountCents = ugcCommissionAmount(
        parsed.data.attributedRevenueCents,
        access.collaboration.compensation.commissionBps,
      );
      const result = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(ugcPerformanceSnapshots)
          .values({
            collaborationId: access.collaboration.id,
            capturedByUserId: req.dbUser!.id,
            ...parsed.data,
            commissionAmountCents,
          })
          .onConflictDoNothing({
            target: ugcPerformanceSnapshots.idempotencyKey,
          })
          .returning();
        if (!created) {
          const [existing] = await tx
            .select()
            .from(ugcPerformanceSnapshots)
            .where(
              eq(
                ugcPerformanceSnapshots.idempotencyKey,
                parsed.data.idempotencyKey,
              ),
            )
            .limit(1);
          if (!existing || existing.collaborationId !== access.collaboration.id)
            throw new Error("Performance idempotency key is already in use");
          return { snapshot: existing, replayed: true };
        }
        if (commissionAmountCents > 0)
          await tx
            .insert(ugcEarningsLedger)
            .values({
              collaborationId: access.collaboration.id,
              creatorUserId: access.collaboration.creatorUserId,
              kind: "commission",
              sourceType: "performance",
              sourceId: created.id,
              amountCents: commissionAmountCents,
              currency: access.collaboration.compensation.currency,
              status: "approved",
            })
            .onConflictDoNothing();
        return { snapshot: created, replayed: false };
      });
      if (commissionAmountCents > 0 && !result.replayed)
        await notify(
          access.collaboration.creatorUserId,
          "ugc_earnings",
          `New UGC commission: ${(commissionAmountCents / 100).toLocaleString(undefined, { style: "currency", currency: access.collaboration.compensation.currency.toUpperCase() })}`,
          `/ugc?tab=work&workroom=${access.collaboration.id}`,
          `performance:${result.snapshot.id}`,
          req.dbUser!.id,
        );
      return res
        .status(result.replayed ? 200 : 201)
        .json({ ...result.snapshot, replayed: result.replayed });
    }),
  );

  app.patch(
    "/api/ugc/workrooms/:id/status",
    attachUser,
    safe(async (req, res) => {
      const parsed = collaborationStatusSchema.safeParse(req.body);
      if (!parsed.success) return invalid(res, parsed.error);
      const access = await collaborationAccess(req.dbUser!.id, req.params.id);
      if (!access)
        return res.status(404).json({ message: "UGC workroom not found" });
      if (access.role !== "brand" && parsed.data.status !== "disputed")
        return res
          .status(403)
          .json({ message: "Only the brand team can make that change" });
      if (
        !canTransitionUgcCollaboration(
          access.collaboration.status,
          parsed.data.status,
        )
      )
        return res.status(409).json({ message: "Invalid workroom transition" });
      const now = new Date();
      const [updated] = await db
        .update(ugcCollaborations)
        .set({
          status: parsed.data.status,
          completedAt:
            parsed.data.status === "completed"
              ? now
              : access.collaboration.completedAt,
          updatedAt: now,
        })
        .where(eq(ugcCollaborations.id, access.collaboration.id))
        .returning();
      return res.json(updated);
    }),
  );

  app.get(
    "/api/ugc/earnings",
    attachUser,
    safe(async (req, res) => {
      noStore(res);
      const entries = await db
        .select({
          entry: ugcEarningsLedger,
          opportunity: {
            id: ugcOpportunities.id,
            title: ugcOpportunities.title,
          },
          brand: { name: businesses.name, handle: businesses.handle },
        })
        .from(ugcEarningsLedger)
        .innerJoin(
          ugcCollaborations,
          eq(ugcCollaborations.id, ugcEarningsLedger.collaborationId),
        )
        .innerJoin(
          ugcOpportunities,
          eq(ugcOpportunities.id, ugcCollaborations.opportunityId),
        )
        .innerJoin(businesses, eq(businesses.id, ugcCollaborations.businessId))
        .where(eq(ugcEarningsLedger.creatorUserId, req.dbUser!.id))
        .orderBy(desc(ugcEarningsLedger.updatedAt));
      return res.json({
        entries,
        totals: ugcEarningsSummary(entries.map((row) => row.entry)),
      });
    }),
  );
}
