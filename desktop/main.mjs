import { app, BrowserWindow, dialog, Menu, session } from "electron";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appUrl = (process.env.CREATIVESOS_DESKTOP_URL ?? "https://creativesos.net").replace(/\/$/, "");
const launchUrl = new URL(appUrl);
if (launchUrl.protocol !== "https:" && !(launchUrl.protocol === "http:" && ["localhost", "127.0.0.1"].includes(launchUrl.hostname))) throw new Error("CreativesOS Desktop requires HTTPS or an explicit local development URL.");
const allowedOrigin = launchUrl.origin;
let mainWindow;

function permittedUrl(url) {
  try { return new URL(url).origin === allowedOrigin; } catch { return false; }
}

function runOneLocalNodeJob() {
  return new Promise((resolve) => {
    const cli = path.join(root, "cli", "creativesos.mjs");
    const child = spawn(process.execPath, [cli, "node", "work"], {
    cwd: root,
    shell: false,
    windowsHide: true,
    // Packaged Electron archives are not host paths that Docker can mount or
    // pass to seccomp. electron-builder copies this runtime to resources so
    // the same CLI path remains a real, inspectable local directory.
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      ...(app.isPackaged ? { CREATIVESOS_CUT_CODE_RUNTIME_DIR: path.join(process.resourcesPath, "cut-code-runtime") } : {}),
    },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const append = (chunk) => { output = `${output}${chunk}`.slice(-12_000); };
    child.stdout.on("data", append); child.stderr.on("data", append);
    const timeout = setTimeout(() => child.kill(), 3 * 60_000);
    child.once("error", (error) => { clearTimeout(timeout); resolve({ ok: false, output: error.message }); });
    child.once("close", (code) => { clearTimeout(timeout); resolve({ ok: code === 0, output: output || `Local-node command ended with code ${code}.` }); });
  });
}

async function showLocalNodeResult() {
  const result = await runOneLocalNodeJob();
  await dialog.showMessageBox(mainWindow, { type: result.ok ? "info" : "error", title: result.ok ? "Local node" : "Local node could not run", message: result.ok ? "Local-node task complete" : "Local-node task failed", detail: result.output });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 960, minWidth: 960, minHeight: 680,
    backgroundColor: "#000000", autoHideMenuBar: false,
    webPreferences: { preload: path.join(root, "desktop", "preload.mjs"), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => { if (!permittedUrl(url)) event.preventDefault(); });
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  void mainWindow.loadURL(appUrl);
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "CreativesOS", submenu: [{ label: "Run one local node job", click: () => void showLocalNodeResult() }, { role: "quit" }] },
    { label: "View", submenu: [{ role: "reload" }, { role: "toggleDevTools" }, { role: "togglefullscreen" }] },
  ]));
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
