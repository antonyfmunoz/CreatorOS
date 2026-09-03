import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { chromium, type BrowserServer } from "playwright-core";
import { cutNativeChromiumExecutable, launchCutNativeRenderer } from "../server/cut-animation-renderer";
import { closeCutNativeBrowser, createCutBrowserShutdown, cutNativeBrowserEnvironment, CUT_NATIVE_BROWSER_CLOSE_GRACE_MS } from "../server/cut-native-browser-owner";
import { closeCutNativeContext, CUT_NATIVE_CONTEXT_CLOSE_GRACE_MS } from "../server/cut-native-context-cleanup";

// Real owned processes and real exit receipts, never a user browser/session.
const healthy = await launchCutNativeRenderer();
let stalled: BrowserServer | undefined;
let forcedKillCalls = 0;
try {
  const context = await healthy.newContext({ viewport: { width: 80, height: 40 }, offline: true, serviceWorkers: "block" });
  await context.route("**/*", (route) => route.abort("blockedbyclient"));
  const page = await context.newPage();
  await page.setContent('<body style="margin:0;background:blue">native</body>');
  const png = await page.screenshot({ type: "png", timeout: 10_000 });
  assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  stalled = await chromium.launchServer({ executablePath: await cutNativeChromiumExecutable(), headless: true, host: "127.0.0.1", port: 0, wsPath: randomBytes(32).toString("hex"), env: cutNativeBrowserEnvironment() });
  const exactProcess = stalled.process();
  assert.equal(exactProcess.exitCode, null);
  const stalledBrowser = await chromium.connect(stalled.wsEndpoint(), { timeout: 10_000 });
  const stalledContext = await stalledBrowser.newContext({ offline: true, serviceWorkers: "block" });
  const stalledPage = await stalledContext.newPage();
  await stalledPage.setContent("<body>owned cleanup fixture</body>");
  assert.equal(await stalledPage.evaluate(() => document.body.textContent), "owned cleanup fixture");
  const ownedServer = stalled;
  const started = performance.now();
  const shutdown = createCutBrowserShutdown({
    // Deliberately withhold graceful completion to exercise the real kill path.
    close: () => new Promise<void>(() => {}),
    kill: async () => { forcedKillCalls += 1; await ownedServer.kill(); },
  });
  // A real context remains alive while its close acknowledgement is withheld.
  // Escalation must still reach the real owned process, never publish success.
  await assert.rejects(closeCutNativeContext({ close: () => new Promise<void>(() => {}) }, async () => {
    await Promise.all([shutdown(), shutdown()]);
  }), /^Error: Native renderer context cleanup failed$/);
  const elapsedMs = Math.round(performance.now() - started);
  assert.equal(forcedKillCalls, 1);
  assert.ok(exactProcess.exitCode !== null || exactProcess.signalCode !== null, "Owned browser process has not exited");
  assert.ok(elapsedMs >= CUT_NATIVE_CONTEXT_CLOSE_GRACE_MS + CUT_NATIVE_BROWSER_CLOSE_GRACE_MS - 50, "Graceful close intervals were skipped");
  assert.equal(stalledBrowser.isConnected(), false);
  // A real second process remains usable: no image-name or host-wide killing.
  assert.equal(healthy.isConnected(), true);
  assert.equal(await page.evaluate(() => document.body.textContent), "native");
  await context.close();
  await closeCutNativeBrowser(healthy);
  assert.equal(healthy.isConnected(), false);
  console.log(JSON.stringify({ passed: true, realOwnedProcessExited: true, stalledContextOwnerReaped: true, concurrentOwnerUnaffected: true, privateScreenshotBytes: png.byteLength, forcedKillCalls, contextGraceBudgetMs: CUT_NATIVE_CONTEXT_CLOSE_GRACE_MS, gracefulBudgetMs: CUT_NATIVE_BROWSER_CLOSE_GRACE_MS, forcedShutdownElapsedMs: elapsedMs }));
} finally {
  if (stalled && stalled.process().exitCode === null && stalled.process().signalCode === null) await stalled.kill();
  await closeCutNativeBrowser(healthy);
}
