export type CutPreviewSnapshot = Readonly<{ ready: boolean; pending: number; errors: readonly string[] }>;

/** One lease per mounted resource. Stale loads cannot unlock another resource. */
export function createCutPreviewReadiness(clock = {
  schedule: (callback: () => void) => setTimeout(callback, 30_000),
  cancel: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
}) {
  const resources = new Map<symbol, { label: string; state: "pending" | "ready" | "error"; error?: string; timer?: ReturnType<typeof setTimeout> }>();
  const listeners = new Set<() => void>();
  let snapshot: CutPreviewSnapshot = Object.freeze({ ready: true, pending: 0, errors: Object.freeze([]) });
  const publish = () => {
    const values = Array.from(resources.values());
    const pending = values.filter((resource) => resource.state === "pending").length;
    const errors = values.flatMap((resource) => resource.state === "error" ? [resource.error!] : []);
    if (snapshot.pending === pending && errors.length === snapshot.errors.length && errors.every((error, index) => error === snapshot.errors[index])) return;
    snapshot = Object.freeze({ ready: !pending && !errors.length, pending, errors: Object.freeze(errors) });
    listeners.forEach((listener) => listener());
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    acquire(label: string) {
      const id = Symbol(label);
      const resource: { label: string; state: "pending" | "ready" | "error"; error?: string; timer?: ReturnType<typeof setTimeout> } = { label, state: "ready" };
      resources.set(id, resource);
      const update = (state: "pending" | "ready" | "error", error?: string) => {
        if (!resources.has(id) || (state === resource.state && error === resource.error)) return;
        if (resource.timer !== undefined) clock.cancel(resource.timer);
        resource.timer = undefined; resource.state = state; resource.error = error;
        if (state === "pending") resource.timer = clock.schedule(() => update("error", `${label} did not become ready. Retry the preview or replace this asset.`));
        publish();
      };
      update("pending");
      return {
        pending: () => update("pending"),
        ready: () => update("ready"),
        fail: (message: string) => update("error", message),
        release() {
          if (!resources.delete(id)) return;
          if (resource.timer !== undefined) clock.cancel(resource.timer);
          publish();
        },
      };
    },
  };
}
