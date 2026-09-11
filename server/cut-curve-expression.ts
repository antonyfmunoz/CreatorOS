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
  if (timeVariable !== "t" && timeVariable !== "T") throw new Error("Graphic clock must be a supported native time variable");
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
  // Escape the escape character before separators. All operands above remain
  // generated from declarative numbers/enums, never public expression strings.
  return `(st(0,${frame});(${expression})*${multiplier}+${offset})`.replace(/\\/g, "\\\\").replace(/,/g, "\\,");
}

type GeometricRevealKind = "wipe" | "clock_wipe" | "iris";
type GeometricRevealDirection = "left" | "right" | "up" | "down" | "clockwise" | "counterclockwise" | undefined;

function geometricRevealAlpha(kind: GeometricRevealKind, direction: GeometricRevealDirection, progress: string, source = "alpha(X,Y)") {
  const bounded = `clip(${progress},0,1)`;
  if (kind === "iris") return `if(lte((X-W/2)*(X-W/2)+(Y-H/2)*(Y-H/2),(${bounded})*(${bounded})*(W*W+H*H)/4),${source},0)`;
  if (kind === "clock_wipe") {
    const angle = "mod(atan2(X-W/2,H/2-Y)+2*PI,2*PI)";
    return direction === "counterclockwise"
      ? `if(gte(${angle},2*PI-((${bounded})*2*PI)),${source},0)`
      : `if(lte(${angle},(${bounded})*2*PI),${source},0)`;
  }
  if (direction === "right") return `if(gte(X,W*(1-(${bounded}))),${source},0)`;
  if (direction === "up") return `if(gte(Y,H*(1-(${bounded}))),${source},0)`;
  if (direction === "down") return `if(lt(Y,H*(${bounded})),${source},0)`;
  return `if(lt(X,W*(${bounded})),${source},0)`;
}

/**
 * Per-frame alpha expression for validated declarative geometric reveals.
 * This deliberately accepts only the internal curve model and t/T clocks;
 * callers cannot provide arbitrary filter source or FFmpeg expression text.
 */
export function cutGraphicRevealAlphaExpression(model: CutGraphicCurves, timelineStart: number, timeVariable: "t" | "T") {
  if (!Number.isFinite(timelineStart)) throw new Error("Graphic reveal start must be finite");
  if (timeVariable !== "t" && timeVariable !== "T") throw new Error("Graphic reveal clock must be a supported native time variable");
  const transitions = model.transitions.filter((transition): transition is typeof transition & { kind: GeometricRevealKind } => ["wipe", "clock_wipe", "iris"].includes(transition.kind));
  if (!transitions.length) return undefined;
  const frame = `clip(floor((${timeVariable}-${timelineStart}+0.000001)*${model.fps}),0,${model.durationInFrames - 1})`;
  const reveal = (transition: typeof transitions[number]) => {
    const start = transition.phase === "enter" ? 0 : Math.max(0, model.durationInFrames - transition.durationInFrames);
    const progress = `(${frame}-${start})/${transition.durationInFrames}`;
    const eased = transition.easing === "ease_in" ? `(${progress})*(${progress})`
      : transition.easing === "ease_out" ? `1-(1-(${progress}))*(1-(${progress}))`
        : transition.easing === "ease_in_out" ? `if(lt(${progress},.5),2*(${progress})*(${progress}),1-((-2*(${progress})+2)*(-2*(${progress})+2))/2)`
          : transition.easing === "spring" ? `clip(1-exp(-7*(${progress}))*cos(10*(${progress})),0,1)`
            : progress;
    const visible = transition.phase === "enter" ? eased : `1-(${eased})`;
    const direction = transition.direction as GeometricRevealDirection;
    const mask = geometricRevealAlpha(transition.kind, direction, visible);
    return transition.phase === "enter"
      ? `if(lt(${frame},${transition.durationInFrames}),${mask},alpha(X,Y))`
      : `if(gte(${frame},${start}),${mask},alpha(X,Y))`;
  };
  const enter = transitions.find((transition) => transition.phase === "enter");
  const exit = transitions.find((transition) => transition.phase === "exit");
  // The player evaluates an active exit after enter and therefore its reveal
  // wins if the two transitions overlap. Keep that same precedence here.
  const enterExpression = enter ? reveal(enter) : "alpha(X,Y)";
  const expression = exit ? reveal(exit).replace(/alpha\(X,Y\)/g, enterExpression) : enterExpression;
  return expression.replace(/\\/g, "\\\\").replace(/,/g, "\\,");
}
