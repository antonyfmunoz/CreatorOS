// This entry point is container-only. Never import it into the application worker.
import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { zipSync, strToU8 } from 'fflate';
import { once } from 'node:events';
import { networkInterfaces } from 'node:os';
import { chromium } from 'playwright-core';
import { readCapsule, bundleCapsule } from './bundle.mjs';
import { validateRequest, outputContract, MAX_ARTIFACT_BYTES } from './request.mjs';

let browser;
let encoder;
let phase = 'input';
// The independent host watchdog remains authoritative if JavaScript stalls.
const deadline = setTimeout(() => process.exit(124), 110_000);
try {
  if (process.platform !== 'linux' || process.getuid() === 0 || process.env.CUT_CODE_CONTAINER !== '1') throw new Error('Container isolation is required.');
  const processStatus = await readFile('/proc/self/status', 'utf8');
  if (!/^NoNewPrivs:\s+1$/m.test(processStatus) || !/^Seccomp:\s+2$/m.test(processStatus) || !/^CapEff:\s+0+$/m.test(processStatus) || Object.keys(networkInterfaces()).some((name) => name !== 'lo')) throw new Error('Required operating-system isolation is absent.');
  if ((await stat('/input/request.json')).size > 70_000 || (await stat('/input/source.zip')).size > 25 * 1024 * 1024) throw new Error('Input limit exceeded.');
  const request = validateRequest(JSON.parse(await readFile('/input/request.json', 'utf8')));
  const output = outputContract(request);
  const requestSha256 = createHash('sha256').update(JSON.stringify(request)).digest('hex');
  const source = await readFile('/input/source.zip');
  const bundle = await bundleCapsule(readCapsule(source, request.entrypoint), request.entrypoint);
  phase = 'browser_start';
  browser = await chromium.launch({ headless: true, chromiumSandbox: true, args: ['--disable-dev-shm-usage'], timeout: 20_000 });
  const context = await browser.newContext({ viewport: { width: request.width, height: request.height }, deviceScaleFactor: 1, serviceWorkers: 'block', acceptDownloads: false, reducedMotion: 'reduce', locale: 'en-US', timezoneId: 'UTC', colorScheme: 'light' });
  await context.route('**/*', (route) => route.abort('blockedbyclient'));
  await context.routeWebSocket(/.*/, (socket) => socket.close());
  const page = await context.newPage();
  let pageFailed = false;
  // React effects and rejected promises can fail outside the synchronous render
  // callback. Such failures must not be turned into a successful blank artifact.
  page.on('pageerror', () => { pageFailed = true; });
  phase = 'render';
  page.on('dialog', (dialog) => void dialog.dismiss());
  context.on('page', (popup) => { if (popup !== page) void popup.close(); });
  page.setDefaultTimeout(10_000);
  const nonce = randomBytes(20).toString('base64');
  const csp = `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src 'none'; connect-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
  await page.setContent(`<html><head><meta http-equiv="Content-Security-Policy" content="${csp}"><style>html,body,#stage{margin:0;width:100%;height:100%;overflow:hidden}*{box-sizing:border-box}</style></head><body><div id="stage"></div><script nonce="${nonce}">${bundle.replaceAll('</script', '<\\/script')}</script></body></html>`, { waitUntil: 'domcontentloaded' });
  const config = { width: request.width, height: request.height, fps: request.fps, durationInFrames: request.durationInFrames };
  const outputPath = `/tmp/artifact.${output.extension}`;
  const sequence = Object.create(null);
  const sequenceFrames = [];
  let sequenceBytes = 0;
  let encoderDone;
  if (request.mode === 'video') {
    encoder = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-threads', '1', '-f', 'image2pipe', '-framerate', String(request.fps), '-i', 'pipe:0', '-an', '-c:v', 'libx264', '-threads', '1', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-fs', String(MAX_ARTIFACT_BYTES), outputPath], { stdio: ['pipe', 'ignore', 'ignore'] });
    encoder.stdin.on('error', () => {});
    encoderDone = once(encoder, 'close');
  }
  const first = output.start;
  const last = output.end + 1;
  for (let frame = first; frame < last; frame++) {
    await page.evaluate(async ({ frame, config, input }) => {
      window.__cutRenderFrame(frame, config, input);
      await document.fonts.ready;
      await Promise.all([...document.images].map((image) => image.decode()));
      // Time-dependent animation is not part of the frame-driven SDK contract.
      for (const animation of document.getAnimations()) { animation.pause(); animation.currentTime = frame * 1000 / config.fps; }
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, { frame, config, input: request.input });
    if (pageFailed) throw new Error('Composition execution failed.');
    let png = await page.screenshot({ type: request.format === 'jpeg' ? 'jpeg' : 'png', ...(request.format === 'jpeg' ? { quality: request.quality } : {}), omitBackground: request.mode !== 'video' && request.format !== 'jpeg', timeout: 10_000 });
    if (pageFailed) throw new Error('Composition execution failed.');
    if (png.length > MAX_ARTIFACT_BYTES) throw new Error('Frame output limit exceeded.');
    if (request.format === 'webp') {
      await writeFile('/tmp/frame.png', png);
      await promisify(execFile)('ffmpeg', ['-v', 'error', '-nostdin', '-y', '-threads', '1', '-i', '/tmp/frame.png', '-frames:v', '1', '-c:v', 'libwebp', '-threads', '1', '-quality', String(request.quality), '-fs', String(MAX_ARTIFACT_BYTES), '/tmp/frame.webp'], { timeout: 10_000, maxBuffer: 8192 });
      if ((await stat('/tmp/frame.webp')).size >= MAX_ARTIFACT_BYTES) throw new Error('Frame output limit exceeded.');
      png = await readFile('/tmp/frame.webp');
    }
    if (encoder) {
      if (!encoder.stdin.write(png)) await once(encoder.stdin, 'drain');
    } else if (request.mode === 'sequence') {
      sequenceBytes += png.length;
      if (sequenceBytes >= MAX_ARTIFACT_BYTES - 1024 * 1024) throw new Error('Image sequence exceeds its output limit.');
      const filename = `frame-${String(frame).padStart(6, '0')}.${request.format}`;
      sequence[filename] = png;
      sequenceFrames.push({ frame, filename, bytes: png.length, sha256: createHash('sha256').update(png).digest('hex') });
    } else await writeFile(outputPath, png, { flag: 'wx' });
  }
  if (encoder) {
    encoder.stdin.end();
    const [code] = await encoderDone;
    if (code !== 0) throw new Error('Video encoder failed.');
  }
  if (request.mode === 'sequence') {
    sequence['manifest.json'] = strToU8(JSON.stringify({ version: 1, requestSha256, width: request.width, height: request.height, fps: request.fps, format: request.format, start: first, end: last - 1, frames: sequenceFrames }));
    // Stable archive timestamps keep frame-sequence custody reproducible.
    const archive = zipSync(sequence, { level: 0, mtime: new Date('2020-01-01T00:00:00Z') });
    if (archive.length >= MAX_ARTIFACT_BYTES) throw new Error('Image sequence exceeds its output limit.');
    await writeFile(outputPath, archive, { flag: 'wx' });
  }
  await browser.close();
  browser = undefined;
  const size = (await stat(outputPath)).size;
  if (!size || size >= MAX_ARTIFACT_BYTES) throw new Error('Artifact output limit exceeded.');
  const artifact = await readFile(outputPath);
  const receipt = { version: 1, runtime: 'cut-code-prototype-v1', requestSha256, mode: request.mode, format: request.format, quality: request.quality, width: request.width, height: request.height, fps: request.fps, frames: last - first, start: first, end: last - 1, frame: request.mode === 'still' ? first : undefined, sourceSha256: createHash('sha256').update(source).digest('hex'), artifactSha256: createHash('sha256').update(artifact).digest('hex'), bytes: artifact.length, mediaType: output.mediaType, silent: request.mode === 'video', operatingSystem: { noNewPrivileges: true, seccomp: true, effectiveCapabilities: 'none', networkInterfaces: ['lo'] } };
  process.stdout.write(JSON.stringify({ receipt, artifact: artifact.toString('base64') }));
} catch (error) {
  // Capsule errors can contain source text. Never forward them into shared logs.
  process.stderr.write(`CutStudio isolated code render failed (${phase}).\n`);
  if (phase === 'browser_start') process.stderr.write(String(error?.message).slice(0, 4000));
  process.exitCode = 1;
} finally {
  encoder?.kill('SIGKILL');
  await browser?.close().catch(() => {});
  clearTimeout(deadline);
}
