import { cutAudioBitrates } from "@shared/cut-render-encoding";
import type { CutRenderRequest } from "@shared/cut-studio";

export function CutStudioAudioEncoding({ value, onChange, format = "mp4" }: {
  value: CutRenderRequest["audioBitrateKbps"];
  onChange: (value: CutRenderRequest["audioBitrateKbps"]) => void;
  format?: CutRenderRequest["format"];
}) {
  return <label className="mt-3 block text-xs font-bold text-zinc-400">Audio bitrate
    <select aria-label="Render audio bitrate" value={value ?? "auto"}
      onChange={event => onChange(event.target.value === "auto" ? undefined : Number(event.target.value) as CutRenderRequest["audioBitrateKbps"])}
      className="mt-2 w-full rounded-xl border border-zinc-700 bg-black p-3 text-sm text-white">
      <option value="auto">Use quality profile</option>
      {cutAudioBitrates.map(bitrate => <option key={bitrate} value={bitrate}>{bitrate} kbps {format === "webm" ? "Opus" : "AAC"}</option>)}
    </select>
    <span className="mt-1 block text-[11px] font-normal leading-5 text-zinc-500">Choose the target audio bitrate independently of video quality. Higher targets use more storage; the measured bitrate can vary.</span>
  </label>;
}
