import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { chromium, type Browser, type Page } from "playwright-core";

const require = createRequire(import.meta.url);
const MAX_ANIMATION_FRAMES = 3_600;
const MAX_ANIMATION_PIXELS = 3_840 * 2_160;

export type CutAnimationKind = "lottie" | "rive";

export function cutAnimationFrameCount(duration: number, fps: number) {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(fps) || fps < 1 || fps > 60) {
    throw new Error("Animation duration must be positive and frame rate must be between 1 and 60");
  }
  const frames = Math.ceil(duration * fps);
  if (!Number.isFinite(frames) || frames < 1 || frames > MAX_ANIMATION_FRAMES) {
    throw new Error(`Animation rendering is limited to ${MAX_ANIMATION_FRAMES} frames per layer`);
  }
  return frames;
}

async function chromiumExecutable(environment: NodeJS.ProcessEnv = process.env) {
  const candidates = [
    environment.CUT_ANIMATION_CHROMIUM_PATH,
    process.platform === "win32" && environment.PROGRAMFILES ? path.join(environment.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe") : undefined,
    process.platform === "win32" && environment["PROGRAMFILES(X86)"] ? path.join(environment["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe") : undefined,
    process.platform === "win32" && environment.LOCALAPPDATA ? path.join(environment.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe") : undefined,
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Continue through the bounded allowlist of known browser locations.
    }
  }
  throw new Error("The isolated animation renderer requires Chromium");
}

async function launchRenderer() {
  return chromium.launch({
    executablePath: await chromiumExecutable(),
    headless: true,
    args: [
      "--disable-background-networking",
      "--disable-breakpad",
      "--disable-component-update",
      "--disable-dev-shm-usage",
      "--disable-sync",
      "--metrics-recording-only",
      "--no-first-run",
    ],
  });
}

async function prepareLottie(page: Page, sourcePath: string, width: number, height: number) {
  const source = JSON.parse(await fs.readFile(sourcePath, "utf8")) as unknown;
  await page.setContent(`<style>html,body,#stage{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:transparent}</style><div id="stage"></div>`);
  await page.addScriptTag({ path: require.resolve("lottie-web/build/player/lottie_svg.min.js") });
  await page.evaluate(async (animationData) => {
    const runtime = (window as unknown as { lottie: { loadAnimation(input: Record<string, unknown>): { addEventListener(name: string, callback: () => void): void; goToAndStop(frame: number, isFrame: boolean): void; destroy(): void } } }).lottie;
    await new Promise<void>((resolve, reject) => {
      const animation = runtime.loadAnimation({ container: document.getElementById("stage")!, renderer: "svg", loop: true, autoplay: false, animationData });
      animation.addEventListener("DOMLoaded", () => {
        (window as unknown as { __cutAnimation: typeof animation }).__cutAnimation = animation;
        resolve();
      });
      animation.addEventListener("data_failed", () => reject(new Error("Lottie data could not be loaded")));
    });
  }, source);
}

async function prepareRive(page: Page, sourcePath: string, width: number, height: number) {
  const wasmPath = require.resolve("@rive-app/canvas-lite/rive.wasm");
  await page.route("https://cutstudio.invalid/rive.wasm", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/wasm", body: await fs.readFile(wasmPath) });
  });
  await page.setContent(`<style>html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:transparent}canvas{display:block;width:${width}px;height:${height}px}</style><canvas id="stage" width="${width}" height="${height}"></canvas>`);
  await page.addScriptTag({ path: require.resolve("@rive-app/canvas-lite/rive.js") });
  const source = (await fs.readFile(sourcePath)).toString("base64");
  await page.evaluate((encoded) => { (window as unknown as { __cutRiveSource: string }).__cutRiveSource = encoded; }, source);
  // Evaluate the runtime bootstrap as native browser JavaScript. Transpilers
  // may otherwise inject module-scoped helper names into serialized callbacks.
  await page.evaluate(`new Promise((resolve, reject) => {
    const runtime = window.rive;
    runtime.RuntimeLoader.setWasmUrl("https://cutstudio.invalid/rive.wasm");
    const bytes = Uint8Array.from(atob(window.__cutRiveSource), function (character) { return character.charCodeAt(0); });
    const animation = new runtime.Rive({
      canvas: document.getElementById("stage"),
      buffer: bytes.buffer,
      autoplay: false,
      enableRiveAssetCDN: false,
      automaticallyHandleEvents: false,
      shouldDisableRiveListeners: true,
      onLoad: function () {
        animation.resizeDrawingSurfaceToCanvas(1);
        animation.pause();
        window.__cutRive = animation;
        delete window.__cutRiveSource;
        resolve();
      },
      onLoadError: function () { reject(new Error("Rive data could not be loaded")); }
    });
  })`);
}

async function seekFrame(page: Page, kind: CutAnimationKind, frame: number, fps: number) {
  await page.evaluate(({ animationKind, frameNumber, frameRate }) => {
    if (animationKind === "lottie") {
      (window as unknown as { __cutAnimation: { goToAndStop(frame: number, isFrame: boolean): void } }).__cutAnimation.goToAndStop(frameNumber, true);
    } else {
      const animation = (window as unknown as { __cutRive: { animationNames: string[]; scrub(name: string, value: number): void } }).__cutRive;
      const name = animation.animationNames[0];
      if (name) animation.scrub(name, frameNumber / frameRate);
    }
    return new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }, { animationKind: kind, frameNumber: frame, frameRate: fps });
}

export async function renderCutAnimationFrames(input: {
  kind: CutAnimationKind;
  sourcePath: string;
  outputDirectory: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
}) {
  if (!Number.isInteger(input.width) || !Number.isInteger(input.height) || input.width < 2 || input.height < 2 || input.width * input.height > MAX_ANIMATION_PIXELS) {
    throw new Error("Animation render dimensions exceed the isolated renderer budget");
  }
  const frameCount = cutAnimationFrameCount(input.duration, input.fps);
  await fs.mkdir(input.outputDirectory, { recursive: true });
  let browser: Browser | null = null;
  try {
    browser = await launchRenderer();
    const context = await browser.newContext({ viewport: { width: input.width, height: input.height }, deviceScaleFactor: 1, serviceWorkers: "block" });
    const page = await context.newPage();
    await page.route("**/*", async (route) => {
      if (route.request().url() === "https://cutstudio.invalid/rive.wasm") return route.continue();
      return route.abort("blockedbyclient");
    });
    if (input.kind === "lottie") await prepareLottie(page, input.sourcePath, input.width, input.height);
    else await prepareRive(page, input.sourcePath, input.width, input.height);
    for (let frame = 0; frame < frameCount; frame += 1) {
      await seekFrame(page, input.kind, frame, input.fps);
      // The stage is exactly the fixed viewport. seekFrame has already waited
      // for two paint frames; repeating locator visibility/stability waits for
      // every exported frame slows all animation-heavy variant batches.
      await page.screenshot({ path: path.join(input.outputDirectory, `frame-${String(frame).padStart(6, "0")}.png`), clip: { x: 0, y: 0, width: input.width, height: input.height }, omitBackground: true });
    }
    await context.close();
    return { frameCount, pattern: path.join(input.outputDirectory, "frame-%06d.png") };
  } finally {
    await browser?.close().catch(() => undefined);
  }
}
