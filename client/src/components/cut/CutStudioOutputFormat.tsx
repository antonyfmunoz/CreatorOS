import type { CutRenderRequest } from "@shared/cut-studio";

export function CutStudioOutputFormat({ value, onChange }: {
  value: NonNullable<CutRenderRequest["format"]>;
  onChange: (value: NonNullable<CutRenderRequest["format"]>) => void;
}) {
  return <label className="mt-3 block text-xs font-bold text-zinc-400">Export format
    <select aria-label="Render output format" value={value} onChange={event => onChange(event.target.value as typeof value)}
      className="mt-2 w-full rounded-xl border border-zinc-700 bg-black p-3 text-sm text-white">
      <option value="mp4">MP4 · H.264 + AAC</option>
      <option value="webm">WebM · VP9 + Opus</option>
    </select>
    <span className="mt-1 block text-[11px] font-normal leading-5 text-zinc-500">{value === "webm"
      ? "VP9 can take longer to encode. Check that your destination accepts WebM. This export does not preserve transparency."
      : "MP4 is the default for broad playback and publishing compatibility."}</span>
  </label>;
}
