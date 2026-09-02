import React, { createContext, useContext } from 'react';
import { frameReadiness } from './frame-readiness.mjs';
export { interpolate, spring, measureSpring, easing, cubicBezier, seededRandom, interpolateColor } from './motion.mjs';

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
  return <FrameContext.Provider value={{ ...current, frame }}>{children}</FrameContext.Provider>;
}

export function Repeat({ duration, count, alternate = false, children }) {
  const current = useContext(FrameContext);
  if (!Number.isInteger(duration) || duration < 1 || (count !== undefined && (!Number.isInteger(count) || count < 1)) || typeof alternate !== 'boolean') throw new Error('Invalid repetition timing.');
  if (current.frame < 0 || (count !== undefined && current.frame >= duration * count)) return null;
  const iteration = Math.floor(current.frame / duration);
  let frame = current.frame % duration;
  if (alternate && iteration % 2) frame = duration - 1 - frame;
  return <FrameContext.Provider value={{ ...current, frame }}>{children}</FrameContext.Provider>;
}

export function FrameVideo({ src, startFrom = 0, speed = 1, repeat = false, style, ...props }) {
  const frame = useFrame();
  const { fps } = useComposition();
  if (typeof src !== 'string' || !/^data:video\/(mp4|webm);base64,/.test(src) || !Number.isInteger(startFrom) || startFrom < 0 || !Number.isFinite(speed) || speed <= 0 || speed > 8 || typeof repeat !== 'boolean') throw new Error('FrameVideo requires a private imported MP4/WebM and bounded timing.');
  return <canvas {...props} style={style} data-cut-video-src={src} data-cut-video-time={(startFrom + frame * speed) / fps} data-cut-video-repeat={repeat ? 'yes' : 'no'}/>;
}
