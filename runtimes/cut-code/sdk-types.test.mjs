import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const directory = path.dirname(fileURLToPath(import.meta.url));
const declaration = path.join(directory, 'sdk.d.ts');
function check(source) {
  const file = path.join(directory, '__sdk_type_fixture__.tsx');
  const options = { noEmit: true, strict: true, skipLibCheck: false, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, types: ['react'] };
  const host = ts.createCompilerHost(options);
  const matches = (name) => path.resolve(name) === path.resolve(file);
  const read = host.readFile.bind(host); const exists = host.fileExists.bind(host);
  host.readFile = (name) => matches(name) ? source : read(name);
  host.fileExists = (name) => matches(name) || exists(name);
  const program = ts.createProgram([declaration, file], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.deepEqual(diagnostics.map((item) => ts.flattenDiagnosticMessageText(item.messageText, '\n')), []);
}

test('typechecks a native animated composition and its private asset imports', () => {
  check(`import {FullFrame,Sequence,Freeze,Repeat,FrameVideo,useFrame,useGlobalFrame,useComposition,useInputs,interpolate,spring,measureSpring,easing,cubicBezier,seededRandom,interpolateColor} from '@creativesos/cut';
import clip from './clip.mp4'; import logo from './logo.png'; import font from './brand.woff2'; import styles from './title.module.css'; import './global.css';
interface Inputs { title: string; color: string }
export default function Scene(){const frame=useFrame();const global=useGlobalFrame();const {fps,width}=useComposition();const input=useInputs<Inputs>();
const opacity=interpolate(frame,[0,30] as const,[0,1],{ease:easing.inOut(cubicBezier(.2,0,.8,1)),left:'wrap'});
const position=spring({frame,fps,stiffness:80,clampOvershoot:true,durationInFrames:measureSpring({fps}),reverse:true});const color=interpolateColor(global,[0,30],['#000000','#ffffff']);
return <FullFrame className={styles.title} style={{opacity,left:position,background:color,width}}><Sequence at={10} duration={30}><Repeat duration={5} count={6} alternate><Freeze frame={2}><FrameVideo src={clip} speed={1.5} startFrom={10}/></Freeze></Repeat></Sequence><img src={logo}/><span>{input.title}{seededRandom('seed')}{font}</span></FullFrame>}`);
});

test('rejects invalid timing/media/motion inputs and catches unused error expectations', () => {
  check(`import {Sequence,Freeze,Repeat,FrameVideo,useInputs,useComposition,spring,interpolate,easing} from '@creativesos/cut';
// @ts-expect-error timing is numeric
const a=<Sequence at="10"/>;
// @ts-expect-error a freeze requires a frame
const b=<Freeze/>;
// @ts-expect-error a repeat requires its duration
const c=<Repeat count={2}/>;
// @ts-expect-error remote URLs are not private capsule videos
const d=<FrameVideo src="https://example.invalid/movie.mp4"/>;
// @ts-expect-error fps is required
spring({frame:1});
// @ts-expect-error an unknown extrapolation mode
interpolate(1,[0,2],[0,1],{left:'bounce'});
// @ts-expect-error easing takes a function
easing.out('linear');
const input=useInputs<{title:string}>();
// @ts-expect-error inputs are read-only to callers
input.title='changed';
// @ts-expect-error configuration is read-only to callers
useComposition().fps=1;
export {};`);
});

test('declarations cover exactly the SDK runtime export names', () => {
  const names = new Set();
  for (const file of ['sdk.jsx', 'motion.mjs']) {
    const source = ts.createSourceFile(file, fs.readFileSync(path.join(directory, file), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
    for (const statement of source.statements) {
      if (!statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
      if (ts.isFunctionDeclaration(statement)) names.add(statement.name.text);
      if (ts.isVariableStatement(statement)) for (const item of statement.declarationList.declarations) names.add(item.name.text);
    }
  }
  const source = ts.createSourceFile('sdk.d.ts', fs.readFileSync(declaration, 'utf8'), ts.ScriptTarget.Latest, true);
  const module = source.statements.find((statement) => ts.isModuleDeclaration(statement) && statement.name.text === '@creativesos/cut');
  const declared = [];
  for (const statement of module.body.statements) {
    if (ts.isFunctionDeclaration(statement)) declared.push(statement.name.text);
    if (ts.isVariableStatement(statement)) for (const item of statement.declarationList.declarations) declared.push(item.name.text);
  }
  assert.deepEqual(declared.sort(), [...names].sort());
});

test('frame preparation handles are opaque and their timing contract is typed', () => {
  check(`import {holdFrame,releaseFrame,failRender} from '@creativesos/cut';
const handle=holdFrame({timeoutMs:500});releaseFrame(handle);failRender();
// @ts-expect-error handles cannot be fabricated
releaseFrame({});
// @ts-expect-error timeout is numeric
holdFrame({timeoutMs:'500'});
// @ts-expect-error private diagnostics are not exported
failRender('private source');`);
});

test('frame audio authoring uses typed file, source clock, gain and stream props', () => {
  check(`import {FrameAudio,useFrame} from '@creativesos/cut';
const a=<FrameAudio file="assets/sound.wav" startFrom={12} speed={1.5} volume={useFrame()/30} muted={false} audioStream={1}/>;
// @ts-expect-error file is required
const b=<FrameAudio/>;
// @ts-expect-error no callback is exported into the host; useFrame supplies a number
const c=<FrameAudio file="a.wav" volume={(frame:number)=>frame/30}/>;
// @ts-expect-error gain is numeric
const d=<FrameAudio file="a.wav" volume="1"/>;`);
});

test('the configuration hook fails explicitly outside its provider and renders inside it', async () => {
  // This evaluates only the checked-in SDK in a unit test, never a user capsule.
  const compiled = await build({ entryPoints: [path.join(directory, 'sdk.jsx')], bundle: true, platform: 'node', format: 'cjs', write: false, external: ['react'], logLevel: 'silent' });
  const require = createRequire(import.meta.url);
  const module = { exports: {} };
  vm.runInNewContext(compiled.outputFiles[0].text, { module, exports: module.exports, require: (name) => { assert.equal(name, 'react'); return require(name); } });
  const { FrameContext, useComposition, FrameAudio, Sequence, Repeat, Freeze } = module.exports;
  const Scene = () => React.createElement('span', null, useComposition().fps);
  assert.throws(() => renderToStaticMarkup(React.createElement(Scene)), /composition provider/);
  assert.equal(renderToStaticMarkup(React.createElement(FrameContext.Provider, { value: { frame: 0, globalFrame: 0, config: { width: 640, height: 360, fps: 30, durationInFrames: 60 }, input: {} } }, React.createElement(Scene))), '<span>30</span>');
  const sound = React.createElement(FrameAudio, { file: 'sound.wav', startFrom: 3, speed: 2, volume: .25 });
  const renderSound = (frame, child) => renderToStaticMarkup(React.createElement(FrameContext.Provider, { value: { frame, globalFrame: frame, config: { width: 64, height: 32, fps: 30, durationInFrames: 60 }, input: {} } }, child));
  assert.match(renderSound(12, React.createElement(Sequence, { at: 9 }, sound)), /data-cut-audio-time="0.3"/);
  assert.equal(renderSound(12, React.createElement(Freeze, { frame: 3 }, sound)), '');
  assert.equal(renderSound(12, React.createElement(Repeat, { duration: 10, alternate: true }, sound)), '');
  assert.match(renderSound(22, React.createElement(Repeat, { duration: 10, alternate: true }, sound)), /data-cut-audio-time="0.23333333333333334"/);
});
