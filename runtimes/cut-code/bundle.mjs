import { build } from 'esbuild';
import { unzipSync } from 'fflate';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const runtimeRoot = path.dirname(fileURLToPath(import.meta.url));
const allowedDependencies = new Set(['react', 'react/jsx-runtime', 'react/jsx-dev-runtime']);
const threeModule = path.join(path.dirname(require.resolve('three')), 'three.module.js');
const pinnedDependencies = { react: '18.3.1', 'react-dom': '18.3.1', three: '0.185.1' };

export function readCapsule(bytes, entrypoint) {
  if (bytes.length > 25 * 1024 * 1024) throw new Error('Source archive exceeds 25 MB.');
  let declaredSize = 0;
  const declaredNames = new Set();
  const files = unzipSync(bytes, { filter: (file) => {
    declaredSize += file.originalSize;
    if (declaredSize > 100 * 1024 * 1024 || declaredNames.size >= 5000 || declaredNames.has(file.name)) throw new Error('Expanded archive limit or duplicate entry.');
    declaredNames.add(file.name);
    if (file.originalSize > 20 * 1024 * 1024) throw new Error('A source entry exceeds 20 MB.');
    return true;
  } });
  let size = 0;
  const names = Object.keys(files);
  if (!names.length || names.length > 5000) throw new Error('Invalid source entry count.');
  for (const name of names) {
    if (!name || name.includes('\\') || name.includes('\0') || name.startsWith('/') || /^[A-Za-z]:/.test(name) || path.posix.normalize(name) !== name || name.split('/').includes('..')) throw new Error('Source paths must stay inside the capsule.');
    size += files[name].length;
  }
  if (size > 100 * 1024 * 1024 || !files[entrypoint] || !files['package.json']) throw new Error('Source capsule is incomplete or exceeds its expanded limit.');
  const manifest = JSON.parse(new TextDecoder().decode(files['package.json']));
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('Invalid package manifest.');
  for (const [name, version] of Object.entries(manifest.dependencies ?? {})) {
    if (!Object.hasOwn(pinnedDependencies, name) || version !== pinnedDependencies[name]) throw new Error('This runtime accepts only its exact pinned React/Three dependency set.');
  }
  return files;
}

export async function bundleCapsule(files, entrypoint) {
  const locate = (name) => [name, `${name}.tsx`, `${name}.ts`, `${name}.jsx`, `${name}.js`, `${name}/index.tsx`, `${name}/index.ts`].find((candidate) => files[candidate]);
  const result = await build({
    stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {FrameContext} from './sdk.jsx';import Composition from 'capsule-entry';const root=createRoot(document.getElementById('stage'));window.__cutRenderFrame=(frame,config,input)=>flushSync(()=>root.render(React.createElement(FrameContext.Provider,{value:{frame,globalFrame:frame,config,input}},React.createElement(Composition,input))));`, resolveDir: runtimeRoot, sourcefile: 'bootstrap.jsx', loader: 'jsx' },
    bundle: true, platform: 'browser', format: 'iife', write: false,
    outfile: path.join(runtimeRoot, '__compiled_capsule__.js'),
    jsx: 'automatic', sourcemap: false, logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'private-capsule', setup(plugin) {
      plugin.onResolve({ filter: /^capsule-entry$/ }, () => ({ path: entrypoint, namespace: 'capsule' }));
      // One pinned ESM instance is shared with the approved SVG addon. No
      // arbitrary Three addon, package installation or remote import is allowed.
      plugin.onResolve({ filter: /^three$/ }, () => ({ path: threeModule }));
      plugin.onResolve({ filter: /.*/, namespace: 'capsule' }, (args) => {
        // CSS dependencies are files in the same private capsule, not npm or
        // remote resources. A bare CSS URL is relative to its stylesheet.
        if (['import-rule', 'composes-from', 'url-token'].includes(args.kind)) {
          if (args.kind === 'url-token' && /^#[A-Za-z_][A-Za-z0-9_.:-]*$/.test(args.path)) return { path: args.path, external: true };
          if (!args.path || /^(?:[A-Za-z][A-Za-z0-9+.-]*:|\/|\\)/.test(args.path) || /[?#\\]/.test(args.path)) throw new Error('Stylesheet resources must stay capsule-local.');
          const name = path.posix.normalize(path.posix.join(path.posix.dirname(args.importer), args.path));
          if (name.startsWith('../') || name.startsWith('/') || !files[name]) throw new Error('A private stylesheet resource is missing or escapes the capsule.');
          const supported = args.kind === 'url-token' ? /\.(png|jpe?g|webp|svg|ttf|otf|woff2)$/i : /\.css$/i;
          if (!supported.test(name)) throw new Error('Unsupported private stylesheet resource.');
          return { path: name, namespace: 'capsule' };
        }
        if (args.path === '@creativesos/cut') return { path: path.join(runtimeRoot, 'sdk.jsx') };
        if (args.path === 'three/addons/renderers/SVGRenderer.js') return { path: require.resolve(args.path) };
        if (allowedDependencies.has(args.path)) return { path: require.resolve(args.path) };
        if (!args.path.startsWith('./') && !args.path.startsWith('../')) throw new Error('Only capsule-relative modules and the pinned React/CutStudio SDK are supported.');
        const name = path.posix.normalize(path.posix.join(path.posix.dirname(args.importer), args.path));
        if (name.startsWith('../') || name.startsWith('/') || name.includes('\\')) throw new Error('Imports cannot escape the capsule.');
        const resolved = locate(name);
        if (!resolved) throw new Error('A capsule-relative import is missing.');
        return { path: resolved, namespace: 'capsule' };
      });
      plugin.onLoad({ filter: /.*/, namespace: 'capsule' }, (args) => {
        const extension = path.posix.extname(args.path).slice(1).toLowerCase();
        const loaders = { ts: 'ts', tsx: 'tsx', js: 'js', jsx: 'jsx', json: 'json', css: args.path.endsWith('.module.css') ? 'local-css' : 'css', png: 'dataurl', jpg: 'dataurl', jpeg: 'dataurl', webp: 'dataurl', svg: 'dataurl', ttf: 'dataurl', otf: 'dataurl', woff2: 'dataurl', mp4: 'dataurl', webm: 'dataurl' };
        if (!loaders[extension] || !files[args.path]) throw new Error('Unsupported capsule module type.');
        return { contents: files[args.path], loader: loaders[extension] };
      });
    } }],
  });
  const javascript = result.outputFiles.filter((file) => file.path.endsWith('.js'));
  const stylesheets = result.outputFiles.filter((file) => file.path.endsWith('.css'));
  if (javascript.length !== 1 || stylesheets.length > 1 || result.outputFiles.length !== javascript.length + stylesheets.length) throw new Error('Unexpected compiled capsule outputs.');
  // CSS remains data, never JavaScript source or HTML markup. The isolated
  // renderer transfers both fields through Playwright's structured arguments.
  const compiled = { javascript: javascript[0].text, stylesheet: stylesheets[0]?.text ?? '' };
  if (Buffer.byteLength(compiled.javascript, 'utf8') + Buffer.byteLength(compiled.stylesheet, 'utf8') > 25 * 1024 * 1024) throw new Error('Compiled capsule exceeds its output limit.');
  return compiled;
}
