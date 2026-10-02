const { app, BrowserWindow, shell } = require("electron");

const REMOTE_APP_URL = "https://aleppo-center-cash.vercel.app/";

let mainWindow = null;

function showLoadFailure(error) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const safeError = String(error || "Unknown error").replace(/[<>&]/g, (char) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
  })[char]);

  const html = `
    <!doctype html>
    <html>
      <head><meta charset="utf-8"><title>Aleppo Center Cash</title></head>
      <body style="font-family:Segoe UI,Arial,sans-serif;padding:40px;background:#0b1715;color:#fff">
        <h1>Aleppo Center Cash</h1>
        <p>تعذر الاتصال بنسخة الويب الحالية.</p>
        <p style="opacity:.75">The app requires an Internet connection to load the latest version.</p>
        <pre style="white-space:pre-wrap;background:#15221f;padding:16px;border-radius:10px">${safeError}</pre>
      </body>
    </html>
  `;

  mainWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(html));
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
      remoteUrl: REMOTE_APP_URL,
    });
    showLoadFailure(`${errorCode}: ${errorDescription}\n${validatedURL}`);
  });

  try {
    await mainWindow.loadURL(REMOTE_APP_URL);
  } catch (error) {
    console.error("Aleppo Center Cash remote load failed:", error);
    showLoadFailure(error);
  }
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
