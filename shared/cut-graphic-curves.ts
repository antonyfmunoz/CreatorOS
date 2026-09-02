import { z } from "zod";

export const CUT_GRAPHIC_CURVE_PROPERTIES = ["x", "y", "scale", "rotation", "opacity", "brightness", "saturation"] as const;
export const cutGraphicCurveEasingSchema = z.enum(["linear", "ease_in", "ease_out", "ease_in_out", "spring", "step"]);
const property = z.enum(CUT_GRAPHIC_CURVE_PROPERTIES);
const ranges: Record<z.infer<typeof property>, readonly [number, number]> = {
  x: [-4, 4], y: [-4, 4], scale: [.01, 8], rotation: [-3_600, 3_600], opacity: [0, 1], brightness: [0, 4], saturation: [0, 4],
};
const curve = z.object({
  property,
  base: z.number().finite(),
  keyframes: z.array(z.object({ frame: z.number().int().min(0).max(2_592_000), value: z.number().finite(), easing: cutGraphicCurveEasingSchema })).max(50),
}).superRefine((value, context) => {
  const [minimum, maximum] = ranges[value.property];
  if ([value.base, ...value.keyframes.map((point) => point.value)].some((number) => number < minimum || number > maximum)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: `Graphic ${value.property} curve exceeds its supported value range` });
  }
  if (value.keyframes.some((point, index) => index > 0 && point.frame <= value.keyframes[index - 1].frame)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Graphic curve frames must be ordered and unique" });
  }
});

/** Optional declarative metadata. Never a user-authored filter/executable string. */
export const cutGraphicCurvesSchema = z.object({
  version: z.literal(1),
  fps: z.number().int().min(1).max(120),
  durationInFrames: z.number().int().min(1).max(2_592_000),
  curves: z.array(curve).max(CUT_GRAPHIC_CURVE_PROPERTIES.length),
  transitions: z.array(z.object({
    phase: z.enum(["enter", "exit"]),
    kind: z.enum(["fade", "slide", "zoom"]),
    durationInFrames: z.number().int().min(1).max(3_600),
    easing: cutGraphicCurveEasingSchema.exclude(["step"]),
    direction: z.enum(["left", "right", "up", "down"]).optional(),
  })).max(2),
}).superRefine((value, context) => {
  if (new Set(value.curves.map((item) => item.property)).size !== value.curves.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "Graphic curve properties must be unique" });
  if (new Set(value.transitions.map((item) => item.phase)).size !== value.transitions.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "Graphic transition phases must be unique" });
  if (value.curves.some((item) => item.keyframes.some((point) => point.frame >= value.durationInFrames))) context.addIssue({ code: z.ZodIssueCode.custom, message: "Graphic curve frames must be inside the layer" });
});

export type CutGraphicCurves = z.infer<typeof cutGraphicCurvesSchema>;
export type CutGraphicCurveProperty = z.infer<typeof property>;

export function cutGraphicCurveProgress(value: number, easing: z.infer<typeof cutGraphicCurveEasingSchema>) {
  const progress = Math.max(0, Math.min(1, value));
  if (easing === "step") return progress < 1 ? 0 : 1;
  if (easing === "ease_in") return progress * progress;
  if (easing === "ease_out") return 1 - (1 - progress) ** 2;
  if (easing === "ease_in_out") return progress < .5 ? 2 * progress * progress : 1 - ((-2 * progress + 2) ** 2) / 2;
  if (easing === "spring") return Math.max(0, Math.min(1, 1 - Math.exp(-7 * progress) * Math.cos(10 * progress)));
  return progress;
}

export function evaluateCutGraphicCurve(model: CutGraphicCurves, property: CutGraphicCurveProperty, frame: number) {
  const curve = model.curves.find((item) => item.property === property);
  if (!curve) return undefined;
  const bounded = Math.max(0, Math.min(model.durationInFrames - 1, Math.floor(frame)));
  const before = [...curve.keyframes].reverse().find((point) => point.frame <= bounded) ?? curve.keyframes[0];
  const after = curve.keyframes.find((point) => point.frame >= bounded) ?? curve.keyframes.at(-1);
  let value = before && after ? before.frame === after.frame ? before.value
    : before.value + (after.value - before.value) * cutGraphicCurveProgress((bounded - before.frame) / (after.frame - before.frame), after.easing) : curve.base;
  for (const transition of model.transitions) {
    const progress = transition.phase === "enter" ? bounded / transition.durationInFrames : (bounded - (model.durationInFrames - transition.durationInFrames)) / transition.durationInFrames;
    const eased = cutGraphicCurveProgress(progress, transition.easing);
    const visible = transition.phase === "enter" ? eased : 1 - eased;
    if (property === "opacity" && transition.kind === "fade") value *= visible;
    if (property === "scale" && transition.kind === "zoom") value *= .72 + .28 * visible;
    if (transition.kind === "slide") {
      const direction = transition.direction ?? "right";
      if (property === "x" && ["left", "right"].includes(direction)) value += (direction === "left" ? -1 : 1) * (1 - visible) * .24;
      if (property === "y" && ["up", "down"].includes(direction)) value += (direction === "up" ? -1 : 1) * (1 - visible) * .24;
    }
  }
  return property === "opacity" ? Math.max(0, Math.min(1, value)) : value;
}
