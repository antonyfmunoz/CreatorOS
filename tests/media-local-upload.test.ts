import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { materializeStoredAsset, persistUpload } from "../server/asset-storage";

afterEach(() => vi.unstubAllEnvs());

it.each([false, true])("materializes a local upload through its stored key (legacy prefix: %s)", async (legacy) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "media-local-upload-test-"));
  try {
    const root = path.join(directory, "uploads"); await mkdir(root);
    vi.stubEnv("ASSET_STORAGE_PROVIDER", "local"); vi.stubEnv("CREATOROS_UPLOAD_DIR", root);
    const source = path.join(root, "synthetic.mp4"); await writeFile(source, "owned fixture bytes");
    const stored = await persistUpload({ filename: "synthetic.mp4", path: source, originalname: "synthetic.mp4", mimetype: "video/mp4" } as Express.Multer.File, 1, "video");
    expect(stored.publicUrl).toBe("/uploads/synthetic.mp4");
    expect(stored.storageKey).toBe("synthetic.mp4");
    const output = path.join(directory, "retrieved.mp4");
    await materializeStoredAsset(legacy ? "uploads/synthetic.mp4" : stored.storageKey, "public", output);
    expect(await readFile(output, "utf8")).toBe("owned fixture bytes");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it("retains nested managed keys and denies paths outside the upload root", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "media-local-upload-test-"));
  try {
    const root = path.join(directory, "uploads"); await mkdir(path.join(root, "creativesos"), { recursive: true });
    vi.stubEnv("ASSET_STORAGE_PROVIDER", "local"); vi.stubEnv("CREATOROS_UPLOAD_DIR", root);
    await writeFile(path.join(root, "creativesos", "managed.mp4"), "managed fixture");
    await writeFile(path.join(directory, "outside.mp4"), "outside fixture");
    const output = path.join(directory, "retrieved.mp4");
    await materializeStoredAsset("creativesos/managed.mp4", "public", output);
    expect(await readFile(output, "utf8")).toBe("managed fixture");
    for (const key of ["../outside.mp4", "uploads/../../outside.mp4", path.join(directory, "outside.mp4")]) {
      await expect(materializeStoredAsset(key, "public", output)).rejects.toThrow(/relative|escaped/);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
