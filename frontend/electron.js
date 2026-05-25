const { app, BrowserWindow, ipcMain, powerMonitor } = require("electron");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const contentTypes = {
  ".css": "text/css",
  ".html": "text/html",
  ".ico": "image/x-icon",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain",
  ".webm": "video/webm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function resolveStaticPath(outDir, requestUrl = "/") {
  const url = new URL(requestUrl, "http://localhost");
  let pathname = decodeURIComponent(url.pathname);

  if (pathname === "/") {
    pathname = "/index.html";
  } else if (!path.extname(pathname)) {
    pathname = `${pathname}.html`;
  }

  const filePath = path.normalize(path.join(outDir, pathname));

  if (!filePath.startsWith(outDir)) {
    return path.join(outDir, "404.html");
  }

  return filePath;
}

function startStaticServer() {
  const outDir = path.join(__dirname, "out");

  const server = http.createServer((request, response) => {
    const filePath = resolveStaticPath(outDir, request.url);
    const fallbackPath = path.join(outDir, "404.html");
    const finalPath = fs.existsSync(filePath) ? filePath : fallbackPath;
    const contentType = contentTypes[path.extname(finalPath)] || "application/octet-stream";

    response.writeHead(finalPath === fallbackPath ? 404 : 200, {
      "Content-Type": contentType,
    });
    fs.createReadStream(finalPath).pipe(response);
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        server,
        url: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}

function createWindow(startUrl) {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#030417",
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  mainWindow.loadURL(process.env.ELECTRON_START_URL || startUrl);
}

let staticServer;
let trackerTimer = null;
let trackerConfig = null;
let currentUsage = null;
let currentIdleStartedAt = null;
const idleThresholdSeconds = 5 * 60;

function getForegroundWindowInfo() {
  if (process.platform !== "win32") {
    return Promise.resolve({
      appName: "Employee Workflow Tracking",
      windowTitle: "Desktop app",
    });
  }

  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
"@
$hwnd = [Win32]::GetForegroundWindow()
$processId = 0
[Win32]::GetWindowThreadProcessId($hwnd, [ref]$processId) | Out-Null
$process = Get-Process -Id $processId -ErrorAction SilentlyContinue
[pscustomobject]@{
  appName = if ($process) { $process.ProcessName } else { "Unknown app" }
  windowTitle = if ($process) { $process.MainWindowTitle } else { "Unknown window" }
} | ConvertTo-Json -Compress
`;

  return new Promise((resolve) => {
    execFile("powershell.exe", ["-NoProfile", "-Command", script], { windowsHide: true }, (error, stdout) => {
      if (error) {
        resolve({ appName: "Unknown app", windowTitle: "Unknown window" });
        return;
      }

      try {
        const parsed = JSON.parse(stdout.trim());
        resolve({
          appName: parsed.appName || "Unknown app",
          windowTitle: parsed.windowTitle || "Unknown window",
        });
      } catch {
        resolve({ appName: "Unknown app", windowTitle: "Unknown window" });
      }
    });
  });
}

async function flushCurrentUsage(endAt = Date.now()) {
  if (!trackerConfig || !currentUsage) {
    return;
  }

  const durationSeconds = Math.max(0, Math.round((endAt - currentUsage.startedAt) / 1000));

  if (durationSeconds < 5) {
    currentUsage = null;
    return;
  }

  await recordTrackingEvent({
    type: "APP_USAGE",
    durationSeconds,
    appName: currentUsage.appName,
    windowTitle: currentUsage.windowTitle,
    metadata: {
      source: "desktop-active-window",
    },
  });

  currentUsage = null;
}

async function recordTrackingEvent(payload) {
  if (!trackerConfig) {
    return;
  }

  await fetch(`${trackerConfig.apiBaseUrl}/api/tracking/event`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${trackerConfig.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sessionId: trackerConfig.sessionId,
      ...payload,
    }),
  }).catch(() => null);
}

async function sampleForegroundWindow() {
  if (!trackerConfig || currentIdleStartedAt) {
    return;
  }

  const nextUsage = await getForegroundWindowInfo();
  const hasChanged =
    !currentUsage ||
    currentUsage.appName !== nextUsage.appName ||
    currentUsage.windowTitle !== nextUsage.windowTitle;

  if (!hasChanged) {
    return;
  }

  await flushCurrentUsage();
  currentUsage = {
    appName: nextUsage.appName,
    windowTitle: nextUsage.windowTitle,
    startedAt: Date.now(),
  };
}

async function sampleSystemIdleState() {
  if (!trackerConfig) {
    return;
  }

  const idleSeconds = powerMonitor.getSystemIdleTime();

  if (idleSeconds >= idleThresholdSeconds && !currentIdleStartedAt) {
    const idleStartedAt = Date.now() - idleSeconds * 1000;

    await flushCurrentUsage(idleStartedAt);
    currentIdleStartedAt = idleStartedAt;
    await recordTrackingEvent({
      type: "IDLE_START",
      metadata: {
        source: "desktop-system-idle",
        thresholdSeconds: idleThresholdSeconds,
      },
    });
    return;
  }

  if (idleSeconds < idleThresholdSeconds && currentIdleStartedAt) {
    const durationSeconds = Math.max(1, Math.round((Date.now() - currentIdleStartedAt) / 1000));

    await recordTrackingEvent({
      type: "IDLE_END",
      durationSeconds,
      metadata: {
        source: "desktop-system-idle",
        thresholdSeconds: idleThresholdSeconds,
      },
    });
    currentIdleStartedAt = null;
  }
}

async function sampleDesktopState() {
  await sampleSystemIdleState();

  if (!currentIdleStartedAt) {
    await sampleForegroundWindow();
  }
}

async function stopDesktopTracking() {
  if (trackerTimer) {
    clearInterval(trackerTimer);
    trackerTimer = null;
  }

  if (currentIdleStartedAt) {
    const durationSeconds = Math.max(1, Math.round((Date.now() - currentIdleStartedAt) / 1000));

    await recordTrackingEvent({
      type: "IDLE_END",
      durationSeconds,
      metadata: {
        source: "desktop-system-idle",
        thresholdSeconds: idleThresholdSeconds,
      },
    });
    currentIdleStartedAt = null;
  }

  await flushCurrentUsage();
  trackerConfig = null;
}

ipcMain.handle("desktop-tracker:start", async (_event, config) => {
  await stopDesktopTracking();

  if (!config?.apiBaseUrl || !config?.token || !config?.sessionId) {
    return { ok: false };
  }

  trackerConfig = config;
  await sampleDesktopState();
  trackerTimer = setInterval(sampleDesktopState, 15000);

  return { ok: true };
});

ipcMain.handle("desktop-tracker:stop", async () => {
  await stopDesktopTracking();
  return { ok: true };
});

app.whenReady().then(async () => {
  const staticApp = await startStaticServer();
  staticServer = staticApp.server;
  createWindow(staticApp.url);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(staticApp.url);
    }
  });
});

app.on("window-all-closed", () => {
  stopDesktopTracking();

  if (staticServer) {
    staticServer.close();
  }

  if (process.platform !== "darwin") {
    app.quit();
  }
});
