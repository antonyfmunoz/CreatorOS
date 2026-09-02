import type { CutGraphicCurves, CutGraphicCurveProperty } from "../shared/cut-graphic-curves";

function eased(progress: string, easing: CutGraphicCurves["curves"][number]["keyframes"][number]["easing"]) {
  // Per-expression scratch registers only; no state is carried across frames.
  const p = "ld(1)";
  const value = easing === "step" ? `if(lt(${p},1),0,1)`
    : easing === "ease_in" ? `${p}*${p}`
    : easing === "ease_out" ? `1-(1-${p})*(1-${p})`
    : easing === "ease_in_out" ? `if(lt(${p},0.5),2*${p}*${p},1-pow(-2*${p}+2,2)/2)`
    : easing === "spring" ? `clip(1-exp(-7*${p})*cos(10*${p}),0,1)` : p;
  return `(st(1,clip(${progress},0,1));${value})`;
}

/** Call only with schema-validated declarative metadata; never accepts code. */
export function cutGraphicCurveExpression(model: CutGraphicCurves, property: CutGraphicCurveProperty, timelineStart: number, timeVariable: "t" | "T", multiplier = 1, offset = 0) {
  if (![timelineStart, multiplier, offset].every(Number.isFinite)) throw new Error("Graphic expression parameters must be finite");
  const curve = model.curves.find((item) => item.property === property);
  if (!curve) return undefined;
  const points = curve.keyframes;
  const first = points[0]?.value ?? curve.base;
  const changesViaTransition = model.transitions.some((transition) =>
    (property === "opacity" && transition.kind === "fade") || (property === "scale" && transition.kind === "zoom") ||
    (["x", "y"].includes(property) && transition.kind === "slide"));
  if (!changesViaTransition && points.every((point) => point.value === first)) return String(first * multiplier + offset);
  let expression = String(points.at(-1)?.value ?? curve.base);
  for (let index = points.length - 2; index >= 0; index--) {
    const left = points[index], right = points[index + 1];
    const progress = `(ld(0)-${left.frame})/${right.frame - left.frame}`;
    const value = `${left.value}+(${right.value}-${left.value})*${eased(progress, right.easing)}`;
    expression = `if(lt(ld(0),${right.frame}),${value},${expression})`;
  }
  if (points.length > 1 && points[0].frame > 0) expression = `if(lt(ld(0),${points[0].frame}),${points[0].value},${expression})`;
  for (const transition of model.transitions) {
    const progress = transition.phase === "enter" ? `ld(0)/${transition.durationInFrames}` : `(ld(0)-${model.durationInFrames - transition.durationInFrames})/${transition.durationInFrames}`;
    const envelope = eased(progress, transition.easing);
    const visible = transition.phase === "enter" ? envelope : `(1-${envelope})`;
    if (property === "opacity" && transition.kind === "fade") expression = `(${expression})*(${visible})`;
    if (property === "scale" && transition.kind === "zoom") expression = `(${expression})*(0.72+0.28*(${visible}))`;
    if (transition.kind === "slide") {
      const direction = transition.direction ?? "right";
      if ((property === "x" && ["left", "right"].includes(direction)) || (property === "y" && ["up", "down"].includes(direction))) {
        expression = `(${expression})+${["left", "up"].includes(direction) ? "-" : ""}0.24*(1-(${visible}))`;
      }
    }
  }
  if (property === "opacity") expression = `clip(${expression},0,1)`;
  // Quantize to the authored frame grid, matching the public preview evaluator.
  // The main composition pipeline uses AVTB (one-microsecond ticks). Account
  // for that bounded quantization before flooring to the authored frame grid;
  // an FP-only epsilon can otherwise select the preceding frame at 30/60 fps.
  const frame = `clip(floor((${timeVariable}-${timelineStart}+0.000001)*${model.fps}),0,${model.durationInFrames - 1})`;
  return `(st(0,${frame});(${expression})*${multiplier}+${offset})`.replace(/,/g, "\\,");
}
