import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { createCutTextRasterizer } from "../server/cut-text-layout-renderer";
import { resolveCutTextLayout } from "../shared/cut-text-layout";

const directory = await fs.mkdtemp(path.join(os.tmpdir(), "creativesos-native-text-proof-"));
const renderer = createCutTextRasterizer();
const records: Array<Record<string, unknown>> = [];
const cases = [
  { id: "wrapped", text: "ALPHA BRAVO CHARLIE DELTA ECHO FOXTROT\nGOLF HOTEL INDIA", width: 1024, height: 432, canvasWidth: 1280, referenceWidth: 1280, style: { fontSize: 72, textAlign: "center", verticalAlign: "middle", lineHeight: 1.6, fontWeight: 600, letterSpacing: 1.2, paddingX: 20 } },
  { id: "portrait", text: "Turn attention into momentum", width: 292, height: 116, canvasWidth: 406, referenceWidth: 1920, style: { fontSize: 72, verticalAlign: "middle" } },
  { id: "literal", text: "Literal: <img src='https://example.invalid'>\nNo HTML or remote resource execution.", width: 800, height: 300, canvasWidth: 800, referenceWidth: 800, style: { fontSize: 32, fontStyle: "italic", textAlign: "right", verticalAlign: "bottom" } },
];
try {
  for (const item of cases) {
    const outputPath = path.join(directory, `${item.id}.png`);
    const started = performance.now();
    await renderer.render({ ...item, layout: resolveCutTextLayout(item.style), textColor: "#ffffff", backgroundColor: "#1d9bf0", backgroundOpacity: .25, outputPath });
    const bytes = await fs.readFile(outputPath);
    const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, item.width); assert.equal(info.height, item.height);
    let whitePixels = 0; let transparentPixels = 0; let partialPixels = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] > 220 && data[index + 1] > 220 && data[index + 2] > 220 && data[index + 3] > 200) whitePixels++;
      if (data[index + 3] === 0) transparentPixels++;
      if (data[index + 3] > 0 && data[index + 3] < 150) partialPixels++;
    }
    assert.ok(whitePixels > 100, "Expected actual glyph pixels");
    assert.ok(partialPixels > item.width * item.height / 2, "Expected preserved partial background alpha");
    records.push({ id: item.id, width: info.width, height: info.height, whitePixels, transparentPixels, partialPixels, sha256: createHash("sha256").update(bytes).digest("hex"), milliseconds: Math.round(performance.now() - started) });
  }
} finally { await renderer.close(); }
await assert.rejects(renderer.render({ ...cases[0], layout: resolveCutTextLayout({}), textColor: "#ffffff", backgroundColor: "#000000", backgroundOpacity: 0, outputPath: path.join(directory, "closed.png") }), /closed/);
const receipt = { schema: "creativesos.native-text-proof.v1", directory, cases: records, closedRendererRejected: true };
await fs.writeFile(path.join(directory, "receipt.json"), JSON.stringify(receipt, null, 2));
console.log(JSON.stringify(receipt));
