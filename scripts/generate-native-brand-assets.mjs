import { readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const source = "client/public/field-capture-icon.svg";
const sourceViewBoxSize = 512;

function densityFor(width, height) {
  return Math.max(
    72,
    Math.ceil((Math.max(width, height) / sourceViewBoxSize) * 72),
  );
}

function filesBelow(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

async function square(path) {
  const metadata = await sharp(path).metadata();
  if (!metadata.width || !metadata.height) throw new Error(`Missing dimensions for ${path}`);
  const next = `${path}.next`;
  await sharp(source, { density: densityFor(metadata.width, metadata.height) })
    .resize(metadata.width, metadata.height)
    .png()
    .toFile(next);
  rmSync(path);
  renameSync(next, path);
}

async function splash(path) {
  const metadata = await sharp(path).metadata();
  if (!metadata.width || !metadata.height) throw new Error(`Missing dimensions for ${path}`);
  const size = Math.round(Math.min(metadata.width, metadata.height) * 0.28);
  const icon = await sharp(source, { density: densityFor(size, size) })
    .resize(size, size)
    .png()
    .toBuffer();
  const next = `${path}.next`;
  await sharp({ create: { width: metadata.width, height: metadata.height, channels: 4, background: "#000000" } })
    .composite([{ input: icon, gravity: "centre" }])
    .png()
    .toFile(next);
  rmSync(path);
  renameSync(next, path);
}

const android = filesBelow("android/app/src/main/res").filter((path) => path.endsWith(".png"));
for (const path of android) {
  if (path.toLowerCase().includes("splash")) await splash(path);
  else if (path.toLowerCase().includes("ic_launcher")) await square(path);
}

const iosIcon = "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png";
await sharp(source, { density: densityFor(1024, 1024) })
  .resize(1024, 1024)
  .png()
  .toFile(iosIcon);
for (const path of filesBelow("ios/App/App/Assets.xcassets/Splash.imageset").filter((value) => value.endsWith(".png"))) {
  await splash(path);
}

console.log("Native brand assets generated from the checked-in CreativesOS icon.");
