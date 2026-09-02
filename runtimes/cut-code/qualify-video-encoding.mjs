import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { zipSync, strToU8 } from 'fflate';
import { renderIsolated } from './host.mjs';

export async function qualifyVideoEncoding({ image, directory }) {
  const code = `import {useLayoutEffect,useRef} from 'react';import {useFrame} from '@creativesos/cut';export default function Scene(){const ref=useRef(null),frame=useFrame();useLayoutEffect(()=>{const c=ref.current.getContext('2d');const pixels=c.createImageData(160,90);let seed=9127;for(let i=0;i<160*90;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const shade=20+seed%210;pixels.data.set([shade,shade,shade,255],i*4);}c.putImageData(pixels,0,0);c.fillStyle='white';c.fillRect(10+frame*4,30,16,16);},[frame]);return <canvas ref={ref} width={160} height={90}/>}`;
  const source = Buffer.from(zipSync({ 'package.json': strToU8('{"dependencies":{"react":"18.3.1"}}'), 'main.tsx': strToU8(code) }));
  const request = { version: 1, mode: 'video', width: 160, height: 90, fps: 30, durationInFrames: 6, entrypoint: 'main.tsx', input: {} };
  const reference = await renderIsolated({ request: { ...request, mode: 'still' }, source, image });
  const decode = (artifact) => execFileSync('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { input: artifact, maxBuffer: 1024 * 1024, windowsHide: true });
  const expected = decode(reference.artifact);
  const mse = (actual) => { assert.equal(actual.length, expected.length); let sum = 0; for (let i = 0; i < actual.length; i++) sum += (actual[i] - expected[i]) ** 2; return sum / actual.length; };
  await writeFile(`${directory}encoding-reference.png`, reference.artifact);
  const records = [];
  for (const format of ['mp4', 'webm']) {
    const outputs = [];
    for (const crf of [8, 48]) {
      const videoEncoding = format === 'mp4' ? { crf, preset: 'fast' } : { crf, cpuUsed: 4 };
      const rendered = await renderIsolated({ request: { ...request, format, videoEncoding }, source, image });
      if (format === 'webm') {
        const repeated = await renderIsolated({ request: { ...request, format, videoEncoding }, source, image });
        assert.deepEqual(repeated.artifact, rendered.artifact, 'The same deterministic WebM request must replay identical encoded/container bytes.');
      }
      const output = `${directory}encoding-${crf}.${format}`;
      await writeFile(output, rendered.artifact);
      const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_name,width,height,nb_read_frames:format=duration', '-of', 'json', output], { encoding: 'utf8', windowsHide: true }));
      assert.equal(probe.streams.length, 1); assert.equal(probe.streams[0].codec_name, format === 'mp4' ? 'h264' : 'vp9');
      assert.equal(Number(probe.streams[0].nb_read_frames), 6); assert.equal(probe.streams[0].width, 160); assert.equal(probe.streams[0].height, 90);
      assert.ok(Math.abs(Number(probe.format.duration) - .2) < .005);
      const error = mse(decode(rendered.artifact)); outputs.push({ error, bytes: rendered.artifact.length });
      records.push({ test: `actual-${format}-crf-${crf}`, ...rendered.receipt, firstFrameRgbMse: error, probe });
    }
    assert.ok(outputs[0].error < outputs[1].error * .75, `Lower ${format} CRF must materially reduce decoded grayscale error: ${JSON.stringify(outputs)}`);
    assert.ok(outputs[0].bytes > outputs[1].bytes, `Higher quality must retain more data for this owned noise fixture: ${JSON.stringify(outputs)}`);
  }
  const target = await renderIsolated({ request: { ...request, videoEncoding: { bitrateKbps: 1000, preset: 'veryfast' } }, source, image });
  assert.deepEqual(target.receipt.videoEncoding, { bitrateKbps: 1000, preset: 'veryfast' });
  assert.equal(decode(target.artifact).length, expected.length);
  await writeFile(`${directory}encoding-target-rate.mp4`, target.artifact);
  records.push({ test: 'actual-target-bitrate-preset', ...target.receipt });
  console.log('PASS actual H.264/VP9 quality controls, decoded error/size tradeoff, frame custody and target-rate encoding');
  return records;
}
