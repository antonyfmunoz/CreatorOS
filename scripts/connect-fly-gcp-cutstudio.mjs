import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function spawnCli(executable, args, options) {
  if (process.platform === "win32" && /\.(?:cmd|bat)$/i.test(executable)) {
    if (args.some((argument) => !/^[A-Za-z0-9._:/=@-]+$/.test(argument))) {
      throw new Error("A Windows CLI argument contains unsupported characters");
    }
    const powerShellWrapper = executable.replace(/\.cmd$/i, ".ps1");
    if (fs.existsSync(powerShellWrapper)) {
      return spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", powerShellWrapper, ...args], options);
    }
    return spawnSync(executable, args, { ...options, shell: true });
  }
  return spawnSync(executable, args, options);
}

const dispatcherUrl = process.argv.find((argument) => argument.startsWith("https://"));
const activate = process.argv.includes("--activate");
if (!dispatcherUrl || !/^https:\/\/[^/]+\.run\.app\/dispatch$/.test(dispatcherUrl)) {
  throw new Error("Pass the exact HTTPS Cloud Run dispatcher URL ending in /dispatch");
}

const gcloud = process.env.GCLOUD_PATH || path.join(process.env.LOCALAPPDATA || "", "GoogleCloudCLI-579", "google-cloud-sdk", "bin", "gcloud.cmd");
if (!fs.existsSync(gcloud)) throw new Error(`Google Cloud CLI was not found at ${gcloud}`);

const secretResult = spawnCli(gcloud, ["secrets", "versions", "access", "latest", "--secret", "creativesos-cut-dispatch-secret", "--project", "creativesos-504623"], { encoding: null, windowsHide: true });
if (secretResult.status !== 0 || !secretResult.stdout?.length) {
  const detail = secretResult.error?.code || Buffer.from(secretResult.stderr || []).toString("utf8").trim().split(/\r?\n/, 1)[0] || `exit ${secretResult.status}`;
  throw new Error(`Unable to read the CutStudio dispatcher secret from Google Secret Manager (${detail})`);
}
const secret = Buffer.from(secretResult.stdout).toString("utf8").trim();
if (secret.length < 32 || /[\r\n]/.test(secret)) throw new Error("The CutStudio dispatcher secret is invalid");

const flyctl = process.env.FLYCTL_PATH || "flyctl";
const input = Buffer.from([
  `CUT_CLOUD_DISPATCH_SECRET=${secret}`,
  `CUT_CLOUD_DISPATCH_URL=${dispatcherUrl}`,
  "CUT_STUDIO_PROCESSING_MODE=external",
  "",
].join(os.EOL), "utf8");
try {
  const args = ["secrets", "import", "--app", "creatoros-app", ...(activate ? [] : ["--stage"] )];
  const result = spawnCli(flyctl, args, { input, stdio: ["pipe", "inherit", "inherit"], windowsHide: true });
  if (result.status !== 0) throw new Error("Fly secret import failed");
} finally {
  input.fill(0);
  secretResult.stdout.fill(0);
}

process.stdout.write(`${JSON.stringify({ status: activate ? "activated" : "staged", app: "creatoros-app", dispatcherUrl })}\n`);
