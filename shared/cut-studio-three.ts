import { z } from "zod";

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const cutThreePrimitiveDescriptorSchema = z.object({
  primitive: z.enum(["cube", "pyramid", "plane"]).default("cube"),
  color: color.default("#1d9bf0"),
  secondaryColor: color.default("#0b5f99"),
  edgeColor: color.default("#ffffff"),
  wireframe: z.boolean().default(false),
  depth: z.number().finite().min(0.1).max(4).default(1),
}).strict();

export type CutThreePrimitiveDescriptor = z.infer<typeof cutThreePrimitiveDescriptorSchema>;

export function parseCutThreePrimitiveStyle(style: Record<string, unknown>): CutThreePrimitiveDescriptor {
  return cutThreePrimitiveDescriptorSchema.parse({
    primitive: style.primitive,
    color: style.color,
    secondaryColor: style.secondaryColor,
    edgeColor: style.edgeColor,
    wireframe: style.wireframe,
    depth: style.depth,
  });
}

function polygon(points: string, fill: string, descriptor: CutThreePrimitiveDescriptor) {
  return `<polygon points="${points}" fill="${descriptor.wireframe ? "none" : fill}" stroke="${descriptor.edgeColor}" stroke-width="2" stroke-linejoin="round"/>`;
}

export function renderCutThreePrimitiveSvg(input: unknown) {
  const descriptor = cutThreePrimitiveDescriptorSchema.parse(input);
  const depth = 10 + descriptor.depth * 10;
  let geometry: string;
  if (descriptor.primitive === "pyramid") {
    geometry = [
      polygon(`50,8 ${12 + depth / 3},82 50,94`, descriptor.color, descriptor),
      polygon(`50,8 ${88 - depth / 3},82 50,94`, descriptor.secondaryColor, descriptor),
      polygon(`${12 + depth / 3},82 ${88 - depth / 3},82 50,94`, descriptor.color, descriptor),
    ].join("");
  } else if (descriptor.primitive === "plane") {
    geometry = [polygon(`8,${50 - depth / 2} 72,18 92,${50 + depth / 2} 28,82`, descriptor.color, descriptor), `<path d="M18 ${55 - depth / 2} L82 ${23 + depth / 2} M28 ${60 - depth / 2} L92 ${28 + depth / 2} M22 ${43 - depth / 3} L42 ${75 + depth / 3} M42 ${33 - depth / 3} L62 ${65 + depth / 3} M62 ${23 - depth / 3} L82 ${55 + depth / 3}" fill="none" stroke="${descriptor.edgeColor}" stroke-width="1" opacity=".65"/>`].join("");
  } else {
    const offset = Math.min(28, depth);
    geometry = [
      polygon(`18,${18 + offset} ${62 - offset / 3},${18 + offset} ${62 - offset / 3},82 18,82`, descriptor.color, descriptor),
      polygon(`18,${18 + offset} ${38 + offset},18 82,18 62,${18 + offset}`, descriptor.secondaryColor, descriptor),
      polygon(`${62 - offset / 3},${18 + offset} 82,18 82,${82 - offset} ${62 - offset / 3},82`, descriptor.secondaryColor, descriptor),
    ].join("");
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="${descriptor.primitive} primitive"><g>${geometry}</g></svg>`;
}
