import { cutClipVolumeAt, cutTrackEffectiveGain, type CutClip, type CutEdl } from "./cut-studio";

export type CutPrimaryAudioPreviewItem = {
  clip: CutClip;
  track: string;
  sourceTime: number;
  speed: number;
  gain: number;
};

/**
 * Browser monitoring uses the same edited clock, routing gain and volume
 * automation as native audio. Side-chain ducking intentionally stays in the
 * rendered-preview path so an approximation cannot be mistaken for output.
 */
export function cutPrimaryAudioPreviewAt(edl: CutEdl, seconds: number) {
  const time = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const tracks = edl.tracks ?? [];
  const soloed = new Set(tracks.filter((track) => track.track.startsWith("a") && track.solo).map((track) => track.track));
  const items: CutPrimaryAudioPreviewItem[] = [];
  let requiresRenderedDucking = false;
  for (const clip of edl.clips) {
    const track = clip.track ?? "v1";
    if (!track.startsWith("a")) continue;
    const settings = tracks.find((item) => item.track === track);
    if (settings?.muted || (soloed.size > 0 && !soloed.has(track))) continue;
    const speed = clip.speed ?? 1;
    const localSeconds = time - (clip.timelineStart ?? 0);
    const duration = (clip.end - clip.start) / speed;
    if (localSeconds < 0 || localSeconds >= duration) continue;
    if (clip.duckUnderVoice) requiresRenderedDucking = true;
    items.push({
      clip,
      track,
      sourceTime: clip.start + localSeconds * speed,
      speed,
      gain: cutClipVolumeAt(clip, localSeconds, cutTrackEffectiveGain(track, tracks, edl.audioBuses)),
    });
  }
  return { items, requiresRenderedDucking };
}
