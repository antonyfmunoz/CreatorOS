import type { Express } from "express";
import { and, desc, eq, max, ne, sql } from "drizzle-orm";
import { rateLimit } from "express-rate-limit";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  assessBenchmarkSchema,
  attachBenchmarkEvidenceSchema,
  benchmarkEnvironmentSchema,
  benchmarkFamilies,
  benchmarkReductionBps,
  canTransitionBenchmarkRemediation,
  competitiveState,
  completeBenchmarkRunSchema,
  createBenchmarkDefinitionSchema,
  startBenchmarkRunSchema,
  updateBenchmarkRemediationSchema,
  type ParityRequirement,
} from "@shared/competitive-benchmarks";
import {
  assets,
  competitiveBenchmarkAssessments,
  competitiveBenchmarkDefinitions,
  competitiveBenchmarkRemediations,
  competitiveBenchmarkRuns,
  creativeWorkItems,
} from "@shared/schema";
import { attachUser } from "./auth";
import { ensureDefaultBusiness, userCanManageBusiness } from "./businesses";
import { db } from "./db";
import {
  materializePrivateAsset,
  removeStoredAsset,
  sealPrivateAssetCopy,
} from "./asset-storage";

type BenchmarkFamily = (typeof benchmarkFamilies)[number];

const benchmarkAssetUriPattern =
  /^asset:\/\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

async function sha256PrivateAsset(storageKey: string) {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "creativesos-benchmark-"),
  );
  const artifactPath = path.join(directory, "artifact");
  try {
    await materializePrivateAsset(storageKey, artifactPath);
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(artifactPath)) hash.update(chunk);
    return hash.digest("hex");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

async function validateCustodiedEvidence(
  businessId: string,
  evidence: Array<{ uri: string; checksum: string }>,
) {
  const seenAssetIds = new Set<string>();
  for (const item of evidence) {
    const match = benchmarkAssetUriPattern.exec(item.uri);
    if (item.uri.startsWith("asset://") && !match)
      return "Benchmark evidence contains an invalid asset URI";
    if (!match) continue;
    const assetId = match[1]!.toLowerCase();
    if (seenAssetIds.has(assetId))
      return "Each benchmark evidence slot requires a distinct asset";
    seenAssetIds.add(assetId);
    const [asset] = await db
      .select()
      .from(assets)
      .where(
        and(eq(assets.id, assetId), eq(assets.businessId, businessId)),
      )
      .limit(1);
    if (
      !asset ||
      asset.kind !== "download" ||
      asset.visibility !== "private" ||
      asset.status !== "ready"
    )
      return "Benchmark evidence asset is not ready in this workspace";
    try {
      const observedSha256 = await sha256PrivateAsset(asset.storageKey);
      if (asset.sha256 !== observedSha256)
        await db
          .update(assets)
          .set({ sha256: observedSha256 })
          .where(eq(assets.id, asset.id));
      if (item.checksum !== `sha256:${observedSha256}`)
        return "Benchmark evidence checksum does not match the stored asset";
      if (!asset.metadata?.benchmarkEvidenceSealedAt) {
        const sealed = await sealPrivateAssetCopy({
          storageKey: asset.storageKey,
          ownerUserId: asset.ownerUserId,
          kind: asset.kind,
          filename: asset.originalFilename ?? "benchmark-evidence.bin",
          mimeType: asset.mimeType ?? "application/octet-stream",
        });
        await db
          .update(assets)
          .set({
            storageKey: sealed.storageKey,
            sizeBytes: sealed.sizeBytes,
            sha256: observedSha256,
            metadata: {
              ...asset.metadata,
              benchmarkEvidenceSealedAt: new Date().toISOString(),
              benchmarkEvidenceCustodyVersion: 1,
            },
          })
          .where(eq(assets.id, asset.id));
        await removeStoredAsset(asset.storageKey, "private").catch(
          (error) =>
            console.error("Unable to remove superseded evidence object:", error),
        );
      }
    } catch (error) {
      console.error("Unable to revalidate benchmark evidence:", error);
      return "Unable to revalidate benchmark evidence integrity";
    }
  }
  return null;
}

function benchmarkEnvironmentKey(value: unknown): string | null {
  const parsed = benchmarkEnvironmentSchema.safeParse(value);
  return parsed.success ? JSON.stringify(parsed.data) : null;
}

const checkedAt = "2026-08-14T00:00:00.000Z";
const expandedCheckedAt = "2026-08-24T00:00:00.000Z";

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
  parityRequirements: ParityRequirement[];
  sourceReferences: Array<{ label: string; url: string; checkedAt: string }>;
};

type BenchmarkTemplateInput = Omit<BenchmarkTemplate, "parityRequirements">;

function requirementSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 56) || "capability";
}

function outputCapabilities(
  value: unknown,
  path: string[] = [],
): Array<{ capability: string; acceptanceCriterion: string }> {
  if (typeof value === "string") {
    return [{
      capability: value,
      acceptanceCriterion: `CreativesOS must produce and preserve ${value} at materially comparable professional quality under the locked run conditions.`,
    }];
  }
  if (value === true && path.length > 0) {
    const capability = path.join(" ").replace(/([a-z])([A-Z])/g, "$1 $2");
    return [{
      capability,
      acceptanceCriterion: `CreativesOS must provide ${capability} with materially comparable control, persistence, and recovery under the locked run conditions.`,
    }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => outputCapabilities(item, [...path, String(index + 1)]));
  }
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => outputCapabilities(item, [...path, key]));
  }
  return [];
}

function buildParityRequirements(template: BenchmarkTemplateInput): ParityRequirement[] {
  const outcomes = outputCapabilities(template.outputSpecification);
  return template.comparisonProducts.flatMap((comparisonProduct) => {
    const prefix = requirementSlug(comparisonProduct);
    const universal: Array<Omit<ParityRequirement, "id" | "comparisonProduct">> = [
      {
        capability: "Complete target workflow",
        acceptanceCriterion: "A qualified target user can complete every locked workflow step in CreativesOS without a missing required capability or forced handoff to the comparison product.",
        tier: "required_parity",
      },
      {
        capability: "Professional output quality",
        acceptanceCriterion: "The reviewed output is materially equivalent in fidelity, correctness, accessibility, and fitness for the target user's professional purpose.",
        tier: "required_parity",
      },
      {
        capability: "Control and operational visibility",
        acceptanceCriterion: "CreativesOS exposes materially equivalent control over the target workflow and enough status, history, and evidence to diagnose and recover normal failures.",
        tier: "required_parity",
      },
      {
        capability: "Reliability and recovery",
        acceptanceCriterion: "Persistence, retry, cancellation, recovery, and irreversible-action safeguards are materially equivalent or stronger under the locked failure scenarios.",
        tier: "required_parity",
      },
    ];
    const required = [...universal, ...outcomes.map((outcome) => ({ ...outcome, tier: "required_parity" as const }))];
    const requirements = required.map((item, index) => ({
      ...item,
      id: `${prefix}-required-${index + 1}-${requirementSlug(item.capability)}`.slice(0, 120),
      comparisonProduct,
    }));
    requirements.push({
      id: `${prefix}-connected-advantage`,
      comparisonProduct,
      capability: "Connected-system advantage",
      acceptanceCriterion: "When quality parity is met, CreativesOS proves at least 25% less active operator time or 50% fewer manual cross-application handoffs.",
      tier: "connected_advantage",
    });
    return requirements;
  });
}

const benchmarkTemplateInputs: BenchmarkTemplateInput[] = [
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
    family: "media_hosting_dam",
    name: "Ingest, govern, review, publish and retire reusable media",
    targetUser:
      "A creator team that needs secure media ingest, searchable asset custody, professional playback, review history and reversible portability across every instrument.",
    workflow:
      "Upload a large source, preserve its checksum and rights metadata, create playback renditions and a private review link, organize it in a permissioned collection, complete a time-coded review and version replacement, publish an embedded player, inspect engagement telemetry, export the original and metadata, and prove deletion removes unauthorized playback without breaking the audit record.",
    comparisonProducts: ["Vimeo", "Frame.io", "Mux", "Cloudflare Stream"],
    outputSpecification: {
      requiredOutcomes: [
        "durable ingest",
        "checksum and provenance",
        "adaptive playback",
        "permissioned collection",
        "time-coded review",
        "version lineage",
        "embeddable player",
        "engagement telemetry",
        "portable export",
        "verified deletion",
      ],
    },
    rubric: commonRubric,
    sourceReferences: [
      {
        label: "Vimeo professional video library",
        url: "https://vimeo.com/features/video-library",
        checkedAt: expandedCheckedAt,
      },
      {
        label: "Mux Video API",
        url: "https://www.mux.com/video-api",
        checkedAt: expandedCheckedAt,
      },
      {
        label: "Cloudflare Stream overview",
        url: "https://developers.cloudflare.com/stream/",
        checkedAt: expandedCheckedAt,
      },
    ],
  },
  {
    family: "planning_work_management",
    name: "Plan and coordinate a cross-channel production from idea to retrospective",
    targetUser:
      "A creator-led team coordinating ideas, briefs, dependencies, approvals, assets, deadlines and measurable outcomes without reconstructing work in a separate project system.",
    workflow:
      "Capture an idea, convert it into a campaign and production plan, assign dependent work with owners and dates, attach canonical assets and briefs, view the plan as board and calendar, resolve a blocker, approve the deliverable, trigger publication, and close the retrospective with performance evidence and follow-up work.",
    comparisonProducts: ["Notion", "Asana", "ClickUp", "Monday.com"],
    outputSpecification: {
      requiredOutcomes: [
        "captured idea",
        "connected campaign",
        "dependency graph",
        "owned assignments",
        "board and calendar views",
        "asset and brief continuity",
        "approval",
        "publication handoff",
        "evidence-based retrospective",
      ],
    },
    rubric: commonRubric,
    sourceReferences: [
      {
        label: "Notion projects",
        url: "https://www.notion.com/product/projects",
        checkedAt: expandedCheckedAt,
      },
      {
        label: "Asana workflows",
        url: "https://asana.com/product/workflows",
        checkedAt: expandedCheckedAt,
      },
      {
        label: "ClickUp project management",
        url: "https://clickup.com/features/project-management",
        checkedAt: expandedCheckedAt,
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
    family: "meeting_intelligence",
    name: "Run a consent-governed meeting with role-scoped realtime assistance",
    targetUser:
      "A creator, salesperson or community operator who needs reliable meeting capture, useful guest context, discreet role-appropriate coaching and accountable AI participation.",
    workflow:
      "Schedule a room, disclose recording and AI participation, admit a guest, resolve the guest to the permitted relationship record, capture separate speakers and a live transcript, surface a role-approved briefing and one evidence-linked coaching suggestion, invite an explicitly authorized AI role to speak, hand control back to a human, generate decisions and tasks, correct the transcript, revoke access, and verify the audit trail.",
    comparisonProducts: [
      "Zoom",
      "Google Meet",
      "Fireflies.ai",
      "Fathom",
      "Cluely",
    ],
    outputSpecification: {
      requiredOutcomes: [
        "consent receipt",
        "guest identity resolution",
        "speaker-separated recording",
        "live transcript",
        "permission-bounded guest brief",
        "evidence-linked coaching",
        "disclosed AI participant",
        "human override",
        "decisions and tasks",
        "transcript correction",
        "revocation",
        "audit trail",
      ],
      prohibitedOutcomes: [
        "undisclosed recording",
        "covert impersonation",
        "diagnostic psychological claims",
        "AI access beyond the assigned role",
      ],
    },
    rubric: commonRubric,
    sourceReferences: [
      {
        label: "Google Meet transcripts",
        url: "https://support.google.com/meet/answer/12849897",
        checkedAt: expandedCheckedAt,
      },
      {
        label: "Fireflies meeting assistant",
        url: "https://fireflies.ai/product",
        checkedAt: expandedCheckedAt,
      },
      {
        label: "Fathom AI meeting assistant",
        url: "https://www.fathom.ai/",
        checkedAt: expandedCheckedAt,
      },
    ],
  },
  {
    family: "audience_email",
    name: "Own an audience relationship from consent through attributable conversion",
    targetUser:
      "A creator business that needs portable audience identity, lawful consent, segmentation, email sequences and relationship continuity independent of social algorithms.",
    workflow:
      "Publish a capture form, record consent provenance, merge a known subscriber safely, create a dynamic segment, build and approve a branded campaign plus an automated sequence, send through an available delivery adapter, process a reply and unsubscribe, suppress the contact everywhere required, attribute a conversion, and export the audience with consent and engagement history.",
    comparisonProducts: ["Kit", "beehiiv", "Mailchimp", "HubSpot"],
    outputSpecification: {
      requiredOutcomes: [
        "capture form",
        "consent provenance",
        "safe identity merge",
        "dynamic segment",
        "branded campaign",
        "automated sequence",
        "delivery evidence",
        "reply handoff",
        "global suppression",
        "conversion attribution",
        "portable export",
      ],
    },
    rubric: commonRubric,
    sourceReferences: [
      {
        label: "Kit email marketing",
        url: "https://kit.com/features/email-marketing",
        checkedAt: expandedCheckedAt,
      },
      {
        label: "beehiiv newsletter platform",
        url: "https://www.beehiiv.com/features",
        checkedAt: expandedCheckedAt,
      },
      {
        label: "Mailchimp marketing automation",
        url: "https://mailchimp.com/features/marketing-automation/",
        checkedAt: expandedCheckedAt,
      },
    ],
  },
  {
    family: "design_studio",
    name: "Create an approved brand system and production-ready campaign variants",
    targetUser:
      "A creator or team producing consistent thumbnails, covers, carousels and campaign graphics from governed brand assets without rebuilding context in a separate design tool.",
    workflow:
      "Create a brand kit, compose a reusable template with text and image layers, apply accessible typography and contrast, generate square, portrait and landscape variants, replace a linked asset once, collaborate through a review revision, export print- and web-appropriate outputs, and hand approved variants directly to a campaign and creator site.",
    comparisonProducts: ["Canva", "Adobe Express", "Figma"],
    outputSpecification: {
      requiredOutcomes: [
        "brand kit",
        "layered editable canvas",
        "reusable template",
        "accessible typography and contrast",
        "multi-format variants",
        "linked asset replacement",
        "review history",
        "professional exports",
        "campaign and site handoff",
      ],
    },
    rubric: commonRubric,
    sourceReferences: [
      {
        label: "Canva brand tools",
        url: "https://www.canva.com/brand/",
        checkedAt: expandedCheckedAt,
      },
      {
        label: "Adobe Express",
        url: "https://www.adobe.com/express/",
        checkedAt: expandedCheckedAt,
      },
      {
        label: "Figma design",
        url: "https://www.figma.com/design/",
        checkedAt: expandedCheckedAt,
      },
    ],
  },
  {
    family: "podcasting",
    name: "Produce, host, distribute and learn from a professional podcast episode",
    targetUser:
      "A creator publishing an audio or video show that must preserve source quality, metadata, accessibility, distribution ownership and audience learning.",
    workflow:
      "Create a show, ingest or record an episode, edit the source, define chapters and an accessible transcript, attach rights and artwork, publish a standards-valid RSS episode with protected and public variants, verify playback, submit or deliver to an available directory, replace the media without breaking the episode identity, inspect analytics, and generate promotional derivatives.",
    comparisonProducts: [
      "Spotify for Creators",
      "Transistor",
      "Buzzsprout",
      "Riverside",
    ],
    outputSpecification: {
      requiredOutcomes: [
        "durable show identity",
        "edited episode",
        "chapters",
        "accessible transcript",
        "rights and artwork",
        "valid RSS",
        "public and protected access",
        "stable replacement",
        "playback analytics",
        "promotional derivatives",
      ],
    },
    rubric: commonRubric,
    sourceReferences: [
      {
        label: "Spotify for Creators",
        url: "https://creators.spotify.com/",
        checkedAt: expandedCheckedAt,
      },
      {
        label: "Transistor podcast hosting features",
        url: "https://transistor.fm/features/",
        checkedAt: expandedCheckedAt,
      },
      {
        label: "Apple Podcasts RSS requirements",
        url: "https://podcasters.apple.com/support/823-podcast-requirements",
        checkedAt: expandedCheckedAt,
      },
    ],
  },
  {
    family: "creator_site",
    name: "Launch an owned creator destination that converts and remains portable",
    targetUser:
      "A creator who needs a fast branded home for content, audience capture, offers and attribution without surrendering the underlying audience or assets.",
    workflow:
      "Select a theme, compose accessible responsive pages, connect the canonical profile and media library, publish a link hub and storefront offer, add an audience capture form with consent, configure metadata and a custom-domain contract, verify mobile performance and broken-link handling, trace a visitor to conversion, export the site content, and roll back a failed publication.",
    comparisonProducts: ["Linktree", "Beacons", "Stan", "Squarespace"],
    outputSpecification: {
      requiredOutcomes: [
        "branded responsive pages",
        "canonical profile and media",
        "link hub",
        "storefront offer",
        "consented audience capture",
        "SEO metadata",
        "custom-domain contract",
        "mobile performance",
        "conversion attribution",
        "portable export",
        "publication rollback",
      ],
    },
    rubric: commonRubric,
    sourceReferences: [
      {
        label: "Linktree features",
        url: "https://linktr.ee/s/features",
        checkedAt: expandedCheckedAt,
      },
      {
        label: "Beacons creator store",
        url: "https://beacons.ai/i/app-pages/store",
        checkedAt: expandedCheckedAt,
      },
      {
        label: "Squarespace websites",
        url: "https://www.squarespace.com/websites",
        checkedAt: expandedCheckedAt,
      },
    ],
  },
  {
    family: "commercial_growth",
    name: "Operate sponsorship, affiliate, booking and ticket revenue with accountable fulfillment",
    targetUser:
      "A creator business managing brand partnerships, referrals, appointments and paid events while preserving rights, evidence, finance and relationship context.",
    workflow:
      "Qualify a sponsor opportunity, issue a scoped proposal with rights and deliverables, approve a campaign, generate an attributable affiliate or referral link, accept a booking or ticket order, fulfill the promised work, reconcile invoice and commission states, process a cancellation or reversal safely, report verified performance, and create the renewal action.",
    comparisonProducts: [
      "Passionfroot",
      "GRIN",
      "impact.com",
      "Calendly",
      "Eventbrite",
    ],
    outputSpecification: {
      requiredOutcomes: [
        "qualified opportunity",
        "rights-aware proposal",
        "approved deliverables",
        "attributable referral",
        "booking or ticket entitlement",
        "fulfillment evidence",
        "invoice and commission reconciliation",
        "safe cancellation or reversal",
        "performance report",
        "renewal action",
      ],
    },
    rubric: commonRubric,
    sourceReferences: [
      {
        label: "Passionfroot creator partnerships",
        url: "https://www.passionfroot.me/",
        checkedAt: expandedCheckedAt,
      },
      {
        label: "impact.com partnership management",
        url: "https://impact.com/partnerships-management-platform/",
        checkedAt: expandedCheckedAt,
      },
      {
        label: "Eventbrite organizer features",
        url: "https://www.eventbrite.com/organizer/features/",
        checkedAt: expandedCheckedAt,
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
    family: "trust_operations",
    name: "Operate a multi-tenant creator platform through abuse, privacy and recovery events",
    targetUser:
      "A platform operator responsible for tenant isolation, user safety, privacy rights, evidence custody, incident response and dependable recovery across high-risk creative workflows.",
    workflow:
      "Exercise owner, staff, moderator, member and outsider roles across two tenants; attempt unauthorized reads and mutations; report and appeal abusive content; enforce consent withdrawal and a data request; verify secret and sensitive-field redaction; trigger rate limiting; trace an incident through logs and alerts; restore from a tested backup; revoke a compromised session and delegated app; and produce a complete audit packet without exposing another tenant.",
    comparisonProducts: [
      "OWASP ASVS",
      "SOC 2 SaaS operating controls",
      "Cloudflare security controls",
    ],
    outputSpecification: {
      requiredOutcomes: [
        "tenant isolation",
        "role enforcement",
        "moderation and appeal",
        "consent withdrawal",
        "data access and deletion workflow",
        "secret redaction",
        "rate limiting",
        "incident evidence",
        "tested restore",
        "session and app revocation",
        "complete audit packet",
      ],
      zeroTolerance: [
        "cross-tenant disclosure",
        "unrecoverable protected-data loss",
        "secret disclosure",
      ],
    },
    rubric: commonRubric,
    sourceReferences: [
      {
        label: "OWASP Application Security Verification Standard",
        url: "https://owasp.org/www-project-application-security-verification-standard/",
        checkedAt: expandedCheckedAt,
      },
      {
        label: "OWASP API Security Top 10",
        url: "https://owasp.org/API-Security/editions/2023/en/0x11-t10/",
        checkedAt: expandedCheckedAt,
      },
      {
        label: "NIST Cybersecurity Framework",
        url: "https://www.nist.gov/cyberframework",
        checkedAt: expandedCheckedAt,
      },
    ],
  },
  {
    family: "developer_ecosystem",
    name: "Authorize, operate, revoke and migrate a third-party CreativesOS integration",
    targetUser:
      "A creator business and an independent developer extending CreativesOS without gaining ambient access or creating irreversible data lock-in.",
    workflow:
      "Create a sandbox tenant, register an application, request the minimum delegated scopes, complete OAuth authorization, read and mutate only allowed resources through a versioned API and typed SDK, receive and verify a signed webhook with retry and replay protection, inspect usage and audit evidence, revoke the grant, prove subsequent denial, export canonical data, import it into a clean tenant, and reconcile counts and identifiers.",
    comparisonProducts: [
      "Zapier Developer Platform",
      "Shopify App Platform",
      "Stripe Apps",
      "GitHub Apps",
    ],
    outputSpecification: {
      requiredOutcomes: [
        "sandbox tenant",
        "registered application",
        "least-privilege delegated scopes",
        "OAuth authorization",
        "versioned API and typed SDK",
        "signed idempotent webhook",
        "usage and audit evidence",
        "complete revocation",
        "portable export",
        "reconciled import",
      ],
    },
    rubric: commonRubric,
    sourceReferences: [
      {
        label: "Zapier Developer Platform",
        url: "https://zapier.com/developer-platform",
        checkedAt: expandedCheckedAt,
      },
      {
        label: "Shopify app platform",
        url: "https://shopify.dev/docs/apps/build",
        checkedAt: expandedCheckedAt,
      },
      {
        label: "GitHub Apps documentation",
        url: "https://docs.github.com/en/apps/overview",
        checkedAt: expandedCheckedAt,
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

export const competitiveBenchmarkTemplates: BenchmarkTemplate[] =
  benchmarkTemplateInputs.map((template) => ({
    ...template,
    parityRequirements: buildParityRequirements(template),
  }));

for (const template of competitiveBenchmarkTemplates) {
  const validation = createBenchmarkDefinitionSchema.safeParse(template);
  if (!validation.success) {
    throw new Error(
      `Invalid competitive benchmark template ${template.family}: ${validation.error.message}`,
    );
  }
}

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
    .select({
      family: competitiveBenchmarkDefinitions.family,
      version: competitiveBenchmarkDefinitions.version,
      parityRequirements: competitiveBenchmarkDefinitions.parityRequirements,
    })
    .from(competitiveBenchmarkDefinitions)
    .where(eq(competitiveBenchmarkDefinitions.businessId, businessId));
  const upgrades = competitiveBenchmarkTemplates.flatMap((template) => {
    const versions = existing
      .filter((row) => row.family === template.family)
      .sort((left, right) => right.version - left.version);
    const latest = versions[0];
    return !latest || latest.parityRequirements.length === 0
      ? [{ ...template, version: (latest?.version ?? 0) + 1 }]
      : [];
  });
  if (upgrades.length === 0) return;
  await db
    .insert(competitiveBenchmarkDefinitions)
    .values(
      upgrades.map((template) => ({
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
    const [definitions, runs, assessments, remediations] = await Promise.all([
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
      db
        .select()
        .from(competitiveBenchmarkRemediations)
        .where(eq(competitiveBenchmarkRemediations.businessId, business.id))
        .orderBy(
          desc(competitiveBenchmarkRemediations.priority),
          desc(competitiveBenchmarkRemediations.updatedAt),
        ),
    ]);
    const latestDefinitions = definitions.filter(
      (definition, index) =>
        definitions.findIndex((candidate) => candidate.family === definition.family) === index,
    );
    return res.json(
      latestDefinitions.map((definition) => ({
        ...definition,
        runs: runs.filter((run) => run.definitionId === definition.id),
        assessments: assessments.filter(
          (assessment) => assessment.definitionId === definition.id,
        ),
        remediations: remediations.filter(
          (remediation) => remediation.definitionId === definition.id,
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

  app.post(
    "/api/benchmarks/runs/:id/evidence",
    attachUser,
    rateLimit({
      windowMs: 60_000,
      limit: 20,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
    async (req, res) => {
      const parsed = attachBenchmarkEvidenceSchema.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({
          message:
            parsed.error.issues[0]?.message ?? "Invalid benchmark evidence",
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
      const [asset] = await db
        .select()
        .from(assets)
        .where(
          and(
            eq(assets.id, parsed.data.assetId),
            eq(assets.businessId, run.businessId),
          ),
        )
        .limit(1);
      if (
        !asset ||
        asset.kind !== "download" ||
        asset.visibility !== "private" ||
        asset.status !== "ready"
      )
        return res
          .status(404)
          .json({ message: "Ready private evidence asset not found" });
      try {
        const sha256 = await sha256PrivateAsset(asset.storageKey);
        if (asset.sha256 !== sha256)
          await db
            .update(assets)
            .set({ sha256 })
            .where(eq(assets.id, asset.id));
        return res.json({
          kind: parsed.data.kind,
          uri: `asset://${asset.id}`,
          checksum: `sha256:${sha256}`,
          filename: asset.originalFilename,
          mimeType: asset.mimeType,
          sizeBytes: asset.sizeBytes,
        });
      } catch (error) {
        console.error("Unable to hash benchmark evidence:", error);
        return res
          .status(500)
          .json({ message: "Unable to verify benchmark evidence integrity" });
      }
    },
  );

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
    const evidenceError = await validateCustodiedEvidence(
      run.businessId,
      parsed.data.evidence,
    );
    if (evidenceError)
      return res.status(409).json({ message: evidenceError });
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
    const nativeEnvironment = benchmarkEnvironmentKey(native.environment);
    const comparisonEnvironment = benchmarkEnvironmentKey(
      comparison.environment,
    );
    if (
      !nativeEnvironment ||
      !comparisonEnvironment ||
      nativeEnvironment !== comparisonEnvironment
    ) {
      return res.status(409).json({
        message:
          "CreativesOS and comparison runs must use identical locked source, device, network, operator-skill, locale, and protocol conditions",
      });
    }
    const requiredCapabilities = definition.parityRequirements.filter(
      (requirement) =>
        requirement.comparisonProduct === comparison.comparisonProduct &&
        requirement.tier === "required_parity",
    );
    const requiredIds = new Set(requiredCapabilities.map((item) => item.id));
    const submittedIds = new Set(
      parsed.data.requirementResults.map((item) => item.requirementId),
    );
    const missing = requiredCapabilities.filter(
      (requirement) => !submittedIds.has(requirement.id),
    );
    const unknown = parsed.data.requirementResults.filter(
      (result) => !requiredIds.has(result.requirementId),
    );
    if (requiredCapabilities.length === 0 || missing.length > 0 || unknown.length > 0) {
      return res.status(409).json({
        message:
          "Assess every locked required-parity capability for the selected comparison product",
        missingRequirementIds: missing.map((item) => item.id),
        unknownRequirementIds: unknown.map((item) => item.requirementId),
      });
    }
    const nativeEvidenceKinds = new Set(native.evidence.map((item) => item.kind));
    const comparisonEvidenceKinds = new Set(
      comparison.evidence.map((item) => item.kind),
    );
    const ungrounded = parsed.data.requirementResults.filter((result) =>
      result.evidenceKinds.some(
        (kind) =>
          !nativeEvidenceKinds.has(kind) || !comparisonEvidenceKinds.has(kind),
      ),
    );
    if (ungrounded.length > 0) {
      return res.status(409).json({
        message:
          "Capability verdicts must reference evidence present in both locked runs",
        ungroundedRequirementIds: ungrounded.map((item) => item.requirementId),
      });
    }
    const passedCapabilityCount = parsed.data.requirementResults.filter(
      (item) => item.status === "passed",
    ).length;
    const failedCapabilityCount =
      parsed.data.requirementResults.length - passedCapabilityCount;
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
      requiredParityPassed: failedCapabilityCount === 0,
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
    const assessment = await db.transaction(async (tx) => {
      const [createdAssessment] = await tx
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
          requirementResults: parsed.data.requirementResults,
          requiredCapabilityCount: requiredCapabilities.length,
          passedCapabilityCount,
          failedCapabilityCount,
        })
        .returning();
      const requirementById = new Map(
        requiredCapabilities.map((requirement) => [requirement.id, requirement]),
      );
      for (const result of parsed.data.requirementResults) {
        const requirement = requirementById.get(result.requirementId)!;
        if (result.status === "failed") {
          const [remediation] = await tx
            .insert(competitiveBenchmarkRemediations)
            .values({
              businessId: definition.businessId,
              definitionId: definition.id,
              comparisonProduct: comparison.comparisonProduct!,
              requirementId: requirement.id,
              capability: requirement.capability,
              acceptanceCriterion: requirement.acceptanceCriterion,
              status: "open",
              priority: 100,
              lastFailureNote: result.note,
              lastFailedAssessmentId: createdAssessment.id,
              openedByUserId: req.dbUser!.id,
            })
            .onConflictDoUpdate({
              target: [
                competitiveBenchmarkRemediations.businessId,
                competitiveBenchmarkRemediations.definitionId,
                competitiveBenchmarkRemediations.comparisonProduct,
                competitiveBenchmarkRemediations.requirementId,
              ],
              set: {
                capability: requirement.capability,
                acceptanceCriterion: requirement.acceptanceCriterion,
                status: "open",
                lastFailureNote: result.note,
                failureCount: sql`${competitiveBenchmarkRemediations.failureCount} + 1`,
                lastFailedAssessmentId: createdAssessment.id,
                resolvedByAssessmentId: null,
                resolvedAt: null,
                updatedAt: new Date(),
              },
            })
            .returning();
          const [workItem] = await tx
            .insert(creativeWorkItems)
            .values({
              businessId: definition.businessId,
              createdByUserId: req.dbUser!.id,
              title: `Close ${comparison.comparisonProduct} parity gap: ${requirement.capability}`,
              description: `${requirement.acceptanceCriterion}\n\nLatest evidence: ${result.note}`,
              kind: "product_gap",
              status: "brief",
              priority: remediation.priority,
              channel: comparison.comparisonProduct,
              sourceType: "benchmark_remediation",
              sourceId: remediation.id,
              metadata: {
                benchmarkDefinitionId: definition.id,
                benchmarkFamily: definition.family,
                comparisonProduct: comparison.comparisonProduct,
                requirementId: requirement.id,
                remediationStatus: "open",
              },
            })
            .onConflictDoUpdate({
              target: [
                creativeWorkItems.businessId,
                creativeWorkItems.sourceType,
                creativeWorkItems.sourceId,
              ],
              targetWhere: sql`${creativeWorkItems.sourceId} is not null`,
              set: {
                title: `Close ${comparison.comparisonProduct} parity gap: ${requirement.capability}`,
                description: `${requirement.acceptanceCriterion}\n\nLatest evidence: ${result.note}`,
                kind: "product_gap",
                status: "brief",
                priority: remediation.priority,
                channel: comparison.comparisonProduct,
                completedAt: null,
                metadata: {
                  benchmarkDefinitionId: definition.id,
                  benchmarkFamily: definition.family,
                  comparisonProduct: comparison.comparisonProduct,
                  requirementId: requirement.id,
                  remediationStatus: "open",
                },
                updatedAt: new Date(),
              },
            })
            .returning();
          await tx
            .update(competitiveBenchmarkRemediations)
            .set({ workItemId: workItem.id, updatedAt: new Date() })
            .where(eq(competitiveBenchmarkRemediations.id, remediation.id));
        } else {
          const [resolved] = await tx
            .update(competitiveBenchmarkRemediations)
            .set({
              status: "resolved",
              resolvedByAssessmentId: createdAssessment.id,
              resolvedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(competitiveBenchmarkRemediations.definitionId, definition.id),
                eq(
                  competitiveBenchmarkRemediations.comparisonProduct,
                  comparison.comparisonProduct!,
                ),
                eq(
                  competitiveBenchmarkRemediations.requirementId,
                  requirement.id,
                ),
                ne(competitiveBenchmarkRemediations.status, "resolved"),
              ),
            )
            .returning();
          if (resolved?.workItemId) {
            await tx
              .update(creativeWorkItems)
              .set({
                status: "retrospective",
                completedAt: new Date(),
                version: sql`${creativeWorkItems.version} + 1`,
                updatedAt: new Date(),
              })
              .where(eq(creativeWorkItems.id, resolved.workItemId));
          }
        }
      }
      return createdAssessment;
    });
    return res.status(201).json(assessment);
  });

  app.patch("/api/benchmarks/remediations/:id", attachUser, async (req, res) => {
    const parsed = updateBenchmarkRemediationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.issues[0]?.message ?? "Invalid remediation update",
      });
    }
    const [remediation] = await db
      .select()
      .from(competitiveBenchmarkRemediations)
      .where(eq(competitiveBenchmarkRemediations.id, req.params.id))
      .limit(1);
    if (
      !remediation ||
      !(await userCanManageBusiness(req.dbUser!.id, remediation.businessId))
    ) {
      return res.status(404).json({ message: "Benchmark remediation not found" });
    }
    if (
      parsed.data.status &&
      !canTransitionBenchmarkRemediation(remediation.status, parsed.data.status)
    ) {
      return res.status(409).json({
        message: "A remediation can close only after a passing locked retest",
      });
    }
    const [updated] = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(competitiveBenchmarkRemediations)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(
          and(
            eq(competitiveBenchmarkRemediations.id, remediation.id),
            eq(competitiveBenchmarkRemediations.status, remediation.status),
          ),
        )
        .returning();
      if (!row) return [];
      if (row.workItemId) {
        const workStatus =
          row.status === "open"
            ? "brief"
            : row.status === "in_progress"
              ? "production"
              : "review";
        await tx
          .update(creativeWorkItems)
          .set({
            status: workStatus,
            priority: row.priority,
            assigneeUserId: row.assigneeUserId,
            dueAt: row.dueAt,
            completedAt: null,
            version: sql`${creativeWorkItems.version} + 1`,
            updatedAt: new Date(),
          })
          .where(eq(creativeWorkItems.id, row.workItemId));
      }
      return [row];
    });
    if (!updated) {
      return res.status(409).json({ message: "Remediation changed; refresh and retry" });
    }
    return res.json(updated);
  });
}
