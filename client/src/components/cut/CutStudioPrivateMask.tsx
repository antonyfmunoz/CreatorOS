import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useCutPreviewResource } from "./CutStudioPreviewReadiness";

export function CutStudioPrivateMask({ url, children }: { url: string; children: ReactNode }) {
  const readiness = useCutPreviewResource("Private layer mask", url);
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    setError(false); setLoaded(false);
    const image = new Image();
    image.onload = () => { if (active) { setLoaded(true); readiness("ready"); } };
    image.onerror = () => { if (active) { setError(true); readiness("error", "The private layer mask is unavailable."); } };
    image.src = url;
    return () => { active = false; image.onload = null; image.onerror = null; image.removeAttribute("src"); };
  }, [url, readiness]);
  const style: CSSProperties = {
    maskImage: `url("${url}")`, WebkitMaskImage: `url("${url}")`, maskMode: "luminance",
    maskSize: "100% 100%", WebkitMaskSize: "100% 100%", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat",
    opacity: loaded && !error ? 1 : 0,
  };
  return <><div className="absolute inset-0" data-private-mask={loaded && !error ? "ready" : "pending"} style={style}>{children}</div>{error && <span role="status" className="absolute inset-0 grid place-items-center bg-zinc-950/90 p-2 text-center text-xs text-amber-300">The private layer mask is unavailable.</span>}</>;
}

export function CutStudioMaskFailure({ message }: { message: string }) {
  const readiness = useCutPreviewResource("Layer mask", message);
  useEffect(() => { readiness("error", message); }, [message, readiness]);
  return <span role="status" className="absolute inset-0 grid place-items-center bg-zinc-950/90 p-2 text-center text-xs text-amber-300">{message}</span>;
}
