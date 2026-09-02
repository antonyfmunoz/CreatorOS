import { resolveCutTextLayout } from "@shared/cut-text-layout";
import fontLicenseUrl from "@shared/assets/cut-fonts/OFL.txt?url";

type Style = Record<string, string | number | boolean | null>;
const numeric = [
  ["lineHeight", "Line height", .8, 3, .1],
  ["letterSpacing", "Letter spacing", -5, 20, .25],
  ["paddingX", "Horizontal padding", 0, 200, 1],
  ["paddingY", "Vertical padding", 0, 200, 1],
  ["textRadius", "Text corner radius", 0, 100, 1],
] as const;

export function CutStudioTextLayoutControls({ style, font, onChange }: { style: Style; font?: { weight: number; style: "normal" | "italic" }; onChange(style: Style): void }) {
  const layout = resolveCutTextLayout(style, font);
  const field = "mt-1 w-full rounded border border-zinc-800 bg-black px-2 py-1.5 text-xs text-zinc-200";
  const set = (key: string, value: string | number) => onChange({ ...style, [key]: value });
  return <fieldset className="rounded-lg border border-zinc-800 p-2">
    <legend className="px-1 text-[10px] font-bold text-zinc-300">Text layout</legend>
    <div className="grid grid-cols-2 gap-2">
      <label className="text-[10px] text-zinc-500">Alignment<select aria-label="Text alignment" className={field} value={layout.align} onChange={(event) => set("textAlign", event.target.value)}>{["left", "center", "right"].map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="text-[10px] text-zinc-500">Vertical alignment<select aria-label="Text vertical alignment" className={field} value={layout.verticalAlign} onChange={(event) => set("verticalAlign", event.target.value)}>{["top", "middle", "bottom"].map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="text-[10px] text-zinc-500">Weight<select aria-label="Text font weight" className={field} value={layout.fontWeight} onChange={(event) => set("fontWeight", Number(event.target.value))}>{[100, 200, 300, 400, 500, 600, 700, 800, 900].map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="text-[10px] text-zinc-500">Style<select aria-label="Text font style" className={field} value={layout.fontStyle} onChange={(event) => set("fontStyle", event.target.value)}><option value="normal">Normal</option><option value="italic">Italic</option></select></label>
      {numeric.map(([key, label, min, max, step]) => <label key={key} className="text-[10px] text-zinc-500">{label}<input aria-label={label} className={field} type="number" min={min} max={max} step={step} value={key === "textRadius" ? layout.radius : layout[key]} onChange={(event) => { const value = Number(event.target.value); if (Number.isFinite(value)) set(key, Math.max(min, Math.min(max, value))); }}/></label>)}
    </div>
    <label className="mt-2 flex items-center gap-2 text-[10px] text-zinc-300"><input aria-label="Fit text to layer" type="checkbox" checked={layout.autoFit} onChange={(event) => onChange({ ...style, autoFit: event.target.checked })}/>Fit text to layer</label>
    {layout.autoFit && <div className="mt-2 grid grid-cols-2 gap-2"><label className="text-[10px] text-zinc-500">Minimum font size<input aria-label="Minimum fitted font size" className={field} type="number" min={8} max={layout.fontSize} value={layout.minimumFontSize} onChange={(event) => set("minimumFontSize", Math.max(8, Math.min(layout.fontSize, Number(event.target.value) || 8)))}/></label><label className="text-[10px] text-zinc-500">Maximum lines (0 = any)<input aria-label="Maximum fitted lines" className={field} type="number" min={0} max={20} value={layout.maxLines} onChange={(event) => set("maxLines", Math.max(0, Math.min(20, Math.round(Number(event.target.value) || 0))))}/></label></div>}
    <p className="mt-2 text-[9px] text-zinc-500">Line breaks and word wrapping are preserved. Sizes and padding use composition-canvas units.</p>
    <a className="mt-1 block text-[9px] text-zinc-500 underline" href={fontLicenseUrl} target="_blank" rel="noreferrer">Default content font: Noto Sans · OFL 1.1</a>
  </fieldset>;
}
