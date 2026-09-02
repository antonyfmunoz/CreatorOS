type PreviewInstance = {
  animationNames: string[];
  play(name: string): void;
  pause(name: string): void;
  resizeDrawingSurfaceToCanvas(ratio: number): void;
  scrub(name: string, seconds: number): void;
  drawFrame(): void;
};

// Rive emits Load before it finishes processing its playback queue. Defer our
// initialization, and guard every later frame callback as well as the fetch.
export function createCutRivePreviewController(options: {
  instance: () => PreviewInstance | null;
  seconds: () => number;
  loaded: () => void;
  failed: () => void;
  schedule: (callback: () => void) => number;
  cancel: (id: number) => void;
  defer: (callback: () => void) => void;
}) {
  let active = true;
  let ready = false;
  let pendingFrame: number | null = null;
  const fail = () => {
    if (!active) return;
    active = false;
    ready = false;
    if (pendingFrame !== null) options.cancel(pendingFrame);
    pendingFrame = null;
    options.failed();
  };
  const guard = (callback: () => void) => () => {
    if (!active) return;
    try { callback(); } catch { fail(); }
  };
  const nextFrame = (callback: () => void) => {
    pendingFrame = options.schedule(guard(() => { pendingFrame = null; callback(); }));
  };
  const seek = guard(() => {
    if (!ready) return;
    const instance = options.instance();
    if (!instance) throw new Error("Rive preview instance is unavailable");
    const name = instance.animationNames[0];
    if (name) instance.scrub(name, options.seconds());
    instance.drawFrame();
  });
  return {
    load: () => options.defer(guard(() => {
      const instance = options.instance();
      if (!instance) throw new Error("Rive preview instance is unavailable");
      const name = instance.animationNames[0];
      if (name) instance.play(name);
      instance.resizeDrawingSurfaceToCanvas(1);
      nextFrame(() => {
        if (name) instance.pause(name);
        ready = true;
        seek();
        if (active) nextFrame(options.loaded);
      });
    })),
    seek,
    fail,
    dispose: () => {
      active = false;
      ready = false;
      if (pendingFrame !== null) options.cancel(pendingFrame);
      pendingFrame = null;
    },
  };
}
