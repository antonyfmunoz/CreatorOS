import type { Browser } from "playwright-core";
import { launchCutNativeRenderer } from "./cut-animation-renderer";

/** One native data-only render job, never a shared tenant or executable-code pool. */
export function createCutNativeBrowserSession(launch: () => Promise<Browser> = launchCutNativeRenderer) {
  let pending: Promise<Browser> | undefined;
  let closing: Promise<void> | undefined;
  let closed = false;
  return {
    async browser() {
      if (closed) throw new Error("Native renderer session is closed");
      pending ??= launch();
      const browser = await pending;
      if (closed) throw new Error("Native renderer session is closed");
      return browser;
    },
    close() {
      closed = true;
      closing ??= pending ? pending.then((browser) => browser.close()).catch(() => undefined) : Promise.resolve();
      return closing;
    },
  };
}

export type CutNativeBrowserSession = ReturnType<typeof createCutNativeBrowserSession>;
