export type CutProcessProgress = { frame?: number; seconds?: number; fps?: number; speed?: number; complete: boolean };

export function cutProcessProgressArgs(args: string[]) {
  return ["-progress", "pipe:1", "-stats_period", "1", "-nostats", ...args];
}

/** Parse only numeric FFmpeg progress fields, never source names/URLs/metadata. */
export function createCutProcessProgressParser(report: (progress: CutProcessProgress) => void) {
  let buffer = "";
  let record: Omit<CutProcessProgress, "complete"> = {};
  return (chunk: string) => {
    buffer += chunk;
    // Keep bounded state even if a child emits a malformed, unterminated line.
    if (buffer.length > 16_384) { buffer = buffer.slice(-16_384); buffer = buffer.slice(buffer.indexOf("\n") + 1); }
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim(); buffer = buffer.slice(newline + 1);
      const split = line.indexOf("="); const key = line.slice(0, split); const input = line.slice(split + 1).trim();
      if (split > 0 && line.length <= 160) {
        if (key === "progress" && (input === "continue" || input === "end")) {
          if (record.frame !== undefined || record.seconds !== undefined) report({ ...record, complete: input === "end" });
          record = {};
        } else if (/^\d+(?:\.\d+)?x?$/.test(input)) {
          const value = Number(input.replace(/x$/, ""));
          if (Number.isFinite(value) && value >= 0) {
            if (key === "frame" && Number.isSafeInteger(value) && value <= 100_000_000) record.frame = value;
            if (key === "out_time_us" && value <= 43_200_000_000) record.seconds = value / 1_000_000;
            if (key === "fps" && value <= 1_000_000) record.fps = value;
            if (key === "speed" && value <= 1_000_000) record.speed = value;
          }
        }
      }
      newline = buffer.indexOf("\n");
    }
  };
}

export function cutProcessProgressDisplay(progress: CutProcessProgress, duration: number) {
  const fraction = Number.isFinite(duration) && duration > 0 && progress.seconds !== undefined ? Math.min(1, progress.seconds / duration) : 0;
  const fields = [progress.frame !== undefined ? `frame ${progress.frame}` : "", progress.seconds !== undefined ? `${progress.seconds.toFixed(2)}s` : "", progress.speed !== undefined ? `${progress.speed.toFixed(2)}x` : ""].filter(Boolean);
  return { progress: .35 + .55 * fraction, detail: `Rendering edit${fields.length ? ` · ${fields.join(" · ")}` : ""}` };
}
