import { z } from "zod";

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const destinationUrl = z.string().trim().min(1).max(2_000).refine((value) => { if (value.startsWith("/") && !value.startsWith("//")) return true; try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; } }, "Use a safe HTTP(S) or site-relative URL");
const optionalDestinationUrl = z.string().trim().max(2_000).refine((value) => !value || destinationUrl.safeParse(value).success, "Use a safe HTTP(S) or site-relative URL");
export const creatorSiteThemeSchema = z.object({ background: color.default("#000000"), surface: color.default("#09090b"), text: color.default("#ffffff"), muted: color.default("#71717a"), accent: color.default("#1d9bf0"), radius: z.enum(["none", "small", "medium", "large", "pill"]).default("large"), font: z.enum(["sans", "serif", "mono"]).default("sans") }).strict();
export const creatorSiteSeoSchema = z.object({ title: z.string().trim().min(1).max(70), description: z.string().trim().max(180), imageAssetId: z.string().uuid().nullable().default(null), noIndex: z.boolean().default(false) }).strict();
export type CreatorSiteTheme = z.infer<typeof creatorSiteThemeSchema>;
export type CreatorSiteSeo = z.infer<typeof creatorSiteSeoSchema>;
export const createCreatorSiteSchema = z.object({ slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{2,62}$/), name: z.string().trim().min(1).max(120), tagline: z.string().trim().max(240).default(""), bio: z.string().trim().max(5_000).default(""), avatarAssetId: z.string().uuid().nullable().default(null), theme: creatorSiteThemeSchema, seo: creatorSiteSeoSchema }).strict();

const link = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/), label: z.string().trim().min(1).max(120), url: destinationUrl, description: z.string().trim().max(300).default(""), featured: z.boolean().default(false) }).strict();
const cardRef = z.object({ id: z.string().min(1).max(120), label: z.string().trim().min(1).max(160), description: z.string().trim().max(500).default(""), imageAssetId: z.string().uuid().nullable().default(null), url: destinationUrl }).strict();
export const creatorSiteSectionPayloadSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hero"), eyebrow: z.string().max(100).default(""), heading: z.string().min(1).max(240), body: z.string().max(2_000).default(""), ctaLabel: z.string().max(80).default(""), ctaUrl: optionalDestinationUrl.default("") }).strict(),
  z.object({ type: z.literal("links"), heading: z.string().max(160).default("Links"), links: z.array(link).max(100) }).strict(),
  z.object({ type: z.literal("media"), heading: z.string().max(160).default("Featured"), assetIds: z.array(z.string().uuid()).min(1).max(20) }).strict(),
  z.object({ type: z.enum(["offers", "memberships", "communities", "events"]), heading: z.string().max(160), items: z.array(cardRef).max(50) }).strict(),
  z.object({ type: z.literal("subscribe"), heading: z.string().max(160), body: z.string().max(1_000).default(""), formPublicId: z.string().min(1).max(160) }).strict(),
  z.object({ type: z.literal("embed"), heading: z.string().max(160).default(""), provider: z.enum(["youtube", "vimeo", "spotify", "creativesos"]), url: destinationUrl.refine((value) => !value.startsWith("/"), "Embeds require an absolute URL") }).strict(),
]);
export type CreatorSiteSectionPayload = z.infer<typeof creatorSiteSectionPayloadSchema>;
export const createCreatorSiteSectionSchema = z.object({ name: z.string().trim().min(1).max(120), payload: creatorSiteSectionPayloadSchema, sortOrder: z.number().int().min(0).max(10_000), visibility: z.enum(["public", "members", "hidden"]).default("public") }).strict();
export const creatorSiteRedirectSchema = z.object({ sourcePath: z.string().trim().regex(/^\/[a-zA-Z0-9/_-]{1,500}$/), targetUrl: z.string().trim().min(1).max(2_000), statusCode: z.union([z.literal(301), z.literal(302), z.literal(307), z.literal(308)]).default(302) }).strict();
