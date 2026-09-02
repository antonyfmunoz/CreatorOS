// This entry point is container-only. Never import it into the application worker.
import { readFile, writeFile, stat, rename } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { zipSync, strToU8 } from 'fflate';
import { once } from 'node:events';
import { networkInterfaces } from 'node:os';
import { chromium } from 'playwright-core';
import { readCapsule, bundleCapsule } from './bundle.mjs';
import { validateRequest, outputContract, MAX_ARTIFACT_BYTES } from './request.mjs';
import { audioPlan, mixAudioTracks, prepareAudioTracks, soundtrackInputOptions } from './audio.mjs';
import { videoAudioCatalogEntry, videoSourceAudioSample } from './video-source-audio.mjs';
import { videoEncodingArgs } from './video-encoding.mjs';
import { FrameAudioCollector } from './frame-audio.mjs';
import { PrivateVideoFrames } from './video-frames.mjs';

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
  const capsule = readCapsule(source, request.entrypoint);
  phase = 'audio_probe';
  const hasSoundtrack = ['video', 'audio'].includes(request.mode);
  const preparedAudio = hasSoundtrack ? await prepareAudioTracks(request, capsule) : [];
  const outputPath = `/tmp/artifact.${output.extension}`;
  const first = output.start;
  const last = output.end + 1;
  let audioTrackCount = 0;
  let compositionAudioReceipt;
  if (request.mode === 'audio') {
    // Only explicit data tracks are mixed. Capsule code is neither bundled nor
    // executed, and no browser is started for a soundtrack-only request.
    phase = 'audio_mix';
    audioTrackCount = await mixAudioTracks(request, capsule, undefined, outputPath, preparedAudio);
  } else {
  phase = 'bundle';
  const bundle = await bundleCapsule(capsule, request.entrypoint);
  const privateVideo = new PrivateVideoFrames(bundle.videoImports, capsule);
  const videoAudioCatalog = [];
  if (request.compositionAudio) {
    if (bundle.videoImports.length > 8) throw new Error('At most eight private video imports support automatic source sound.');
    for (const file of bundle.videoImports) {
      const extension = file.toLowerCase().endsWith('.mp4') ? 'mp4' : 'webm';
      const filename = `/tmp/video-audio-import-${videoAudioCatalog.length}.${extension}`;
      await writeFile(filename, capsule[file], { flag: 'wx' });
      const probe = JSON.parse((await promisify(execFile)('ffprobe', ['-v', 'error', ...soundtrackInputOptions(file), '-show_entries', 'stream=codec_type,sample_rate,channels,start_time,duration:format=start_time,duration', '-of', 'json', filename], { timeout: 8_000, maxBuffer: 16_384 })).stdout);
      videoAudioCatalog.push(videoAudioCatalogEntry(file, capsule[file], probe));
    }
  }
  phase = 'browser_start';
  // Use grayscale text coverage instead of LCD subpixel coverage: opacity and
  // transformed layers otherwise allow prior compositor paint state to change
  // a later frame's edge pixels. This does not relax Chromium's sandbox.
  browser = await chromium.launch({ headless: true, chromiumSandbox: true, args: ['--disable-dev-shm-usage', '--disable-lcd-text'], timeout: 20_000 });
  const context = await browser.newContext({ viewport: { width: request.width, height: request.height }, deviceScaleFactor: 1, serviceWorkers: 'block', acceptDownloads: false, reducedMotion: 'reduce', locale: 'en-US', timezoneId: 'UTC', colorScheme: 'light' });
  await context.route('**/*', (route) => route.abort('blockedbyclient'));
  await context.routeWebSocket(/.*/, (socket) => socket.close());
  const page = await context.newPage();
  let pageFailed = false;
  // React effects and rejected promises can fail outside the synchronous render
  // callback. Such failures must not be turned into a successful blank artifact.
  page.on('pageerror', () => {
    pageFailed = true;
    // Reject an outstanding preparation/media wait immediately. Otherwise a
    // failed effect can leave a held frame burning its whole remaining budget.
    // Never wait for authored beforeunload handlers or forward exception text.
    void page.close({ runBeforeUnload: false }).catch(() => {});
  });
  phase = 'render';
  page.on('dialog', (dialog) => void dialog.dismiss());
  context.on('page', (popup) => { if (popup !== page) void popup.close(); });
  page.setDefaultTimeout(10_000);
  const nonce = randomBytes(20).toString('base64');
  const csp = `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data:; connect-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
  await page.setContent(`<html><head><meta http-equiv="Content-Security-Policy" content="${csp}"><style>html,body,#stage{margin:0;width:100%;height:100%;overflow:hidden}*{box-sizing:border-box}</style></head><body><div id="stage"></div></body></html>`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ javascript, stylesheet, nonce, videoSources }) => {
    window.__cutVideoSources = videoSources;
    if (stylesheet) {
      const style = document.createElement('style');
      style.textContent = stylesheet;
      document.head.appendChild(style);
    }
    // Capsule JavaScript intentionally executes only inside this no-network,
    // sandboxed browser. Neither source nor CSS passes through an HTML parser.
    const script = document.createElement('script');
    script.nonce = nonce;
    script.textContent = javascript;
    document.body.appendChild(script);
  }, { ...bundle, nonce, videoSources: privateVideo.sources });
  const config = { width: request.width, height: request.height, fps: request.fps, durationInFrames: request.durationInFrames, compositionAudio: Boolean(request.compositionAudio) };
  const hasAudio = request.mode === 'video' && (request.compositionAudio || audioPlan(request).length > 0);
  const videoPath = hasAudio ? `/tmp/silent.${output.extension}` : outputPath;
  const frameAudio = request.compositionAudio ? new FrameAudioCollector(request) : null;
  const sequence = Object.create(null);
  const sequenceFrames = [];
  let sequenceBytes = 0;
  let encoderDone;
  const frameStep = request.gifOptions?.frameStep ?? 1;
  if (request.mode === 'video') {
    const gifFinalDelay = Math.round(output.frames ? (last - first) * 100 / request.fps : 0) - Math.round((output.frames - 1) * frameStep * 100 / request.fps);
    const encoding = request.format === 'mov'
      ? ['-c:v', 'prores_ks', '-threads', '1', '-profile:v', String({ '422hq': 3, '4444': 4, '4444xq': 5 }[request.proresProfile]), '-pix_fmt', request.proresProfile === '422hq' ? 'yuv422p10le' : 'yuva444p10le', '-alpha_bits', request.proresProfile === '422hq' ? '0' : '16', '-movflags', '+faststart']
      : request.format === 'gif'
      ? ['-filter_complex_threads', '1', '-filter_complex', '[0:v]split[frames][colors];[colors]palettegen=reserve_transparent=1[palette];[frames][palette]paletteuse=dither=sierra2_4a:alpha_threshold=128', '-c:v', 'gif', '-threads', '1', '-fps_mode', 'passthrough', '-gifflags', '-offsetting-transdiff', '-loop', String(request.gifOptions.repeatCount === null ? 0 : request.gifOptions.repeatCount === 0 ? -1 : request.gifOptions.repeatCount), '-final_delay', String(gifFinalDelay)]
      : videoEncodingArgs(request.format, request.videoEncoding);
    encoder = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-threads', '1', '-f', 'image2pipe', '-framerate', `${request.fps}/${frameStep}`, '-i', 'pipe:0', '-an', ...encoding, '-fs', String(MAX_ARTIFACT_BYTES), videoPath], { stdio: ['pipe', 'ignore', 'ignore'] });
    encoder.stdin.on('error', () => {});
    encoderDone = once(encoder, 'close');
  }
  for (let frame = first; frame < last; frame += frameStep) {
    await page.evaluate(({ frame, config, input }) => {
      window.__cutRenderFrame(frame, config, input);
    }, { frame, config, input: request.input });
    let soundData;
      // Preparation may introduce new images/fonts/media or effects. Recheck
      // after browser settlement instead of capturing an early placeholder.
      for (let settlement = 0; settlement < 8; settlement++) {
      const preparedFrame = await page.evaluate(async () => {
      const revision = await window.__cutWaitForFrame();
      await document.fonts.ready;
      await Promise.all([...document.images].map((image) => image.decode()));
      const videos = [...document.querySelectorAll('canvas[data-cut-video-time]')];
      if (videos.length > 8) throw new Error('Too many simultaneous code video layers.');
      const descriptors = videos.map((canvas) => {
        const source = canvas.dataset.cutVideoSrc;
        const importIndex = window.__cutVideoSources.indexOf(source);
        if (importIndex < 0) throw new Error('Video requires an imported private MP4/WebM.');
        const time = Number(canvas.dataset.cutVideoTime);
        if (!Number.isFinite(time) || time < 0) throw new Error('Invalid video seek.');
        return { importIndex, time, repeat: canvas.dataset.cutVideoRepeat === 'yes', id: canvas.dataset.cutVideoAudioId, speed: Number(canvas.dataset.cutVideoSpeed), volume: Number(canvas.dataset.cutVideoVolume), audioStream: Number(canvas.dataset.cutVideoAudioStream) };
      });
      if (JSON.stringify(descriptors).length > 8192) throw new Error('Frame video data limit exceeded.');
      window.__cutPreparedVideos = { revision, videos, descriptors };
      return { revision, descriptors };
      });
      if (!Array.isArray(preparedFrame.descriptors) || preparedFrame.descriptors.length > 8 || JSON.stringify(preparedFrame).length > 16384) throw new Error('Invalid frame video data.');
      const decoded = [];
      // Serial decoding bounds process and memory pressure. Each requested
      // frame is selected from probed integer presentation timestamps; a prior
      // HTMLVideoElement compositor frame can never be copied by accident.
      for (const descriptor of preparedFrame.descriptors) decoded.push(await privateVideo.frame(descriptor.importIndex, descriptor.time, descriptor.repeat));
      soundData = await page.evaluate(async ({ frame, config, revision, decoded }) => {
      const prepared = window.__cutPreparedVideos;
      if (!prepared || prepared.revision !== revision || await window.__cutWaitForFrame() !== revision || prepared.videos.some(canvas => !canvas.isConnected)) return null;
      const videoSounds = [];
      for (let i = 0; i < decoded.length; i++) {
        const canvas = prepared.videos[i], descriptor = prepared.descriptors[i];
        const image = new Image();
        image.src = decoded[i].png;
        await image.decode();
        canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
        const drawing = canvas.getContext('2d');
        if (!drawing) throw new Error('Video frame canvas is unavailable.');
        drawing.drawImage(image, 0, 0);
        if (config.compositionAudio && descriptor.id) videoSounds.push({ ...descriptor, duration: decoded[i].duration });
      }
      // Invalidate retained layout/paint layers without remounting authored
      // React components or discarding their prepared media. Otherwise moving
      // rounded/translucent layers can reuse a prior subpixel raster, making
      // a sequential frame differ from the same independently rendered still.
      const stage = document.getElementById('stage');
      if (!stage) throw new Error('Composition stage is unavailable.');
      const stageDisplay = stage.style.getPropertyValue('display');
      const stageDisplayPriority = stage.style.getPropertyPriority('display');
      stage.style.setProperty('display', 'none', 'important');
      stage.getBoundingClientRect();
      if (stageDisplay) stage.style.setProperty('display', stageDisplay, stageDisplayPriority);
      else stage.style.removeProperty('display');
      stage.getBoundingClientRect();
      // Time-dependent animation is not part of the frame-driven SDK contract.
      for (const animation of document.getAnimations()) { animation.pause(); animation.currentTime = frame * 1000 / config.fps; }
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (await window.__cutWaitForFrame() === revision) {
        const nodes = document.querySelectorAll('[data-cut-audio-id]');
        if (nodes.length > 8) throw new Error('Frame soundtrack limit exceeded.');
        const sounds = [...nodes].map((node) => ({ id: node.dataset.cutAudioId, file: node.dataset.cutAudioFile,
          sourceSeconds: Number(node.dataset.cutAudioTime), speed: Number(node.dataset.cutAudioSpeed),
          volume: Number(node.dataset.cutAudioVolume), audioStream: Number(node.dataset.cutAudioStream) }));
        if (sounds.length + videoSounds.length > 8 || JSON.stringify({ sounds, videoSounds }).length > 8192) throw new Error('Frame soundtrack data limit exceeded.');
        return { sounds, videoSounds };
      }
      return null;
      }, { frame, config, revision: preparedFrame.revision, decoded });
      if (soundData) break;
      }
    if (!soundData) throw new Error('Composition frame preparation did not settle.');
    if (pageFailed) throw new Error('Composition execution failed.');
    const frameSounds = [...soundData.sounds, ...soundData.videoSounds.flatMap((sample) => {
      if (!Number.isInteger(sample.importIndex) || sample.importIndex < 0 || sample.importIndex >= videoAudioCatalog.length) throw new Error('Invalid private video soundtrack binding.');
      const sound = videoSourceAudioSample(videoAudioCatalog[sample.importIndex], { ...sample, fps: request.fps });
      return sound ? [sound] : [];
    })];
    if (frameAudio) frameAudio.capture(frame, frameSounds);
    else if (request.mode === 'video' && frameSounds.length) throw new Error('Enable compositionAudio to export a composition soundtrack.');
    let png = await page.screenshot({ type: request.format === 'jpeg' ? 'jpeg' : 'png', ...(request.format === 'jpeg' ? { quality: request.quality } : {}), omitBackground: (request.mode !== 'video' || ['webm', 'gif'].includes(request.format) || (request.format === 'mov' && request.proresProfile !== '422hq')) && request.format !== 'jpeg', timeout: 10_000 });
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
  if (frameAudio) {
    phase = 'audio_probe';
    const tracks = frameAudio.finish();
    preparedAudio.push(...await prepareAudioTracks({ ...request, audioTracks: tracks }, capsule, preparedAudio.length));
    compositionAudioReceipt = { trackCount: tracks.length, planSha256: createHash('sha256').update(JSON.stringify(tracks)).digest('hex') };
  }
  phase = 'audio_mix';
  audioTrackCount = request.mode === 'video' ? await mixAudioTracks(request, capsule, videoPath, outputPath, preparedAudio) : 0;
  if (request.mode === 'video' && audioTrackCount === 0 && videoPath !== outputPath) await rename(videoPath, outputPath);
  }
  phase = 'receipt';
  const size = (await stat(outputPath)).size;
  if (!size || size >= MAX_ARTIFACT_BYTES) throw new Error('Artifact output limit exceeded.');
  const artifact = await readFile(outputPath);
  const receipt = { version: 1, runtime: 'cut-code-prototype-v1', requestSha256, mode: request.mode, format: request.format, quality: request.quality, width: request.width, height: request.height, fps: request.fps, frames: output.frames, start: first, end: last - 1, ...(request.gifOptions ? { gifOptions: request.gifOptions } : {}), ...(request.proresProfile ? { proresProfile: request.proresProfile } : {}), frame: request.mode === 'still' ? first : undefined, sourceSha256: createHash('sha256').update(source).digest('hex'), artifactSha256: createHash('sha256').update(artifact).digest('hex'), bytes: artifact.length, mediaType: output.mediaType, audioTrackCount, silent: hasSoundtrack && audioTrackCount === 0, operatingSystem: { noNewPrivileges: true, seccomp: true, effectiveCapabilities: 'none', networkInterfaces: ['lo'] } };
  if (request.videoEncoding) receipt.videoEncoding = request.videoEncoding;
  if (compositionAudioReceipt) receipt.compositionAudio = compositionAudioReceipt;
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
