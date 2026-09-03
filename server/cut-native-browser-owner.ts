import { randomBytes } from "node:crypto";
import { chromium, type Browser, type BrowserServer } from "playwright-core";

export const CUT_NATIVE_BROWSER_CLOSE_GRACE_MS = 5_000;

/** Bound graceful shutdown, then await reaping of this exact owned process. */
export function createCutBrowserShutdown(owner: Pick<BrowserServer, "close" | "kill">) {
  let closing: Promise<void> | undefined;
  return () => closing ??= (async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Both branches handle rejection even when the other branch wins. We never
    // leave a timed-out process running or suppress failure of forced cleanup.
    const graceful = Promise.resolve().then(() => owner.close()).then(() => true, () => false);
    try {
      const completed = await Promise.race([
        graceful,
        new Promise<false>((resolve) => { timer = setTimeout(() => resolve(false), CUT_NATIVE_BROWSER_CLOSE_GRACE_MS); }),
      ]);
      if (!completed) await owner.kill();
    } finally {
      if (timer) clearTimeout(timer);
    }
  })();
}

const owners = new WeakMap<Browser, () => Promise<void>>();

/** No application/provider credentials are inherited by the native browser. */
export function cutNativeBrowserEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  const result: Record<string, string> = {};
  for (const name of ["PATH", "SystemRoot", "SYSTEMROOT", "WINDIR", "TEMP", "TMP", "TMPDIR", "HOME", "USERPROFILE", "LOCALAPPDATA", "LANG", "LC_ALL", "FONTCONFIG_PATH", "FONTCONFIG_FILE"]) {
    if (environment[name] !== undefined) result[name] = environment[name]!;
  }
  return result;
}

/** Native data-only jobs, not a public endpoint or an executable-code sandbox. */
export async function launchOwnedCutNativeBrowser(options: NonNullable<Parameters<typeof chromium.launchServer>[0]>) {
  const owner = await chromium.launchServer({
    ...options,
    host: "127.0.0.1",
    port: 0,
    wsPath: randomBytes(32).toString("hex"),
    env: cutNativeBrowserEnvironment(),
  });
  const close = createCutBrowserShutdown(owner);
  try {
    // Never log, persist or return the private control endpoint to a client.
    const browser = await chromium.connect(owner.wsEndpoint(), { timeout: 10_000 });
    owners.set(browser, close);
    return browser;
  } catch (error) {
    await close();
    throw error;
  }
}

export async function closeCutNativeBrowser(browser: Browser) {
  const close = owners.get(browser);
  if (close) await close();
  else await browser.close(); // Injected/test browsers retain their own owner.
}
