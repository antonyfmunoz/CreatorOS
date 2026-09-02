import type { CutCompositionManifest } from "@shared/cut-studio-production";

type MotionTemplateProject = { sourceAssetId: string; name: string; duration: number; mediaKind: "video" | "audio" };

export function motionTemplate(project: MotionTemplateProject, template: "kinetic" | "lower_third" | "product"): CutCompositionManifest {
  const fps = 30 as const;
  const durationInFrames = Math.max(30, Math.round(project.duration * fps));
  const titleText = template === "lower_third" ? "Name · Role" : template === "product" ? "Make the outcome unmistakable" : "Turn attention into momentum";
  const shared = { version: 1 as const, name: `${project.name} · ${template.replace("_", " ")}`, width: 1920, height: 1080, fps, durationInFrames, background: "#000000", parameters: [{ key: "headline", label: "Headline", type: "text" as const, defaultValue: titleText, required: true }], fonts: [], audioReactiveSignals: [], metadata: { template } };
  const source = { id: "source", kind: project.mediaKind, name: "Source", from: 0, durationInFrames, assetId: project.sourceAssetId, sourceStartFrame: 0, x: 0, y: 0, width: 1, height: 1, opacity: 1, rotation: 0, volume: 1, anchorX: .5, anchorY: .5, rotationX: 0, rotationY: 0, perspective: 0, blendMode: "normal" as const, style: {}, dataBindings: {}, effects: [], animations: [] };
  const graphicStartFrame = Math.min(15, durationInFrames - 1);
  const graphicDuration = Math.max(1, Math.min(template === "lower_third" ? 150 : 240, durationInFrames - graphicStartFrame));
  const graphic = {
    id: "hero_title", kind: "text" as const, name: template === "product" ? "Product promise" : "Hero title", from: graphicStartFrame, durationInFrames: graphicDuration, sourceStartFrame: 0,
    text: titleText, x: template === "lower_third" ? .08 : .15, y: template === "lower_third" ? .72 : .42, width: .72, height: .2, opacity: 1, rotation: 0, volume: 1, anchorX: .5, anchorY: .5, rotationX: 0, rotationY: 0, perspective: 0, blendMode: "normal" as const,
    style: { fontSize: template === "lower_third" ? 44 : 72, color: "#ffffff", backgroundColor: template === "kinetic" ? "#1d9bf0" : "#000000", backgroundOpacity: template === "kinetic" ? .88 : .72 }, dataBindings: { text: "headline" }, effects: template === "product" ? [{ id: "title_glow", kind: "glow" as const, enabled: true, parameters: { intensity: .4 } }] : [],
    enter: { kind: template === "kinetic" ? "zoom" as const : "slide" as const, durationInFrames: Math.min(15, graphicDuration), easing: "spring" as const, direction: template === "kinetic" ? "in" as const : "right" as const }, exit: { kind: "fade" as const, durationInFrames: Math.min(12, graphicDuration), easing: "ease_out" as const },
    animations: [{ property: "opacity" as const, keyframes: [{ frame: 0, value: 0, easing: "ease_out" as const }, { frame: Math.min(12, graphicDuration - 1), value: 1, easing: "ease_out" as const }] }, ...(template === "kinetic" ? [{ property: "scale" as const, keyframes: [{ frame: 0, value: .72, easing: "spring" as const }, { frame: Math.min(18, graphicDuration - 1), value: 1, easing: "spring" as const }] }] : [])],
  };
  return { ...shared, layers: [source, graphic] };
}
