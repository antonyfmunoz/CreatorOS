import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readCutNativeAnimationSource, CUT_NATIVE_LOTTIE_MAX_BYTES } from "../server/cut-animation-source";
import { renderCutAnimationFrames } from "../server/cut-animation-renderer";

const runtime = vi.hoisted(() => ({ launch: vi.fn(), close: vi.fn() }));
vi.mock("../server/cut-native-browser-owner", () => ({ launchOwnedCutNativeBrowser: runtime.launch, closeCutNativeBrowser: runtime.close }));
const directories: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks(); vi.clearAllMocks();
  for (const directory of directories.splice(0)) await fs.rm(directory, { recursive: true, force: true });
});
const fixture = (extra: Record<string, unknown> = {}) => ({ v: "5.13.0", fr: 30, ip: 0, op: 30, w: 128, h: 128, layers: [], ...extra });
async function source(bytes: string | Buffer) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "cut-animation-boundary-")); directories.push(directory);
  const file = path.join(directory, "private-source"); await fs.writeFile(file, bytes);
  return { directory, file };
}

describe("exact native animation byte boundary", () => {
  it("reads and validates actual bounded vector bytes", async () => {
    const { file } = await source(JSON.stringify(fixture()));
    expect(await readCutNativeAnimationSource("lottie", file)).toEqual({ kind: "lottie", animationData: fixture(), timing: { frameRate: 30, inPoint: 0, outPoint: 30 } });
  });
  it.each([
    ["expression", fixture({ layers: [{ ty: 4, ks: { o: { a: 0, k: 100, x: "globalThis.privateMarker = true;" } } }] }), /expressions/],
    ["external resource", fixture({ assets: [{ u: "https://example.invalid/", p: "image.png" }] }), /external/],
    ["unsupported runtime", fixture({ layers: [{ ty: 13 }] }), /unsupported/],
  ] as const)("rejects %s before launching any renderer", async (_name, document, error) => {
    const { file, directory } = await source(JSON.stringify(document));
    await expect(renderCutAnimationFrames({ kind: "lottie", sourcePath: file, outputDirectory: path.join(directory, "frames"), width: 128, height: 128, fps: 30, duration: .1 })).rejects.toThrow(error);
    expect(runtime.launch).not.toHaveBeenCalled();
  });
  it("rejects oversized, empty and malformed files before rendering", async () => {
    for (const bytes of [Buffer.alloc(CUT_NATIVE_LOTTIE_MAX_BYTES + 1), Buffer.alloc(0), Buffer.from("{")]) {
      const { file, directory } = await source(bytes);
      await expect(renderCutAnimationFrames({ kind: "lottie", sourcePath: file, outputDirectory: path.join(directory, "frames"), width: 128, height: 128, fps: 30, duration: .1 })).rejects.toThrow();
    }
    expect(runtime.launch).not.toHaveBeenCalled();
  });
  it("revalidates Rive bytes rather than trusting a filename or media-kind row", async () => {
    const { file, directory } = await source(Buffer.from("not-RIVE-data"));
    await expect(renderCutAnimationFrames({ kind: "rive", sourcePath: file, outputDirectory: path.join(directory, "frames"), width: 128, height: 128, fps: 30, duration: .1 })).rejects.toThrow(/header/);
    expect(runtime.launch).not.toHaveBeenCalled();
    const valid = Buffer.from([0x52, 0x49, 0x56, 0x45, 7, 0, 0, 0]);
    await fs.writeFile(file, valid);
    expect(await readCutNativeAnimationSource("rive", file)).toEqual({ kind: "rive", bytes: valid });
  });
  it("detects file growth or truncation on the same handle and always closes it", async () => {
    for (const readBytes of [1, 3]) {
      const close = vi.fn(async () => undefined);
      const read = vi.fn().mockResolvedValueOnce({ bytesRead: readBytes }).mockResolvedValue({ bytesRead: 0 });
      vi.spyOn(fs, "open").mockResolvedValue({ stat: async () => ({ isFile: () => true, size: 2 }), read, close } as any);
      await expect(readCutNativeAnimationSource("lottie", "never-opened-private-path")).rejects.toThrow(/changed/);
      expect(close).toHaveBeenCalledOnce();
      vi.restoreAllMocks();
    }
  });
  it("uses the non-expression player inside an offline context with HTTP and socket denial", async () => {
    const { file, directory } = await source(JSON.stringify(fixture()));
    const page = { setContent: vi.fn(async () => undefined), addScriptTag: vi.fn(async () => undefined), evaluate: vi.fn(async () => undefined), screenshot: vi.fn(async () => Buffer.from("pixels")) };
    const context = { newPage: vi.fn(async () => page), route: vi.fn(async (_pattern: string, _handler: (route: any) => unknown) => undefined), routeWebSocket: vi.fn(async (_pattern: string, _handler: (socket: any) => unknown) => undefined), close: vi.fn(async () => undefined) };
    const browser = { newContext: vi.fn(async () => context) };
    runtime.launch.mockResolvedValue(browser);
    await renderCutAnimationFrames({ kind: "lottie", sourcePath: file, outputDirectory: path.join(directory, "frames"), width: 128, height: 128, fps: 30, duration: .1 });
    expect(browser.newContext).toHaveBeenCalledWith({ viewport: { width: 128, height: 128 }, deviceScaleFactor: 1, serviceWorkers: "block", offline: true, acceptDownloads: false });
    const abort = vi.fn(), close = vi.fn();
    expect(context.route.mock.calls[0][0]).toBe("**/*");
    await (context.route.mock.calls[0] as any)[1]({ abort }); expect(abort).toHaveBeenCalledWith("blockedbyclient");
    expect(context.routeWebSocket.mock.calls[0][0]).toBe("**/*");
    await (context.routeWebSocket.mock.calls[0] as any)[1]({ close }); expect(close).toHaveBeenCalledWith({ code: 1008 });
    const player = (page.addScriptTag.mock.calls[0] as any)[0].path;
    expect(player).toMatch(/lottie_light\.min\.js$/);
    expect(await fs.readFile(player, "utf8")).not.toMatch(/\beval\s*\(/);
    expect(context.close).toHaveBeenCalledOnce(); expect(runtime.close).toHaveBeenCalledWith(browser);
  });
});
