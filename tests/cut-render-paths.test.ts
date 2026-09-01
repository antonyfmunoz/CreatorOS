import path from "node:path";
import { describe, expect, it } from "vitest";
import { cutJobErrorDetail, cutRenderWorkspacePaths } from "../server/cut-render-paths";

describe("CutStudio render workspace isolation", () => {
  it("never renders over a source whose filename matches the project output", () => {
    const workspace = cutRenderWorkspacePaths(
      path.join("tmp", "creativesos-cut-test"),
      "creativesos-cutstudio-gcp-e2e",
      "creativesos-cutstudio-gcp-e2e.mp4",
    );

    expect(workspace.outputName).toBe("creativesos-cutstudio-gcp-e2e.mp4");
    expect(workspace.sourcePath).toContain("input-source.mp4");
    expect(workspace.outputPath).toContain("render-output.mp4");
    expect(workspace.sourcePath).not.toBe(workspace.outputPath);
  });

  it("bounds job errors while retaining the diagnostic tail", () => {
    const detail = cutJobErrorDetail(new Error(`ffmpeg exited 1: ${"metadata ".repeat(40)}Output same as Input #0 - exiting`));
    expect(detail).toHaveLength(240);
    expect(detail).toMatch(/^ffmpeg exited 1:/);
    expect(detail).toContain("Output same as Input #0 - exiting");
  });
});
