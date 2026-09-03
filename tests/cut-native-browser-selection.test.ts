import { beforeEach, describe, expect, it, vi } from "vitest";
import { cutNativeChromiumExecutable } from "../server/cut-animation-renderer";

const files = vi.hoisted(() => ({ access: vi.fn() }));
vi.mock("node:fs/promises", () => ({ default: files }));
beforeEach(() => vi.resetAllMocks());

describe("native renderer browser selection", () => {
  it("uses the pinned headless default on Windows without probing user Chrome", async () => {
    expect(await cutNativeChromiumExecutable({ PROGRAMFILES: "C:/UserProgramFiles", LOCALAPPDATA: "C:/PrivateProfile" }, "win32")).toBeUndefined();
    expect(files.access).not.toHaveBeenCalled();
  });
  it.each(["win32", "linux"] as const)("honors an explicit existing executable on %s", async (platform) => {
    files.access.mockResolvedValue(undefined);
    expect(await cutNativeChromiumExecutable({ CUT_ANIMATION_CHROMIUM_PATH: "/approved/chromium" }, platform)).toBe("/approved/chromium");
    expect(files.access).toHaveBeenCalledExactlyOnceWith("/approved/chromium");
  });
  it("fails closed on a broken explicit override without exposing its path or silently falling back", async () => {
    files.access.mockRejectedValue(new Error("ENOENT /private/custom-chromium"));
    await expect(cutNativeChromiumExecutable({ CUT_ANIMATION_CHROMIUM_PATH: "/private/custom-chromium" }, "win32")).rejects.toThrow(/^The configured native Chromium executable is unavailable$/);
    expect(files.access).toHaveBeenCalledTimes(1);
  });
  it("preserves the production Linux system-browser order", async () => {
    files.access.mockRejectedValueOnce(new Error("missing")).mockResolvedValue(undefined);
    expect(await cutNativeChromiumExecutable({}, "linux")).toBe("/usr/bin/chromium-browser");
    expect(files.access.mock.calls).toEqual([["/usr/bin/chromium"], ["/usr/bin/chromium-browser"]]);
  });
  it("rejects a missing Linux runtime instead of making a provider or browser substitution", async () => {
    files.access.mockRejectedValue(new Error("missing"));
    await expect(cutNativeChromiumExecutable({}, "linux")).rejects.toThrow(/requires Chromium/);
    expect(files.access.mock.calls).toEqual([["/usr/bin/chromium"], ["/usr/bin/chromium-browser"], ["/usr/bin/google-chrome"]]);
  });
});
