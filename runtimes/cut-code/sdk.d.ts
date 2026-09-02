/** Authoring contract for the native CutStudio SDK, not Remotion API compatibility. */
declare module '@creativesos/cut' {
  import type { ReactNode, Context, HTMLAttributes, CanvasHTMLAttributes } from 'react';

  export interface CompositionConfig {
    readonly width: number;
    readonly height: number;
    readonly fps: number;
    readonly durationInFrames: number;
  }
  export interface FrameState {
    frame: number;
    globalFrame: number;
    config: CompositionConfig | null;
    input: Record<string, unknown>;
  }
  export const FrameContext: Context<FrameState>;
  /** Local frame, relative to the nearest Sequence/Repeat/Freeze. */
  export function useFrame(): number;
  /** Absolute composition frame, unaffected by local timing wrappers. */
  export function useGlobalFrame(): number;
  /** Requires the composition provider installed by the native runtime. */
  export function useComposition(): CompositionConfig;
  /** Types are authoring assistance, not validation of supplied JSON values. */
  export function useInputs<T extends object = Record<string, unknown>>(): Readonly<T>;

  export function FullFrame(props: HTMLAttributes<HTMLDivElement>): ReactNode;
  export function Sequence(props: { at?: number; duration?: number; children?: ReactNode }): ReactNode;
  export function Freeze(props: { frame: number; children?: ReactNode }): ReactNode;
  export function Repeat(props: { duration: number; count?: number; alternate?: boolean; children?: ReactNode }): ReactNode;
  export type PrivateVideoSource = `data:video/${'mp4' | 'webm'};base64,${string}`;
  /** Decoded into a frame-synchronized canvas. Audio uses explicit audioTracks. */
  export function FrameVideo(props: CanvasHTMLAttributes<HTMLCanvasElement> & { src: PrivateVideoSource; startFrom?: number; speed?: number; repeat?: boolean }): ReactNode;

  export type EasingFunction = (progress: number) => number;
  export type Extrapolation = 'clamp' | 'extend' | 'wrap';
  export interface InterpolationOptions { left?: Extrapolation; right?: Extrapolation; ease?: EasingFunction }
  export function interpolate(value: number, input: readonly number[], output: readonly number[], options?: InterpolationOptions): number;
  export function cubicBezier(x1: number, y1: number, x2: number, y2: number): EasingFunction;
  export const easing: Readonly<{
    linear: EasingFunction; quadratic: EasingFunction; cubic: EasingFunction; sine: EasingFunction;
    bezier: typeof cubicBezier;
    out(curve: EasingFunction): EasingFunction;
    inOut(curve: EasingFunction): EasingFunction;
  }>;
  export interface SpringOptions {
    frame: number; fps: number; from?: number; to?: number; mass?: number;
    stiffness?: number; damping?: number; delay?: number; clampOvershoot?: boolean;
    durationInFrames?: number; reverse?: boolean; threshold?: number;
  }
  export function spring(options: SpringOptions): number;
  /** Conservative settling frame for the continuous response; rejects unbounded motion. */
  export function measureSpring(options: { fps: number; mass?: number; stiffness?: number; damping?: number; threshold?: number; maxFrames?: number }): number;
  export function seededRandom(seed: string | number): number;
  /** Runtime validates six/eight-digit hex colors and matching ordered ranges. */
  export function interpolateColor(value: number, input: readonly number[], colors: readonly string[], options?: InterpolationOptions): string;
}

declare module '*.mp4' { const source: import('@creativesos/cut').PrivateVideoSource; export default source; }
declare module '*.webm' { const source: import('@creativesos/cut').PrivateVideoSource; export default source; }
declare module '*.png' { const source: string; export default source; }
declare module '*.jpg' { const source: string; export default source; }
declare module '*.jpeg' { const source: string; export default source; }
declare module '*.webp' { const source: string; export default source; }
declare module '*.svg' { const source: string; export default source; }
declare module '*.ttf' { const source: string; export default source; }
declare module '*.otf' { const source: string; export default source; }
declare module '*.woff2' { const source: string; export default source; }
