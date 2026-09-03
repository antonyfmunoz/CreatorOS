import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { renderCutAnimationFrames } from "../server/cut-animation-renderer";

async function run(command: string, args: string[]) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}: ${stderr.slice(-2_000)}`)));
  });
}

async function main() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "creativesos-animation-qualification-"));
  try {
    const fixture = path.resolve("tests/fixtures/cut-lottie-basic.json");
    const result = await renderCutAnimationFrames({ kind: "lottie", sourcePath: fixture, outputDirectory: path.join(temporary, "frames"), width: 128, height: 128, fps: 30, duration: 0.1 });
    const files = await fs.readdir(path.join(temporary, "frames"));
    if (files.length !== result.frameCount || result.frameCount !== 3) throw new Error("The renderer did not produce the exact expected frame sequence");
    const hashes: string[] = [];
    for (const filename of files.sort()) {
      const source = await fs.readFile(path.join(temporary, "frames", filename));
      const metadata = await sharp(source).metadata();
      if (metadata.width !== 128 || metadata.height !== 128 || metadata.hasAlpha !== true) throw new Error("The renderer produced an invalid RGBA frame");
      hashes.push(createHash("sha256").update(source).digest("hex"));
    }
    if (new Set(hashes).size < 2) throw new Error("The renderer did not advance the animation timeline");
    const encoded = path.join(temporary, "lottie-final.mp4");
    await run("ffmpeg", ["-y", "-f", "lavfi", "-i", "color=c=#111827:s=128x128:r=30:d=0.1", "-framerate", "30", "-i", result.pattern, "-filter_complex", "[0:v][1:v]overlay=0:0:format=auto", "-t", "0.1", "-c:v", "libx264", "-pix_fmt", "yuv420p", encoded]);
    const encodedStat = await fs.stat(encoded);
    if (encodedStat.size < 1_000) throw new Error("The final animation video artifact is unexpectedly small");
    const evidence: Array<Record<string, unknown>> = [{ kind: "lottie", frameCount: result.frameCount, width: 128, height: 128, uniqueFrames: new Set(hashes).size, encodedBytes: encodedStat.size }];
    const riveArgument = process.argv.indexOf("--rive");
    const riveFixture = riveArgument >= 0 ? process.argv[riveArgument + 1] : path.join(temporary, "qualified-rive-fixture.riv");
    if (riveArgument >= 0 && !riveFixture) throw new Error("--rive requires a private local Rive fixture path");
    if (riveArgument < 0) {
      const encodedFixture = await fs.readFile(path.resolve("e2e/fixtures/rive-look.base64.txt"), "utf8");
      await fs.writeFile(riveFixture!, Buffer.from(encodedFixture.trim(), "base64"));
    }
    if (riveFixture) {
      const riveResult = await renderCutAnimationFrames({ kind: "rive", sourcePath: path.resolve(riveFixture), outputDirectory: path.join(temporary, "rive-frames"), width: 128, height: 128, fps: 30, duration: 0.1 });
      const riveFiles = (await fs.readdir(path.join(temporary, "rive-frames"))).sort();
      if (riveFiles.length !== riveResult.frameCount) throw new Error("The Rive renderer did not produce the exact expected frame sequence");
      const riveHashes = await Promise.all(riveFiles.map(async (filename) => {
        const source = await fs.readFile(path.join(temporary, "rive-frames", filename));
        const metadata = await sharp(source).metadata();
        if (metadata.width !== 128 || metadata.height !== 128 || metadata.hasAlpha !== true) throw new Error("The Rive renderer produced an invalid RGBA frame");
        const pixels = await sharp(source).ensureAlpha().raw().toBuffer();
        let visiblePixels = 0;
        for (let offset = 3; offset < pixels.length; offset += 4) if (pixels[offset] > 0) visiblePixels += 1;
        if (!visiblePixels) throw new Error("The Rive renderer produced an empty transparent frame");
        return createHash("sha256").update(source).digest("hex");
      }));
      evidence.push({ kind: "rive", frameCount: riveResult.frameCount, width: 128, height: 128, uniqueFrames: new Set(riveHashes).size, everyFrameHasVisibleArtwork: true });
    }
    process.stdout.write(`${JSON.stringify({ status: "passed", evidence })}\n`);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Animation renderer qualification failed"}\n`);
  process.exitCode = 1;
});
