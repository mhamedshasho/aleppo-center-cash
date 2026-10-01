const { app, BrowserWindow, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");

let mainWindow = null;

function getIndexPath() {
  return path.join(app.getAppPath(), "dist", "public", "index.html");
}

function showLoadFailure(error) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const indexPath = getIndexPath();
  const safeError = String(error || "Unknown error").replace(/[<>&]/g, (char) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
  })[char]);
  const safePath = indexPath.replace(/[<>&]/g, (char) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
  })[char]);

  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <!doctype html>
    <html>
      <head><meta charset="utf-8"><title>Aleppo Center Cash</title></head>
      <body style="font-family:Segoe UI,Arial,sans-serif;padding:40px;background:#0b1715;color:#fff">
        <h1>Aleppo Center Cash</h1>
        <p>تعذر تشغيل واجهة التطبيق.</p>
        <p style="opacity:.75">The desktop package could not load its application files.</p>
        <pre style="white-space:pre-wrap;background:#15221f;padding:16px;border-radius:10px">${safeError}\n\n${safePath}</pre>
      </body>
    </html>
  `)}`);
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: "#0b1715",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("Aleppo Center Cash renderer exited:", details);
  });

  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    console.error("Aleppo Center Cash failed to load:", {
      errorCode,
      errorDescription,
      validatedURL,
      indexPath: getIndexPath(),
    });
    showLoadFailure(`${errorCode}: ${errorDescription}\n${validatedURL}`);
  });

  const indexPath = getIndexPath();
  if (!fs.existsSync(indexPath)) {
    showLoadFailure(`Missing application entry file: ${indexPath}`);
    return;
  }

  await mainWindow.loadURL(pathToFileURL(indexPath).href);
}

app.whenReady().then(() => {
  void createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
