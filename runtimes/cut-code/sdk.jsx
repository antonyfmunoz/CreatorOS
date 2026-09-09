import React, { createContext, useContext, useId, useLayoutEffect, useRef, useState } from 'react';
import { SRGBColorSpace, TextureLoader, WebGLRenderer } from 'three';
import { SVGRenderer } from 'three/addons/renderers/SVGRenderer.js';
import { frameReadiness } from './frame-readiness.mjs';
import { validateFrameAudio } from './frame-audio.mjs';
export { interpolate, spring, measureSpring, easing, cubicBezier, seededRandom, interpolateColor } from './motion.mjs';
export { measureText, fitText } from './text-layout.mjs';

export const FrameContext = createContext({ frame: 0, globalFrame: 0, config: null, input: {} });
export const useFrame = () => useContext(FrameContext).frame;
export const useGlobalFrame = () => useContext(FrameContext).globalFrame;
export const useComposition = () => {
  const config = useContext(FrameContext).config;
  if (!config) throw new Error('useComposition requires the native composition provider.');
  return config;
};
export const useInputs = () => useContext(FrameContext).input;
export function holdFrame(options) { return frameReadiness.hold(options); }
export function releaseFrame(handle) { frameReadiness.release(handle); }
export function failRender() { frameReadiness.fail(); }

/**
 * Decodes a PNG, JPEG, or WebP imported from this private capsule for a Three
 * scene. It accepts only the bundler's local data URLs, never a remote URL,
 * browser file path, provider asset, or host filesystem reference. Returning
 * null while decoding lets a scene mount after the texture is ready rather than
 * capturing an empty first WebGL frame.
 */
export function usePrivateTexture(src, { colorSpace = 'srgb' } = {}) {
  const [texture, setTexture] = useState(null);
  useLayoutEffect(() => {
    if (typeof src !== 'string' || !/^data:image\/(png|jpe?g|webp);base64,/.test(src)) throw new Error('usePrivateTexture requires a PNG, JPEG, or WebP imported from this private capsule.');
    if (!['srgb', 'linear'].includes(colorSpace)) throw new Error('usePrivateTexture colorSpace must be srgb or linear.');
    setTexture(null);
    const handle = holdFrame({ timeoutMs: 10_000 });
    let active = true;
    let loadedTexture;
    const settle = () => {
      try { releaseFrame(handle); } catch { /* Cleanup after cancellation is intentionally idempotent. */ }
    };
    try {
      loadedTexture = new TextureLoader().load(src, (next) => {
        if (!active) { next.dispose(); return; }
        if (colorSpace === 'srgb') next.colorSpace = SRGBColorSpace;
        setTexture(next);
        settle();
      }, undefined, () => {
        if (active) failRender();
      });
    } catch {
      failRender();
    }
    return () => {
      active = false;
      settle();
      loadedTexture?.dispose();
    };
  }, [src, colorSpace]);
  return texture;
}

export function FullFrame({ style, children, ...props }) {
  return <div {...props} style={{ position: 'absolute', inset: 0, ...style }}>{children}</div>;
}

export function Sequence({ at = 0, duration, children }) {
  const current = useContext(FrameContext);
  if (!Number.isInteger(at) || at < 0 || (duration !== undefined && (!Number.isInteger(duration) || duration < 1))) throw new Error('Sequence timing must use non-negative integral frames.');
  if (current.frame < at || (duration !== undefined && current.frame >= at + duration)) return null;
  return <FrameContext.Provider value={{ ...current, frame: current.frame - at }}>{children}</FrameContext.Provider>;
}

export function Freeze({ frame, children }) {
  const current = useContext(FrameContext);
  if (!Number.isInteger(frame) || frame < 0) throw new Error('A freeze frame must be a non-negative integer.');
  return <FrameContext.Provider value={{ ...current, frame, audioPaused: true }}>{children}</FrameContext.Provider>;
}

export function Repeat({ duration, count, alternate = false, children }) {
  const current = useContext(FrameContext);
  if (!Number.isInteger(duration) || duration < 1 || (count !== undefined && (!Number.isInteger(count) || count < 1)) || typeof alternate !== 'boolean') throw new Error('Invalid repetition timing.');
  if (current.frame < 0 || (count !== undefined && current.frame >= duration * count)) return null;
  const iteration = Math.floor(current.frame / duration);
  let frame = current.frame % duration;
  if (alternate && iteration % 2) frame = duration - 1 - frame;
  return <FrameContext.Provider value={{ ...current, frame, audioPaused: current.audioPaused || (alternate && iteration % 2 === 1) }}>{children}</FrameContext.Provider>;
}

export function FrameAudio({ file, startFrom = 0, speed = 1, reverse = false, volume = 1, muted = false, audioStream = 0 }) {
  const id = useId();
  const current = useContext(FrameContext);
  const { fps } = useComposition();
  if (!Number.isInteger(startFrom) || startFrom < 0 || typeof muted !== 'boolean' || typeof reverse !== 'boolean') throw new Error('Invalid frame soundtrack timing.');
  const sample = validateFrameAudio({ id, file, sourceSeconds: (startFrom + (reverse ? -1 : 1) * current.frame * speed) / fps, reverse, speed, volume, audioStream });
  // Frozen clocks do not replay a tiny audio slice. Reverse sound is a bounded
  // non-looping interval that is synthesized only by the isolated renderer.
  if (current.audioPaused) return null;
  return <span hidden data-cut-audio-id={id} data-cut-audio-file={sample.file} data-cut-audio-time={sample.sourceSeconds}
    data-cut-audio-speed={speed} data-cut-audio-reverse={reverse ? 'yes' : 'no'} data-cut-audio-volume={muted ? 0 : volume} data-cut-audio-stream={audioStream}/>;
}

export function FrameVideo({ src, startFrom = 0, speed = 1, repeat = false, muted = false, volume = 1, audioStream = 0, style, ...props }) {
  const id = useId();
  const current = useContext(FrameContext);
  const frame = current.frame;
  const { fps, compositionAudio } = useComposition();
  if (typeof src !== 'string' || !/^data:video\/(mp4|webm);base64,/.test(src) || !Number.isInteger(startFrom) || startFrom < 0 || !Number.isFinite(speed) || speed <= 0 || speed > 8 || typeof repeat !== 'boolean') throw new Error('FrameVideo requires a private imported MP4/WebM and bounded timing.');
  if (typeof muted !== 'boolean' || !Number.isFinite(volume) || volume < 0 || volume > 2 || !Number.isInteger(audioStream) || audioStream < 0 || audioStream > 7) throw new Error('Invalid video soundtrack controls.');
  const audible = compositionAudio && !muted && !current.audioPaused;
  if (audible && (speed < .5 || speed > 2)) throw new Error('Source audio supports 0.5 to 2 playback speed; mute faster/slower video explicitly.');
  return <canvas {...props} style={style} data-cut-video-src={src} data-cut-video-time={(startFrom + frame * speed) / fps} data-cut-video-repeat={repeat ? 'yes' : 'no'}
    data-cut-video-audio-id={audible ? `video${id}` : undefined} data-cut-video-speed={speed} data-cut-video-volume={volume} data-cut-video-audio-stream={audioStream}/>;
}

/**
 * A deliberately narrow bridge for frame-driven Three scenes. SVGRenderer is
 * used instead of WebGL so the isolated browser still has deterministic,
 * no-GPU capture semantics. The capsule may use only the pinned Three core and
 * approved SVG renderer; textures, shader code, network assets and arbitrary
 * Three addons remain outside the execution contract.
 */
export function SvgScene({ scene, camera, width, height, style, ...props }) {
  const target = useRef(null);
  const composition = useComposition();
  // A scene may intentionally retain its identity (for example via useMemo)
  // while its geometry changes from the composition frame. Make capture follow
  // that frame rather than requiring authors to recreate a Three scene.
  const frame = useFrame();
  const renderWidth = width ?? composition.width;
  const renderHeight = height ?? composition.height;
  if (!scene?.isScene || !camera?.isCamera) throw new Error('SvgScene requires a Three Scene and Camera.');
  if (!Number.isInteger(renderWidth) || !Number.isInteger(renderHeight) || renderWidth < 1 || renderHeight < 1 || renderWidth > 3840 || renderHeight > 3840 || renderWidth * renderHeight > 8_294_400) throw new Error('SvgScene dimensions exceed the bounded composition contract.');
  useLayoutEffect(() => {
    const host = target.current;
    if (!host) return undefined;
    const renderer = new SVGRenderer();
    renderer.setSize(renderWidth, renderHeight);
    renderer.render(scene, camera);
    const svg = renderer.domElement;
    svg.setAttribute('aria-hidden', 'true');
    svg.style.display = 'block';
    svg.style.width = '100%';
    svg.style.height = '100%';
    host.replaceChildren(svg);
    return () => host.replaceChildren();
  }, [scene, camera, renderWidth, renderHeight, frame]);
  return <div {...props} ref={target} style={{ width: renderWidth, height: renderHeight, overflow: 'hidden', ...style }}/>;
}

/**
 * A tightly bounded software-WebGL bridge for pinned Three core scenes. The
 * isolated browser is started with SwiftShader, so this is not a host-GPU or
 * WebGPU capability. It permits core materials, lighting, textures embedded in
 * the capsule, and ShaderMaterial while preserving the no-network sandbox and
 * the ordinary frame-driven capture contract.
 */
export function WebGLScene({ scene, camera, width, height, style, ...props }) {
  const target = useRef(null);
  const rendererRef = useRef(null);
  const composition = useComposition();
  const frame = useFrame();
  const renderWidth = width ?? composition.width;
  const renderHeight = height ?? composition.height;
  if (!scene?.isScene || !camera?.isCamera) throw new Error('WebGLScene requires a Three Scene and Camera.');
  if (!Number.isInteger(renderWidth) || !Number.isInteger(renderHeight) || renderWidth < 1 || renderHeight < 1 || renderWidth > 3840 || renderHeight > 3840 || renderWidth * renderHeight > 8_294_400) throw new Error('WebGLScene dimensions exceed the bounded composition contract.');
  useLayoutEffect(() => {
    const host = target.current;
    if (!host) return undefined;
    let renderer;
    try {
      renderer = new WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
      renderer.setPixelRatio(1);
      renderer.domElement.setAttribute('aria-hidden', 'true');
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      host.replaceChildren(renderer.domElement);
      rendererRef.current = renderer;
    } catch {
      throw new Error('WebGLScene could not initialize the isolated software renderer.');
    }
    return () => {
      if (rendererRef.current === renderer) rendererRef.current = null;
      renderer.dispose();
      renderer.forceContextLoss();
      host.replaceChildren();
    };
  }, []);
  useLayoutEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setSize(renderWidth, renderHeight, false);
    renderer.render(scene, camera);
    if (renderer.getContext().isContextLost()) throw new Error('WebGLScene lost its isolated software context.');
  }, [scene, camera, renderWidth, renderHeight, frame]);
  return <div {...props} ref={target} style={{ width: renderWidth, height: renderHeight, overflow: 'hidden', ...style }}/>;
}
