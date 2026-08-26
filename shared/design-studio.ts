import { z } from "zod";

const baseElement = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/), x: z.number().min(-20_000).max(20_000), y: z.number().min(-20_000).max(20_000), width: z.number().positive().max(20_000), height: z.number().positive().max(20_000), rotation: z.number().min(-360).max(360).default(0), opacity: z.number().min(0).max(1).default(1), locked: z.boolean().default(false), zIndex: z.number().int().min(0).max(10_000) }).strict();
const textElement = baseElement.extend({ type: z.literal("text"), text: z.string().max(20_000), fill: z.string().regex(/^#[0-9a-fA-F]{6}$/), fontSize: z.number().positive().max(1_000), fontFamily: z.string().min(1).max(120).default("Arial"), fontWeight: z.enum(["normal", "bold"]).default("normal"), align: z.enum(["left", "center", "right"]).default("left") });
const shapeElement = baseElement.extend({ type: z.literal("shape"), shape: z.enum(["rectangle", "ellipse", "line"]), fill: z.string().regex(/^#[0-9a-fA-F]{6}$/), stroke: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().default(null), strokeWidth: z.number().min(0).max(100).default(0), radius: z.number().min(0).max(1_000).default(0) });
const imageElement = baseElement.extend({ type: z.literal("image"), assetId: z.string().uuid(), sourceUrl: z.string().max(2_000).nullable().default(null), fit: z.enum(["cover", "contain", "fill"]).default("cover"), alt: z.string().max(500).default("") });
export const designElementSchema = z.discriminatedUnion("type", [textElement, shapeElement, imageElement]);
export const designDocumentSchema = z.object({ version: z.literal(1), pages: z.array(z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/), name: z.string().min(1).max(120), width: z.number().int().min(64).max(10_000), height: z.number().int().min(64).max(10_000), background: z.string().regex(/^#[0-9a-fA-F]{6}$/), elements: z.array(designElementSchema).max(1_000) }).strict()).min(1).max(100) }).strict().superRefine((document, context) => {
  const pageIds = new Set<string>();
  const elementIds = new Set<string>();
  document.pages.forEach((page, pageIndex) => {
    if (pageIds.has(page.id)) context.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate page id: ${page.id}`, path: ["pages", pageIndex, "id"] });
    pageIds.add(page.id);
    page.elements.forEach((element, elementIndex) => {
      if (elementIds.has(element.id)) context.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate element id: ${element.id}`, path: ["pages", pageIndex, "elements", elementIndex, "id"] });
      elementIds.add(element.id);
    });
  });
});
export type DesignDocument = z.infer<typeof designDocumentSchema>;
export type DesignElement = z.infer<typeof designElementSchema>;

export const createDesignProjectSchema = z.object({ name: z.string().trim().min(1).max(200), kind: z.enum(["thumbnail", "cover", "carousel", "social", "product_art", "lead_magnet", "custom"]), width: z.number().int().min(64).max(10_000), height: z.number().int().min(64).max(10_000), brandKitId: z.string().uuid().nullable().default(null), document: designDocumentSchema.optional() }).strict();
export const saveDesignSchema = z.object({ revision: z.number().int().positive(), document: designDocumentSchema }).strict();
export const designExportSchema = z.object({ format: z.enum(["svg", "png", "jpeg", "webp"]), pageId: z.string().min(1).max(80), visibility: z.enum(["public", "private"]).default("private"), quality: z.number().int().min(40).max(100).default(90), scale: z.number().min(0.25).max(4).default(1) }).strict();
export const designResizeSchema = z.object({ name: z.string().trim().min(1).max(200), width: z.number().int().min(64).max(10_000), height: z.number().int().min(64).max(10_000), mode: z.enum(["fit", "fill", "stretch"]).default("fit") }).strict();
export const designReviewCommentSchema = z.object({ reviewerName: z.string().trim().min(1).max(120), body: z.string().trim().min(1).max(5_000), pageId: z.string().min(1).max(80), x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict();
