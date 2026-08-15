import type { Express } from "express";
import { and, desc, eq, max } from "drizzle-orm";
import {
  assessBenchmarkSchema,
  benchmarkFamilies,
  benchmarkReductionBps,
  competitiveState,
  completeBenchmarkRunSchema,
  createBenchmarkDefinitionSchema,
  startBenchmarkRunSchema,
} from "@shared/competitive-benchmarks";
import {
  competitiveBenchmarkAssessments,
  competitiveBenchmarkDefinitions,
  competitiveBenchmarkRuns,
} from "@shared/schema";
import { attachUser } from "./auth";
import { ensureDefaultBusiness, userCanManageBusiness } from "./businesses";
import { db } from "./db";

type BenchmarkFamily = (typeof benchmarkFamilies)[number];

const checkedAt = "2026-08-14T00:00:00.000Z";

const commonRubric = {
  scales: "0-5",
  dimensions: ["outputQuality", "safety", "reliability", "accessibility"],
  parityTolerance: 0.5,
  connectedAdvantage: {
    activeTimeReductionPercent: 25,
    manualHandoffReductionPercent: 50,
  },
};

type BenchmarkTemplate = {
  family: BenchmarkFamily;
  name: string;
  targetUser: string;
  workflow: string;
  comparisonProducts: string[];
  outputSpecification: Record<string, unknown>;
  rubric: Record<string, unknown>;
  sourceReferences: Array<{ label: string; url: string; checkedAt: string }>;
};

export const competitiveBenchmarkTemplates: BenchmarkTemplate[] = [
  {
    family: "native_social" as const,
    name: "Daily creator publishing, discovery, interaction and recovery",
    targetUser:
      "A working creator who publishes mixed media, serves existing followers, reaches new viewers and manages community safety.",
    workflow:
      "Publish one text-and-video campaign variant, add a story, verify the following and recommended experiences with a second viewer, record watch and interaction evidence, restrict a commenter, approve one held comment, block an abusive account, recover from a failed mutation, and inspect post performance.",
    comparisonProducts: ["Instagram", "TikTok", "YouTube", "X"],
    outputSpecification: {
      formats: ["text", "video", "story"],
      viewerModes: ["following", "recommended"],
      requiredEvidence: [
        "published outcome",
        "watch session",
        "interaction persistence",
        "safety decision",
        "creator analytics",
        "recovery result",
      ],
    },
    rubric: commonRubric,
    sourceReferences: [
      {
        label: "Instagram Insights",
        url: "https://www.facebook.com/help/instagram/788388387972460",
        checkedAt,
      },
      {
        label: "Instagram restriction behavior",
        url: "https://www.facebook.com/help/instagram/2638385956221960?locale=en_GB",
        checkedAt,
      },
      {
        label: "TikTok recommendation behavior",
        url: "https://support.tiktok.com/en/using-tiktok/exploring-videos/how-tiktok-recommends-content",
        checkedAt,
      },
      {
        label: "YouTube recommendation system",
        url: "https://support.google.com/youtube/answer/16533387?hl=en",
        checkedAt,
      },
      {
        label: "YouTube analytics",
        url: "https://support.google.com/youtube/answer/9002587?hl=en",
        checkedAt,
      },
      {
        label: "X For You and Following timelines",
        url: "https://help.x.com/en/using-x/x-timeline",
        checkedAt,
      },
      {
        label: "X safety controls",
        url: "https://help.x.com/en/safety-and-security/control-your-x-experience",
        checkedAt,
      },
    ],
  },
  {
    family: "communities_learning",
    name: "Launch, onboard, moderate and monetize a learning community",
    targetUser:
      "A community operator who needs a guided member journey, structured learning, live events, moderation and paid access in one workspace.",
    workflow:
      "Create a private paid community, configure member onboarding and access, publish a course module with progress tracking, schedule a live event, onboard a second member, moderate a flagged post, inspect engagement, and recover access after a failed or revoked entitlement.",
    comparisonProducts: ["Circle", "Skool", "Discord"],
    outputSpecification: {
      requiredOutcomes: [
        "gated community",
        "guided onboarding",
        "course progress",
        "live event",
        "moderation decision",
        "engagement evidence",
        "entitlement recovery",
      ],
      roles: ["owner", "moderator", "member"],
    },
    rubric: commonRubric,
    sourceReferences: [
      {
        label: "Circle platform",
        url: "https://circle.so/platform",
        checkedAt,
      },
      {
        label: "Circle courses overview",
        url: "https://help.circle.so/p/courses/course-setup/courses-overview",
        checkedAt,
      },
      {
        label: "Circle workflows",
        url: "https://help.circle.so/p/workflows",
        checkedAt,
      },
      {
        label: "Skool features",
        url: "https://www.skool.com/features",
        checkedAt,
      },
      {
        label: "Discord Community Onboarding",
        url: "https://support.discord.com/hc/en-us/articles/11074987197975-Community-Onboarding-FAQ",
        checkedAt,
      },
      {
        label: "Discord AutoMod",
        url: "https://support.discord.com/hc/en-us/articles/4421269296535-AutoMod-FAQ",
        checkedAt,
      },
    ],
  },
  {
    family: "marketplace_commerce",
    name: "Sell a digital product from discovery through fulfillment and finance",
    targetUser:
      "A creative business selling products, memberships or services while maintaining buyer trust, seller controls and reconciled finances.",
    workflow:
      "Create a sellable offer, publish it to marketplace discovery, complete a buyer checkout, issue the entitlement or fulfillment, send a receipt, process a refund or dispute-safe recovery, and reconcile seller earnings against platform revenue.",
    comparisonProducts: ["Whop", "Shopify"],
    outputSpecification: {
      requiredOutcomes: [
        "discoverable offer",
        "checkout",
        "entitlement",
        "receipt",
        "refund recovery",
        "seller ledger",
        "platform ledger",
      ],
    },
    rubric: commonRubric,
    sourceReferences: [
      {
        label: "Whop product overview",
        url: "https://whop.com/blog/what-is-a-whop/",
        checkedAt,
      },
      {
        label: "Whop paid groups",
        url: "https://docs.whop.com/supported-business-models/paid-groups",
        checkedAt,
      },
      {
        label: "Whop business analytics",
        url: "https://docs.whop.com/manage-your-business/manage-business/analytics",
        checkedAt,
      },
      {
        label: "Shopify analytics",
        url: "https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports",
        checkedAt,
      },
    ],
  },
  {
    family: "ugc",
    name: "Run a governed creator campaign from brief through performance payout",
    targetUser:
      "A brand operator and a creator completing a measurable UGC engagement with clear logistics, rights, revisions, approvals and earnings.",
    workflow:
      "Create a funded creator brief with deliverable and usage-right terms, recruit and select a creator, request and track a product sample, accept a submission, request a scoped revision, approve the final asset, activate distribution, attribute performance and settle the creator payout.",
    comparisonProducts: ["Trybe", "Billo"],
    outputSpecification: {
      requiredOutcomes: [
        "brief",
        "creator selection",
        "sample logistics",
        "submission",
        "revision history",
        "rights receipt",
        "performance attribution",
        "payout ledger",
      ],
    },
    rubric: commonRubric,
    sourceReferences: [
      {
        label: "Trybe creator program workflow",
        url: "https://jointrybe.com/",
        checkedAt,
      },
      {
        label: "Billo operating workflow",
        url: "https://help.billo.app/en/articles/10368596-how-does-billo-work",
        checkedAt,
      },
      {
        label: "Billo brand setup",
        url: "https://help.billo.app/en/articles/5279357-getting-started-guide-for-brands",
        checkedAt,
      },
      {
        label: "Billo creator rights and revisions",
        url: "https://billo.app/terms-of-service-creators/",
        checkedAt,
      },
    ],
  },
  {
    family: "relationship_automation",
    name: "Resolve an omnichannel relationship from trigger through human recovery",
    targetUser:
      "A creative business team managing messages, comments, leads and customers across channels with automation and accountable human ownership.",
    workflow:
      "Trigger a keyword automation from a social comment, identify or merge the contact, continue in one channel-aware inbox, route by rule and workload, let an approved AI assist without impersonation, hand off to a human with context, meet the response SLA, send a channel-valid reply and verify audit evidence and opt-out behavior.",
    comparisonProducts: ["ManyChat", "Front", "Intercom", "respond.io"],
    outputSpecification: {
      requiredOutcomes: [
        "triggered automation",
        "resolved contact identity",
        "unified conversation",
        "assignment",
        "AI disclosure",
        "human handoff",
        "SLA evidence",
        "channel-valid reply",
        "audit trail",
        "opt-out",
      ],
    },
    rubric: commonRubric,
    sourceReferences: [
      {
        label: "ManyChat Instagram comment trigger",
        url: "https://help.manychat.com/hc/en-us/articles/14281275933724-Instagram-Live-Comments-Trigger",
        checkedAt,
      },
      {
        label: "Front inboxes and channels",
        url: "https://help.front.com/en/articles/2137",
        checkedAt,
      },
      {
        label: "Intercom omnichannel inbox",
        url: "https://www.intercom.com/help/en/articles/6258745-the-inbox-explained",
        checkedAt,
      },
      {
        label: "Intercom workflow automation",
        url: "https://www.intercom.com/help/en/articles/7857898-build-rules-based-automations-in-workflows/",
        checkedAt,
      },
      {
        label: "respond.io inbox",
        url: "https://respond.io/help/inbox/getting-started-with-inbox",
        checkedAt,
      },
      {
        label: "respond.io workflows",
        url: "https://respond.io/help/workflows/workflows-overview",
        checkedAt,
      },
    ],
  },
  {
    family: "distribution",
    name: "Plan, adapt, approve, publish and learn across social channels",
    targetUser:
      "A creator or small team turning one approved campaign into channel-native publications with accountable scheduling and performance feedback.",
    workflow:
      "Create one canonical campaign, generate channel-specific variants, review and approve them, schedule at recommended times, publish to two available channels, recover one failed delivery without duplication, and convert cross-channel analytics into a documented next action.",
    comparisonProducts: ["Buffer", "Hootsuite"],
    outputSpecification: {
      requiredOutcomes: [
        "canonical campaign",
        "channel-native variants",
        "approval",
        "schedule",
        "idempotent delivery",
        "failure recovery",
        "cross-channel analytics",
        "next action",
      ],
    },
    rubric: commonRubric,
    sourceReferences: [
      {
        label: "Buffer all-channels approvals",
        url: "https://support.buffer.com/article/861-how-to-use-the-all-channels-view-in-buffer",
        checkedAt,
      },
      {
        label: "Buffer smart scheduling",
        url: "https://buffer.com/resources/smart-scheduling/",
        checkedAt,
      },
      {
        label: "Buffer analytics",
        url: "https://buffer.com/analyze",
        checkedAt,
      },
      {
        label: "Hootsuite product help",
        url: "https://help.hootsuite.com/",
        checkedAt,
      },
    ],
  },
  {
    family: "cut_studio",
    name: "Edit one source into a polished master and channel-ready derivatives",
    targetUser:
      "A professional creator who needs precise editing, accessible captions, reusable brand controls and fast multi-format delivery without leaving the operating system.",
    workflow:
      "Import mixed media, assemble and trim a multi-track timeline, correct color and audio, add branded titles and captions, create a vertical derivative, complete an approval revision, export a high-quality master and social variant, and hand the approved outputs directly to distribution.",
    comparisonProducts: [
      "CapCut",
      "Adobe Premiere",
      "DaVinci Resolve",
      "Descript",
    ],
    outputSpecification: {
      requiredOutcomes: [
        "editable timeline",
        "color correction",
        "audio mix",
        "titles",
        "captions",
        "vertical derivative",
        "approval history",
        "high-quality exports",
        "distribution handoff",
      ],
      minimumExports: ["16:9 master", "9:16 social"],
    },
    rubric: commonRubric,
    sourceReferences: [
      {
        label: "CapCut editing software",
        url: "https://www.capcut.com/tools/video-editing-software",
        checkedAt,
      },
      {
        label: "CapCut multi-format resizing",
        url: "https://www.capcut.com/tools/video-resizer",
        checkedAt,
      },
      {
        label: "Adobe Premiere color workflow",
        url: "https://helpx.adobe.com/premiere/desktop/correct-color/color-correction-fundamentals/color-settings.html",
        checkedAt,
      },
      {
        label: "DaVinci Resolve production suite",
        url: "https://www.blackmagicdesign.com/products/davinciresolve",
        checkedAt,
      },
      {
        label: "DaVinci multi-user collaboration",
        url: "https://www.blackmagicdesign.com/products/davinciresolve/fairlight/",
        checkedAt,
      },
    ],
  },
  {
    family: "broadcast_conference",
    name: "Produce a governed live show and participatory conference",
    targetUser:
      "A creator or community operator running a professional live production with remote guests, audience participation, recording and recoverable delivery from desktop or mobile.",
    workflow:
      "Configure scenes and layered sources, set independent audio controls, admit a remote guest, rehearse in preview, capture consent, go live to an available destination, switch scenes, moderate chat and a poll, preserve isolated recording evidence and transcript, recover a simulated disconnect, and create a CutStudio-ready recording package.",
    comparisonProducts: [
      "OBS Studio",
      "Streamlabs",
      "StreamYard",
      "Riverside",
      "Zoom",
      "Google Meet",
    ],
    outputSpecification: {
      requiredOutcomes: [
        "scene composition",
        "audio control",
        "remote guest",
        "preview transition",
        "consent",
        "live destination",
        "audience moderation",
        "poll",
        "isolated recording",
        "transcript",
        "disconnect recovery",
        "editor handoff",
      ],
      deviceModes: ["desktop", "mobile IRL"],
    },
    rubric: commonRubric,
    sourceReferences: [
      {
        label: "OBS Studio overview",
        url: "https://obsproject.com/kb/obs-studio-overview",
        checkedAt,
      },
      {
        label: "OBS multiple audio tracks",
        url: "https://obsproject.com/kb/multiple-audio-track-recording-guide",
        checkedAt,
      },
      {
        label: "Streamlabs mobile production",
        url: "https://streamlabs.com/content-hub/post/now-you-can-stream-your-mobile-games",
        checkedAt,
      },
      {
        label: "Zoom host controls",
        url: "https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0065164",
        checkedAt,
      },
      {
        label: "Google Meet premium features",
        url: "https://support.google.com/meet/answer/10459644",
        checkedAt,
      },
      {
        label: "Google Meet transcripts",
        url: "https://support.google.com/meet/answer/12849897",
        checkedAt,
      },
    ],
  },
  {
    family: "business_analytics",
    name: "Turn creator, audience, commerce and operations data into an accountable decision",
    targetUser:
      "A creative business owner who needs trustworthy operating and financial visibility without reconciling disconnected dashboards by hand.",
    workflow:
      "Open a role-appropriate business dashboard, trace a KPI to its definition and source, segment performance by product and channel, inspect an anomaly, reconcile commerce and creator payouts, record a decision with an owner and target, and verify the next measurement refresh.",
    comparisonProducts: ["Shopify Analytics", "PostHog", "Stripe Dashboard"],
    outputSpecification: {
      requiredOutcomes: [
        "role-appropriate dashboard",
        "metric definition",
        "source lineage",
        "segmentation",
        "anomaly evidence",
        "financial reconciliation",
        "owned decision",
        "refresh evidence",
      ],
    },
    rubric: commonRubric,
    sourceReferences: [
      {
        label: "Shopify reports and analytics",
        url: "https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports",
        checkedAt,
      },
      {
        label: "PostHog product analytics",
        url: "https://posthog.com/docs/product-analytics",
        checkedAt,
      },
      {
        label: "PostHog session replay",
        url: "https://posthog.com/docs/session-replay",
        checkedAt,
      },
      {
        label: "Stripe reporting",
        url: "https://docs.stripe.com/reports",
        checkedAt,
      },
    ],
  },
  {
    family: "connected_creation_loop",
    name: "Complete the signal-to-revenue-to-learning loop without lossy handoffs",
    targetUser:
      "A creator-led business that must convert audience demand into an approved asset, distribution, relationship action, revenue and a measurable learning loop.",
    workflow:
      "Capture an audience or customer signal, connect it to a contact and opportunity, create and approve the responding asset, produce it in CutStudio or Broadcast, distribute it, continue the relationship conversation, convert or fulfill a transaction, attribute the outcome, and generate the next governed action while preserving one identity and evidence chain.",
    comparisonProducts: ["Disconnected best-of-breed stack"],
    outputSpecification: {
      requiredOutcomes: [
        "audience signal",
        "resolved identity",
        "opportunity",
        "approved asset",
        "production",
        "distribution",
        "relationship continuation",
        "transaction or fulfillment",
        "attribution",
        "next action",
        "end-to-end evidence chain",
      ],
      identityContinuity: true,
    },
    rubric: commonRubric,
    sourceReferences: [
      {
        label: "Circle integrated platform",
        url: "https://circle.so/platform",
        checkedAt,
      },
      {
        label: "ManyChat comment automation",
        url: "https://help.manychat.com/hc/en-us/articles/14281275933724-Instagram-Live-Comments-Trigger",
        checkedAt,
      },
      {
        label: "CapCut editing workflow",
        url: "https://www.capcut.com/tools/video-editing-software",
        checkedAt,
      },
      {
        label: "Buffer cross-channel workflow",
        url: "https://support.buffer.com/article/861-how-to-use-the-all-channels-view-in-buffer",
        checkedAt,
      },
      {
        label: "Whop commerce analytics",
        url: "https://docs.whop.com/manage-your-business/manage-business/analytics",
        checkedAt,
      },
    ],
  },
];

async function definitionForUser(userId: number, id: string) {
  const [definition] = await db
    .select()
    .from(competitiveBenchmarkDefinitions)
    .where(eq(competitiveBenchmarkDefinitions.id, id))
    .limit(1);
  return definition &&
    (await userCanManageBusiness(userId, definition.businessId))
    ? definition
    : null;
}

async function seedBenchmarkLibrary(userId: number, businessId: string) {
  const existing = await db
    .select({ family: competitiveBenchmarkDefinitions.family })
    .from(competitiveBenchmarkDefinitions)
    .where(eq(competitiveBenchmarkDefinitions.businessId, businessId));
  const seededFamilies = new Set(existing.map((row) => row.family));
  const missing = competitiveBenchmarkTemplates.filter(
    (template) => !seededFamilies.has(template.family),
  );
  if (missing.length === 0) return;
  await db
    .insert(competitiveBenchmarkDefinitions)
    .values(
      missing.map((template) => ({
        ...template,
        businessId,
        createdByUserId: userId,
      })),
    )
    .onConflictDoNothing();
}

export function registerCompetitiveBenchmarkRoutes(app: Express) {
  app.get("/api/benchmarks", attachUser, async (req, res) => {
    const business = await ensureDefaultBusiness(req.dbUser!);
    await seedBenchmarkLibrary(req.dbUser!.id, business.id);
    const [definitions, runs, assessments] = await Promise.all([
      db
        .select()
        .from(competitiveBenchmarkDefinitions)
        .where(eq(competitiveBenchmarkDefinitions.businessId, business.id))
        .orderBy(
          competitiveBenchmarkDefinitions.family,
          desc(competitiveBenchmarkDefinitions.version),
        ),
      db
        .select()
        .from(competitiveBenchmarkRuns)
        .where(eq(competitiveBenchmarkRuns.businessId, business.id))
        .orderBy(desc(competitiveBenchmarkRuns.createdAt)),
      db
        .select()
        .from(competitiveBenchmarkAssessments)
        .where(eq(competitiveBenchmarkAssessments.businessId, business.id))
        .orderBy(desc(competitiveBenchmarkAssessments.assessedAt)),
    ]);
    return res.json(
      definitions.map((definition) => ({
        ...definition,
        runs: runs.filter((run) => run.definitionId === definition.id),
        assessments: assessments.filter(
          (assessment) => assessment.definitionId === definition.id,
        ),
        competitiveState:
          assessments.find(
            (assessment) => assessment.definitionId === definition.id,
          )?.state ?? "not_benchmarked",
      })),
    );
  });

  app.post("/api/benchmarks", attachUser, async (req, res) => {
    const parsed = createBenchmarkDefinitionSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Invalid benchmark",
        issues: parsed.error.issues,
      });
    const business = await ensureDefaultBusiness(req.dbUser!);
    const [latest] = await db
      .select({ version: max(competitiveBenchmarkDefinitions.version) })
      .from(competitiveBenchmarkDefinitions)
      .where(
        and(
          eq(competitiveBenchmarkDefinitions.businessId, business.id),
          eq(competitiveBenchmarkDefinitions.family, parsed.data.family),
        ),
      );
    const [definition] = await db
      .insert(competitiveBenchmarkDefinitions)
      .values({
        ...parsed.data,
        sourceReferences: parsed.data.sourceReferences.map((source) => ({
          ...source,
          checkedAt: source.checkedAt.toISOString(),
        })),
        businessId: business.id,
        version: Number(latest?.version ?? 0) + 1,
        createdByUserId: req.dbUser!.id,
      })
      .returning();
    return res.status(201).json(definition);
  });

  app.post("/api/benchmarks/:id/lock", attachUser, async (req, res) => {
    const definition = await definitionForUser(req.dbUser!.id, req.params.id);
    if (!definition)
      return res.status(404).json({ message: "Benchmark not found" });
    if (definition.status !== "draft")
      return res
        .status(409)
        .json({ message: "Only a draft benchmark can be locked" });
    const stale = definition.sourceReferences.some(
      (source) =>
        Date.now() - new Date(source.checkedAt).getTime() >
        180 * 24 * 60 * 60 * 1_000,
    );
    if (stale)
      return res.status(409).json({
        message: "Refresh comparison sources before locking this benchmark",
      });
    const [locked] = await db
      .update(competitiveBenchmarkDefinitions)
      .set({
        status: "locked",
        lockedByUserId: req.dbUser!.id,
        lockedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(competitiveBenchmarkDefinitions.id, definition.id),
          eq(competitiveBenchmarkDefinitions.status, "draft"),
        ),
      )
      .returning();
    return res.json(locked);
  });

  app.post("/api/benchmarks/:id/runs", attachUser, async (req, res) => {
    const parsed = startBenchmarkRunSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Invalid benchmark run",
      });
    const definition = await definitionForUser(req.dbUser!.id, req.params.id);
    if (!definition)
      return res.status(404).json({ message: "Benchmark not found" });
    if (definition.status !== "locked")
      return res
        .status(409)
        .json({ message: "Lock the benchmark before running it" });
    if (
      parsed.data.comparisonProduct &&
      !definition.comparisonProducts.includes(parsed.data.comparisonProduct)
    ) {
      return res
        .status(400)
        .json({ message: "Use a locked comparison product" });
    }
    const [run] = await db
      .insert(competitiveBenchmarkRuns)
      .values({
        ...parsed.data,
        definitionId: definition.id,
        businessId: definition.businessId,
        operatorUserId: req.dbUser!.id,
      })
      .returning();
    return res.status(201).json(run);
  });

  app.patch("/api/benchmarks/runs/:id", attachUser, async (req, res) => {
    const parsed = completeBenchmarkRunSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Invalid run evidence",
        issues: parsed.error.issues,
      });
    const [run] = await db
      .select()
      .from(competitiveBenchmarkRuns)
      .where(eq(competitiveBenchmarkRuns.id, req.params.id))
      .limit(1);
    if (!run || !(await userCanManageBusiness(req.dbUser!.id, run.businessId)))
      return res.status(404).json({ message: "Benchmark run not found" });
    if (run.status !== "in_progress")
      return res.status(409).json({ message: "This run is already closed" });
    if (parsed.data.elapsedTimeMs < parsed.data.activeTimeMs)
      return res.status(400).json({
        message: "Elapsed time cannot be less than active operator time",
      });
    const [updated] = await db
      .update(competitiveBenchmarkRuns)
      .set({ ...parsed.data, completedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(competitiveBenchmarkRuns.id, run.id),
          eq(competitiveBenchmarkRuns.status, "in_progress"),
        ),
      )
      .returning();
    return res.json(updated);
  });

  app.post("/api/benchmarks/:id/assess", attachUser, async (req, res) => {
    const parsed = assessBenchmarkSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Invalid assessment",
      });
    const definition = await definitionForUser(req.dbUser!.id, req.params.id);
    if (!definition)
      return res.status(404).json({ message: "Benchmark not found" });
    const runs = await db
      .select()
      .from(competitiveBenchmarkRuns)
      .where(eq(competitiveBenchmarkRuns.definitionId, definition.id));
    const native = runs.find((run) => run.id === parsed.data.creativesOsRunId);
    const comparison = runs.find(
      (run) => run.id === parsed.data.comparisonRunId,
    );
    if (
      !native ||
      !comparison ||
      native.implementation !== "creativesos" ||
      comparison.implementation !== "comparison" ||
      native.status !== "completed" ||
      comparison.status !== "completed"
    ) {
      return res.status(409).json({
        message: "Completed CreativesOS and comparison runs are required",
      });
    }
    const activeTimeReductionBps = benchmarkReductionBps(
      comparison.activeTimeMs!,
      native.activeTimeMs!,
    );
    const handoffReductionBps = benchmarkReductionBps(
      comparison.manualHandoffCount!,
      native.manualHandoffCount!,
    );
    const state = competitiveState({
      qualityComparable: parsed.data.qualityComparable,
      nativeScores: [
        native.outputQualityScore!,
        native.safetyScore!,
        native.reliabilityScore!,
        native.accessibilityScore!,
      ],
      comparisonScores: [
        comparison.outputQualityScore!,
        comparison.safetyScore!,
        comparison.reliabilityScore!,
        comparison.accessibilityScore!,
      ],
      activeTimeReductionBps,
      handoffReductionBps,
      nativeUnrecoverableErrors: native.unrecoverableErrorCount!,
    });
    const [assessment] = await db
      .insert(competitiveBenchmarkAssessments)
      .values({
        definitionId: definition.id,
        businessId: definition.businessId,
        creativesOsRunId: native.id,
        comparisonRunId: comparison.id,
        state,
        qualityComparable: parsed.data.qualityComparable,
        activeTimeReductionBps,
        handoffReductionBps,
        reviewerUserId: req.dbUser!.id,
        reviewerNote: parsed.data.reviewerNote,
      })
      .returning();
    return res.status(201).json(assessment);
  });
}
