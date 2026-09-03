import { cutPrimaryTimeline } from "./cut-primary-timeline";
import { cutClipFades } from "./cut-clip-fades";
import { cutClipVolumeAt, cutTrackEffectiveGain, type CutEdl } from "./cut-studio";

export function cutPrimaryPreviewAt(edl: CutEdl, seconds: number) {
  const plan = cutPrimaryTimeline(edl);
  const time = Math.min(plan.duration, Math.max(0, Number.isFinite(seconds) ? seconds : 0));
  const segment = plan.segments.find((item) => time >= item.start && time < item.start + item.duration);
  const clip = segment?.clip;
  if (!segment || !clip) return { time, duration: plan.duration, clip: null, sourceTime: 0, speed: 1, gain: 0, opacity: 0 };
  const local = time - segment.start;
  const { fadeIn, fadeOut } = cutClipFades(clip, segment.duration, plan.segments.indexOf(segment), plan.segments.length);
  const fade = Math.min(1, fadeIn > 0 ? local / fadeIn : 1) * Math.min(1, fadeOut > 0 ? (segment.duration - local) / fadeOut : 1);
  const settings = edl.tracks?.find((track) => track.track === "v1");
  return { time, duration: plan.duration, clip, sourceTime: clip.start + local * (clip.speed ?? 1), speed: clip.speed ?? 1,
    opacity: fade, gain: settings?.muted ? 0 : fade * cutClipVolumeAt(clip, local, cutTrackEffectiveGain("v1", edl.tracks, edl.audioBuses)) };
}
