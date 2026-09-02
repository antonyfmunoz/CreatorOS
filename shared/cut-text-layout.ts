import { z } from "zod";
export const CUT_NATIVE_TEXT_MAX_CHARACTERS = 2_000;

export const cutTextLayoutSchema = z.object({
  version: z.literal(1).default(1),
  fontSize: z.number().finite().min(8).max(400).default(48),
  fontWeight: z.number().int().min(100).max(900).multipleOf(100).default(700),
  fontStyle: z.enum(["normal", "italic"]).default("normal"),
  fontFaceStyle: z.enum(["normal", "italic"]).default("normal"),
  fontFaceWeight: z.number().int().min(100).max(900).optional(),
  align: z.enum(["left", "center", "right"]).default("left"),
  verticalAlign: z.enum(["top", "middle", "bottom"]).default("top"),
  lineHeight: z.number().finite().min(.8).max(3).default(1.2),
  letterSpacing: z.number().finite().min(-5).max(20).default(0),
  paddingX: z.number().finite().min(0).max(200).default(12),
  paddingY: z.number().finite().min(0).max(200).default(8),
  radius: z.number().finite().min(0).max(100).default(4),
});
export type CutTextLayout = z.infer<typeof cutTextLayoutSchema>;

const bounded = (value: unknown, fallback: number, minimum: number, maximum: number) => typeof value === "number" && Number.isFinite(value) ? Math.max(minimum, Math.min(maximum, value)) : fallback;

export function resolveCutTextLayout(style: Record<string, unknown>, font?: { weight: number; style: "normal" | "italic" }) {
  return cutTextLayoutSchema.parse({
    fontSize: bounded(style.fontSize, 48, 8, 400),
    fontWeight: Math.round(bounded(style.fontWeight, 700, 100, 900) / 100) * 100,
    fontStyle: style.fontStyle === "italic" || style.fontStyle === "normal" ? style.fontStyle : font?.style ?? "normal",
    fontFaceStyle: font?.style ?? "normal",
    fontFaceWeight: font?.weight,
    align: ["left", "center", "right"].includes(String(style.textAlign)) ? style.textAlign : "left",
    verticalAlign: ["top", "middle", "bottom"].includes(String(style.verticalAlign)) ? style.verticalAlign : "top",
    lineHeight: bounded(style.lineHeight, 1.2, .8, 3),
    letterSpacing: bounded(style.letterSpacing, 0, -5, 20),
    paddingX: bounded(style.paddingX, 12, 0, 200), paddingY: bounded(style.paddingY, 8, 0, 200),
    radius: bounded(style.textRadius, 4, 0, 100),
  });
}

// One CSS layout contract for the interactive preview and native text raster.
// The only unit difference is container width (preview) versus output pixels.
export function cutTextStyles(layout: CutTextLayout, referenceWidth: number, deliveryWidth: number | "container", fontFamily: string, color: string, background: string) {
  const measure = (value: number) => deliveryWidth === "container" ? `${value / referenceWidth * 100}cqw` : `${value * deliveryWidth / referenceWidth}px`;
  return {
    box: { width: "100%", height: "100%", boxSizing: "border-box", overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: layout.verticalAlign === "middle" ? "center" : layout.verticalAlign === "bottom" ? "flex-end" : "flex-start", padding: `${measure(layout.paddingY)} ${measure(layout.paddingX)}`, borderRadius: measure(layout.radius), background },
    content: { flexShrink: "0", width: "100%", margin: "0", whiteSpace: "pre-wrap", overflowWrap: "anywhere", wordBreak: "normal", color, fontFamily, fontSize: measure(layout.fontSize), fontWeight: String(layout.fontWeight), fontStyle: layout.fontStyle, lineHeight: String(layout.lineHeight), letterSpacing: measure(layout.letterSpacing), textAlign: layout.align },
  };
}
