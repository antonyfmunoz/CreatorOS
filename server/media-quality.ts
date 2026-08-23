import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type ProbeStream = {
  codec_type?: "video" | "audio";
  codec_name?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  start_time?: string;
  duration?: string;
};

type ProbePayload = {
  streams?: ProbeStream[];
  format?: { duration?: string };
};

export type MediaQualityEvidence = {
  video: {
    codec: string;
    width: number;
    height: number;
    fps: number;
    vmaf: number;
    ssim: number;
    psnrDb: number;
  };
  timing: {
    referenceDurationSeconds: number;
    candidateDurationSeconds: number;
    durationDriftSeconds: number;
    candidateAvStartOffsetSeconds: number | null;
  };
  audio: {
    codec: string | null;
    integratedLufs: number | null;
    loudnessRangeLu: number | null;
    truePeakDbfs: number | null;
  };
};

function finite(value: string | number | undefined, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function frameRate(value: string | undefined) {
  if (!value) return 0;
  const [numerator, denominator = "1"] = value.split("/");
  const divisor = finite(denominator, 1);
  return divisor ? finite(numerator) / divisor : 0;
}

function probe(filePath: string): ProbePayload {
  return JSON.parse(
    execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate,start_time,duration",
        "-of",
        "json",
        filePath,
      ],
      { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
    ),
  ) as ProbePayload;
}

function metricFromStderr(stderr: string, pattern: RegExp, label: string) {
  const matches = Array.from(stderr.matchAll(pattern));
  const value = Number(matches.at(-1)?.[1]);
  if (!Number.isFinite(value)) throw new Error(`FFmpeg did not report ${label}`);
  return value;
}

function ffmpegDiagnostics(args: string[], maxBuffer = 40 * 1024 * 1024, cwd?: string) {
  const result = spawnSync("ffmpeg", args, { encoding: "utf8", maxBuffer, windowsHide: true, cwd });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`FFmpeg quality analysis failed: ${result.stderr.slice(-2_000)}`);
  return result.stderr;
}

export function analyzeMediaQuality(referencePath: string, candidatePath: string): MediaQualityEvidence {
  const reference = probe(referencePath);
  const candidate = probe(candidatePath);
  const referenceVideo = reference.streams?.find((stream) => stream.codec_type === "video");
  const candidateVideo = candidate.streams?.find((stream) => stream.codec_type === "video");
  const candidateAudio = candidate.streams?.find((stream) => stream.codec_type === "audio");
  if (!referenceVideo || !candidateVideo) throw new Error("Reference and candidate must both contain video");
  if (!candidateVideo.width || !candidateVideo.height) throw new Error("Candidate video dimensions are unavailable");

  const qualityRoot = mkdtempSync(join(tmpdir(), "creativesos-media-quality-"));
  const vmafLog = join(qualityRoot, "vmaf.json");
  try {
    ffmpegDiagnostics(
      [
        "-hide_banner",
        "-loglevel",
        "info",
        "-i",
        referencePath,
        "-i",
        candidatePath,
        "-lavfi",
        `[0:v]scale=${candidateVideo.width}:${candidateVideo.height}:flags=lanczos,setpts=PTS-STARTPTS[reference];[1:v]setpts=PTS-STARTPTS[candidate];[reference][candidate]libvmaf=log_fmt=json:log_path=vmaf.json:n_threads=2`,
        "-f",
        "null",
        "-",
      ], 40 * 1024 * 1024, qualityRoot,
    );
    const vmafPayload = JSON.parse(readFileSync(vmafLog, "utf8")) as { pooled_metrics?: { vmaf?: { mean?: number } } };
    const vmaf = finite(vmafPayload.pooled_metrics?.vmaf?.mean, Number.NaN);
    if (!Number.isFinite(vmaf)) throw new Error("FFmpeg did not report VMAF");

    const ssimRun = ffmpegDiagnostics([
      "-hide_banner", "-i", referencePath, "-i", candidatePath, "-lavfi",
      `[0:v]scale=${candidateVideo.width}:${candidateVideo.height}:flags=lanczos,setpts=PTS-STARTPTS[reference];[1:v]setpts=PTS-STARTPTS[candidate];[reference][candidate]ssim`,
      "-f", "null", "-",
    ]);
    const psnrRun = ffmpegDiagnostics([
      "-hide_banner", "-i", referencePath, "-i", candidatePath, "-lavfi",
      `[0:v]scale=${candidateVideo.width}:${candidateVideo.height}:flags=lanczos,setpts=PTS-STARTPTS[reference];[1:v]setpts=PTS-STARTPTS[candidate];[reference][candidate]psnr`,
      "-f", "null", "-",
    ]);
    const diagnostics = `${ssimRun}\n${psnrRun}`;
    const ssim = metricFromStderr(diagnostics, /All:([\d.]+)/g, "SSIM");
    const psnrDb = metricFromStderr(diagnostics, /average:([\d.]+)/g, "PSNR");

    const referenceDurationSeconds = finite(reference.format?.duration);
    const candidateDurationSeconds = finite(candidate.format?.duration);
    const videoStart = finite(candidateVideo.start_time);
    const audioStart = candidateAudio ? finite(candidateAudio.start_time) : null;
    let audioEvidence: MediaQualityEvidence["audio"] = {
      codec: candidateAudio?.codec_name ?? null,
      integratedLufs: null,
      loudnessRangeLu: null,
      truePeakDbfs: null,
    };
    if (candidateAudio) {
      const stderr = ffmpegDiagnostics([
        "-hide_banner", "-nostats", "-i", candidatePath,
        "-filter_complex", "ebur128=peak=true", "-f", "null", "-",
      ], 20 * 1024 * 1024);
      const integrated = Array.from(stderr.matchAll(/\bI:\s*(-?[\d.]+) LUFS/g)).at(-1)?.[1];
      const range = Array.from(stderr.matchAll(/\bLRA:\s*([\d.]+) LU/g)).at(-1)?.[1];
      const peak = Array.from(stderr.matchAll(/\bPeak:\s*(-?[\d.]+) dBFS/g)).at(-1)?.[1];
      audioEvidence = {
        codec: candidateAudio.codec_name ?? null,
        integratedLufs: integrated === undefined ? null : finite(integrated),
        loudnessRangeLu: range === undefined ? null : finite(range),
        truePeakDbfs: peak === undefined ? null : finite(peak),
      };
    }

    return {
      video: {
        codec: candidateVideo.codec_name ?? "unknown",
        width: candidateVideo.width,
        height: candidateVideo.height,
        fps: frameRate(candidateVideo.avg_frame_rate),
        vmaf,
        ssim,
        psnrDb,
      },
      timing: {
        referenceDurationSeconds,
        candidateDurationSeconds,
        durationDriftSeconds: Math.abs(candidateDurationSeconds - referenceDurationSeconds),
        candidateAvStartOffsetSeconds: audioStart === null ? null : Math.abs(videoStart - audioStart),
      },
      audio: audioEvidence,
    };
  } finally {
    rmSync(qualityRoot, { recursive: true, force: true });
  }
}
