import React, { createContext, useContext } from 'react';

export const FrameContext = createContext({ frame: 0, config: null, input: {} });
export const useFrame = () => useContext(FrameContext).frame;
export const useComposition = () => useContext(FrameContext).config;
export const useInputs = () => useContext(FrameContext).input;

export function FullFrame({ style, children, ...props }) {
  return <div {...props} style={{ position: 'absolute', inset: 0, ...style }}>{children}</div>;
}

export function Sequence({ at = 0, duration, children }) {
  const current = useContext(FrameContext);
  if (!Number.isInteger(at) || at < 0 || (duration !== undefined && (!Number.isInteger(duration) || duration < 1))) throw new Error('Sequence timing must use non-negative integral frames.');
  if (current.frame < at || (duration !== undefined && current.frame >= at + duration)) return null;
  return <FrameContext.Provider value={{ ...current, frame: current.frame - at }}>{children}</FrameContext.Provider>;
}

export function interpolate(value, input, output) {
  if (!Number.isFinite(value) || !Array.isArray(input) || !Array.isArray(output) || input.length < 2 || input.length !== output.length || input.some((point, index) => !Number.isFinite(point) || (index > 0 && point <= input[index - 1])) || output.some((point) => !Number.isFinite(point))) throw new Error('Interpolation requires matching finite, strictly ordered input ranges.');
  if (value <= input[0]) return output[0];
  for (let index = 1; index < input.length; index++) {
    if (value <= input[index]) return output[index - 1] + (output[index] - output[index - 1]) * (value - input[index - 1]) / (input[index] - input[index - 1]);
  }
  return output.at(-1);
}
