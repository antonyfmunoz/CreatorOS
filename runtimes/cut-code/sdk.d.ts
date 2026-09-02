/** Authoring contract for the native CutStudio SDK, not Remotion API compatibility. */
declare module '@creativesos/cut' {
  import type { ReactNode, Context, HTMLAttributes, CanvasHTMLAttributes, CSSProperties } from 'react';

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
    audioPaused?: boolean;
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
  export type FramePreparation = { readonly __framePreparation: unique symbol };
  /** Blocks capture until released. Default 10 seconds; bounded to 1..30000 ms. */
  export function holdFrame(options?: { timeoutMs?: number }): FramePreparation;
  /** Idempotent for an already released handle from this composition. */
  export function releaseFrame(handle: FramePreparation): void;
  /** Permanently fails this render; authored error contents are not exported. */
  export function failRender(): void;

  export interface TextTypography {
    text: string;
    /** One already loaded/registered private family, or a standard CSS generic. */
    fontFamily: string;
    fontWeight?: number;
    fontStyle?: 'normal' | 'italic' | 'oblique';
    letterSpacing?: number;
    lineHeight?: number;
    direction?: 'ltr' | 'rtl';
  }
  export interface TextMeasurement {
    readonly fontSize: number;
    readonly width: number;
    readonly height: number;
    readonly lines: number;
    /** Apply the returned typography/layout unchanged for matching measurements. */
    readonly style: Readonly<CSSProperties>;
  }
  /** Browser-only CSS text layout; width enables wrapping. Does not fetch fonts. */
  export function measureText(input: TextTypography & { fontSize: number; width?: number }): TextMeasurement;
  /** Bounded font search; fits=false explicitly reports overflow at the minimum. */
  export function fitText(input: TextTypography & { withinWidth: number; withinHeight?: number; minFontSize?: number; maxFontSize?: number; maxLines?: number }): TextMeasurement & { readonly fits: boolean };

  export function FullFrame(props: HTMLAttributes<HTMLDivElement>): ReactNode;
  export function Sequence(props: { at?: number; duration?: number; children?: ReactNode }): ReactNode;
  export function Freeze(props: { frame: number; children?: ReactNode }): ReactNode;
  export function Repeat(props: { duration: number; count?: number; alternate?: boolean; children?: ReactNode }): ReactNode;
  export type PrivateVideoSource = `data:video/${'mp4' | 'webm'};base64,${string}`;
  /** Decoded into a frame-synchronized canvas. Audio uses explicit audioTracks. */
  export function FrameVideo(props: CanvasHTMLAttributes<HTMLCanvasElement> & { src: PrivateVideoSource; startFrom?: number; speed?: number; repeat?: boolean }): ReactNode;
  /** Capsule-root file, local frame clock, 0.5..2 pitch-preserving speed, 0..2 per-frame gain. Video requests opt in with compositionAudio: true. */
  export function FrameAudio(props: { file: string; startFrom?: number; speed?: number; volume?: number; muted?: boolean; audioStream?: number }): ReactNode;

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
declare module '*.module.css' { const classes: Readonly<Record<string, string>>; export default classes; }
declare module '*.css' {}
