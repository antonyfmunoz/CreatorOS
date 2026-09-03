import type { Browser } from "playwright-core";
import { launchCutNativeRenderer } from "./cut-animation-renderer";
import { closeCutNativeBrowser } from "./cut-native-browser-owner";

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
      // A failed launch has no returned process to close. A failed cleanup must
      // remain an error: successful output must not conceal a live renderer.
      closing ??= pending ? pending.then(closeCutNativeBrowser, () => undefined) : Promise.resolve();
      return closing;
    },
  };
}

export type CutNativeBrowserSession = ReturnType<typeof createCutNativeBrowserSession>;
