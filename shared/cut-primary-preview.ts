import { cutPrimaryTimeline } from "./cut-primary-timeline";
import { cutClipFades } from "./cut-clip-fades";
import { cutClipVolumeAt, cutTrackEffectiveGain, type CutClip, type CutEdl, type CutRenderRequest } from "./cut-studio";

function fadeAt(clip: CutClip, local: number, duration: number, index: number, count: number) {
  const { fadeIn, fadeOut } = cutClipFades(clip, duration, index, count);
  return Math.min(1, fadeIn > 0 ? local / fadeIn : 1) * Math.min(1, fadeOut > 0 ? (duration - local) / fadeOut : 1);
}

export function cutPrimaryPreviewAt(edl: CutEdl, seconds: number, fps: CutRenderRequest["fps"] = 30) {
  if (![24, 25, 30, 50, 60].includes(fps)) throw new Error("Unsupported primary preview frame rate");
  const plan = cutPrimaryTimeline(edl);
  const time = Math.min(plan.duration, Math.max(0, Number.isFinite(seconds) ? seconds : 0));
  const segment = plan.segments.find((item) => time >= item.start && time < item.start + item.duration);
  const clip = segment?.clip;
  if (!segment || !clip) return { time, duration: plan.duration, clip: null, sourceTime: 0, speed: 1, gain: 0, opacity: 0, mix: 1, outgoing: null };
  const local = time - segment.start;
  const index = plan.segments.indexOf(segment), count = plan.segments.length;
  const fade = fadeAt(clip, local, segment.duration, index, count);
  const previous = plan.segments[index - 1];
  const dissolveDuration = clip.transition === "cross_dissolve" && previous ? Math.min(.35, previous.duration / 2, segment.duration / 2) : 0;
  const mix = dissolveDuration > 0 ? Math.min(1, local / dissolveDuration) : 1;
  let outgoing: { clip: CutClip; sourceTime: number; opacity: number } | null = null;
  // Native export pads the prior edited frame, not continuing source motion.
  // Its audio pad is silence, so only the incoming source ramps into this span.
  if (mix < 1 && previous?.clip) {
    const last = Math.max(0, Math.ceil(previous.duration * fps) - 1) / fps;
    outgoing = { clip: previous.clip, sourceTime: previous.clip.start + last * (previous.clip.speed ?? 1),
      opacity: fadeAt(previous.clip, last, previous.duration, index - 1, count) };
  }
  const settings = edl.tracks?.find((track) => track.track === "v1");
  return { time, duration: plan.duration, clip, sourceTime: clip.start + local * (clip.speed ?? 1), speed: clip.speed ?? 1,
    opacity: fade, mix, outgoing, gain: settings?.muted ? 0 : fade * mix * cutClipVolumeAt(clip, local, cutTrackEffectiveGain("v1", edl.tracks, edl.audioBuses)) };
}
