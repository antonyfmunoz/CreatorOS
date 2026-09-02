import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import type { CutTextLayout } from "@shared/cut-text-layout";
import { fitCutTextBox } from "@shared/cut-text-fit";

export function CutStudioTextPreview({ text, layout, styles, canvasWidth, fontsReady }: { text?: string; layout: CutTextLayout; styles: { box: CSSProperties; content: CSSProperties }; canvasWidth: number; fontsReady: boolean }) {
  const boxId = useId(); const contentId = useId();
  const box = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("off");
  const contract = JSON.stringify([text, layout, styles, canvasWidth]);
  useEffect(() => {
    const host = box.current;
    const content = document.getElementById(contentId);
    if (!host || !content) return;
    content.style.fontSize = String(styles.content.fontSize);
    if (!layout.autoFit) { setStatus("off"); return; }
    if (!fontsReady) { setStatus("waiting"); return; }
    const measure = () => {
      try {
        const result = fitCutTextBox({ boxId, contentId, maximum: String(styles.content.fontSize), minimum: `${Math.min(layout.minimumFontSize, layout.fontSize) / canvasWidth * 100}cqw`, maxLines: layout.maxLines });
        setStatus(result.fits ? "fit" : "overflow");
        content.dataset.fittedFontSize = String(result.fontSize);
      } catch { setStatus("overflow"); }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
    const canvas = host.closest('[aria-label="Composition canvas"]');
    if (canvas) observer.observe(canvas);
    return () => observer.disconnect();
  }, [boxId, contentId, contract, fontsReady]);
  return <><div id={boxId} ref={box} data-native-text-box data-text-fit={status} style={styles.box}><div id={contentId} data-native-text-content style={styles.content}>{text}</div></div>{layout.autoFit && status === "overflow" && <span role="status" className="absolute bottom-0 left-0 rounded bg-rose-950 px-1 text-[9px] text-white">Text does not fit at the minimum size</span>}</>;
}
