import { expect, it, vi } from "vitest";
import { runCutNativeProcess } from "../server/cut-native-process";

it("does not start a child when cancellation happened during preparation", async () => {
  const controller = new AbortController(); controller.abort();
  const started = vi.fn();
  await expect(runCutNativeProcess(process.execPath, ['-e', 'process.exit(0)'], { timeoutMs: 5_000, signal: controller.signal, started })).rejects.toThrow(/cancelled/);
  expect(started).not.toHaveBeenCalled();
});

it("kills an actual child and confirms exit before releasing the process", async () => {
  const controller = new AbortController();
  let ready = false, closed = false, pid: number | undefined;
  await expect(runCutNativeProcess(process.execPath, ['-e', 'process.stdout.write("ready"); setInterval(() => {}, 1000)'], {
    timeoutMs: 5_000, signal: controller.signal,
    started(child) {
      pid = child.pid;
      child.stdout.once('data', () => { ready = true; controller.abort(); });
    },
    finished(child) { closed = child.exitCode !== null || child.signalCode !== null; },
  })).rejects.toThrow(/cancelled/);
  expect(ready).toBe(true); expect(closed).toBe(true); expect(pid).toBeGreaterThan(0);
  expect(() => process.kill(pid!, 0)).toThrow();
});

it("handles cancellation at process registration without missing the abort", async () => {
  const controller = new AbortController();
  let closed = false;
  await expect(runCutNativeProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeoutMs: 5_000, signal: controller.signal, started() { controller.abort(); }, finished() { closed = true; } })).rejects.toThrow(/cancelled/);
  expect(closed).toBe(true);
});

it("waits for actual exit on timeout and cleans up spawn failures", async () => {
  let finished = false;
  await expect(runCutNativeProcess(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { timeoutMs: 100, finished() { finished = true; } })).rejects.toThrow(/timed out/);
  expect(finished).toBe(true);
  await expect(runCutNativeProcess('creativesos-missing-native-test-binary', [], { timeoutMs: 5_000 })).rejects.toThrow(/ENOENT/);
});
