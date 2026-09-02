import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { zipSync, unzipSync, strToU8 } from 'fflate';
import { renderIsolated } from './host.mjs';

// Native authored motion study, not a competitor source or reference design.
// Reproduces text edges and rounded-layer transition differences caused by
// browser paint history, without accepting a pixel tolerance as exactness.
export async function qualifyTextFrameHistory({ image, directory }) {
  const code = await readFile(new URL('./fixtures/motion-study.tsx', import.meta.url));
  const source = Buffer.from(zipSync({ 'package.json': strToU8('{"dependencies":{"react":"18.3.1"}}'), 'src/main.tsx': code }, { mtime: new Date('2020-01-01T00:00:00Z') }));
  const base = { version: 1, mode: 'video', format: 'mp4', width: 1080, height: 1920, fps: 30, durationInFrames: 180, entrypoint: 'src/main.tsx', input: {} };
  const records = [];
  for (const [start, frame] of [[0,14], [50,59]]) {
  const still = await renderIsolated({ request: { ...base, mode: 'still', format: 'png', frame }, source, image });
  const sequence = await renderIsolated({ request: { ...base, mode: 'sequence', format: 'png', frameRange: [start,frame] }, source, image });
  const lastPng = Buffer.from(unzipSync(sequence.artifact)[`frame-${String(frame).padStart(6,'0')}.png`]);
  const video = await renderIsolated({ request: { ...base, frameRange: [start,frame], videoEncoding: { losslessRgb: true } }, source, image });
  await writeFile(`${directory}text-frame-history-${frame}-reference.png`, still.artifact);
  await writeFile(`${directory}text-frame-history-${frame}-sequence.png`, lastPng);
  await writeFile(`${directory}text-frame-history-${frame}.mp4`, video.artifact);
  const decode = (bytes, extra=[]) => execFileSync('ffmpeg', ['-v','error','-nostdin','-i','pipe:0',...extra,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo','pipe:1'], { input:bytes, maxBuffer:8_000_000, timeout:15_000, windowsHide:true });
  const expected = decode(still.artifact);
  for (const [label, actual] of [['sequence', decode(lastPng)], ['video', decode(video.artifact, ['-vf',`select=eq(n\\,${frame-start})`])]]) {
    assert.equal(actual.length, expected.length);
    let differences = 0; for(let index=0;index<actual.length;index++) if(actual[index]!==expected[index]) differences++;
    assert.equal(differences, 0, `${label} frame ${frame} must not depend on prior browser paint history.`);
  }
  console.log(`PASS exact full-HD frame ${frame} after sequential painting, independent still and RGB video`);
  records.push({ test:`text-frame-history-1080x1920-${frame}`, ...video.receipt, reference:still.receipt, sequence:sequence.receipt, comparedRgbSamples:expected.length, differingRgbSamples:0 });
  }
  return records;
}
