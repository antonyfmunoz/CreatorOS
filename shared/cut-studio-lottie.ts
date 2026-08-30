import { z } from "zod";

const headerSchema = z.object({
  v: z.string().trim().min(1).max(40),
  fr: z.number().finite().min(1).max(120),
  ip: z.number().finite().min(-1_000_000).max(1_000_000),
  op: z.number().finite().min(-1_000_000).max(1_000_000),
  w: z.number().int().min(1).max(7_680),
  h: z.number().int().min(1).max(7_680),
  layers: z.array(z.unknown()).max(500),
  assets: z.array(z.unknown()).max(500).optional(),
}).passthrough().superRefine((value, context) => {
  if (value.op <= value.ip) context.addIssue({ code: z.ZodIssueCode.custom, path: ["op"], message: "Lottie out point must follow its in point" });
  if ((value.op - value.ip) / value.fr > 3_600) context.addIssue({ code: z.ZodIssueCode.custom, path: ["op"], message: "Lottie duration may not exceed one hour" });
});

const safeLayerTypes = new Set([0, 1, 3, 4, 5]);
const externalResource = /^(?:https?:|data:|javascript:|\/\/)/i;

function inspect(value: unknown, depth: number, budget: { nodes: number }) {
  if (depth > 80) throw new Error("Lottie nesting exceeds the safe limit");
  budget.nodes += 1;
  if (budget.nodes > 100_000) throw new Error("Lottie document exceeds the safe node limit");
  if (typeof value === "string") {
    if (value.length > 50_000) throw new Error("Lottie string exceeds the safe limit");
    if (externalResource.test(value.trim())) throw new Error("Lottie external resources are not allowed");
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    if (value.length > 20_000) throw new Error("Lottie array exceeds the safe limit");
    for (const item of value) inspect(item, depth + 1, budget);
    return;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 500) throw new Error("Lottie object exceeds the safe property limit");
  for (const [key, item] of entries) {
    if (key.length > 120) throw new Error("Lottie property name exceeds the safe limit");
    if (key === "__proto__" || key === "constructor" || key === "prototype") throw new Error("Lottie unsafe object properties are not allowed");
    if (key === "x" && typeof item === "string") throw new Error("Lottie expressions are not allowed");
    if ((key === "u" || key === "p" || key === "e") && typeof item === "string" && item.trim()) throw new Error("Lottie embedded or external assets are not allowed; convert artwork to shapes");
    inspect(item, depth + 1, budget);
  }
}

function inspectLayers(layers: unknown[], path: string) {
  for (let index = 0; index < layers.length; index += 1) {
    const layer = layers[index];
    if (!layer || typeof layer !== "object" || Array.isArray(layer)) throw new Error(`${path}[${index}] must be a layer object`);
    const type = (layer as Record<string, unknown>).ty;
    if (typeof type !== "number" || !safeLayerTypes.has(type)) throw new Error(`${path}[${index}] uses an unsupported layer type`);
  }
}

export function validateCutStudioLottie(input: unknown) {
  const parsed = headerSchema.parse(input);
  inspect(parsed, 0, { nodes: 0 });
  inspectLayers(parsed.layers, "layers");
  for (let index = 0; index < (parsed.assets ?? []).length; index += 1) {
    const asset = parsed.assets![index];
    if (!asset || typeof asset !== "object" || Array.isArray(asset)) throw new Error(`assets[${index}] must be an object`);
    const record = asset as Record<string, unknown>;
    if (record.p || record.u || record.e) throw new Error("Lottie image, footage and embedded assets are not allowed; convert artwork to shapes");
    if (Array.isArray(record.layers)) inspectLayers(record.layers, `assets[${index}].layers`);
  }
  return {
    animationData: parsed as Record<string, unknown>,
    width: parsed.w,
    height: parsed.h,
    frameRate: parsed.fr,
    inPoint: parsed.ip,
    outPoint: parsed.op,
    durationSeconds: (parsed.op - parsed.ip) / parsed.fr,
  };
}
