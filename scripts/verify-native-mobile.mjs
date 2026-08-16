import { existsSync, readFileSync } from "node:fs";

const required = [
  "capacitor.config.ts",
  "client/public/runners/background.js",
  "android/app/src/main/AndroidManifest.xml",
  "ios/App/App/Info.plist",
  "migrations/0103_native_mobile.sql",
];

const missing = required.filter((path) => !existsSync(path));
if (missing.length) {
  console.error(`Native mobile shell is incomplete: ${missing.join(", ")}`);
  process.exit(1);
}

const config = readFileSync("capacitor.config.ts", "utf8");
const runner = readFileSync("client/public/runners/background.js", "utf8");
const migration = readFileSync("migrations/0103_native_mobile.sql", "utf8");
const swiftPackage = readFileSync("ios/App/CapApp-SPM/Package.swift", "utf8");
const checks = [
  [config.includes('appId: "net.creativesos.app"'), "stable app id"],
  [config.includes('webDir: "dist/public"'), "Vite web directory"],
  [config.includes("interval: 15"), "bounded background cadence"],
  [runner.includes("creativesos:last-background-wake"), "privacy-safe background wake"],
  [migration.includes('"push_token_ciphertext" text NOT NULL'), "encrypted token storage"],
  [migration.includes('UNIQUE("user_id", "installation_id")'), "owner-scoped installation uniqueness"],
  [/CREATE UNIQUE INDEX IF NOT EXISTS "mobile_device_registrations_active_token_hash_unique"[\s\S]*?ON "mobile_device_registrations" \("push_token_hash"\)[\s\S]*?WHERE "status" = 'active';/.test(migration), "active-token uniqueness"],
  [!swiftPackage.includes("..\\..\\..\\node_modules"), "portable iOS package paths"],
];
const failed = checks.filter(([ok]) => !ok).map(([, label]) => label);
if (failed.length) {
  console.error(`Native mobile contract failed: ${failed.join(", ")}`);
  process.exit(1);
}
console.log("Native mobile shell contract passed.");
