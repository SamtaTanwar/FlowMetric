const { app, BrowserWindow, ipcMain } = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { execFile } = require("node:child_process");

let mainWindow = null;
let trackerState = null;
let trackerStatus = {
  isRunning: false,
  lastUsage: null,
  lastError: "",
  lastSentAt: null,
  lastResponseStatus: null,
};
const powershellPath = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
const staticOutDir = path.join(__dirname, "out");
let staticServer = null;
let staticServerUrl = "";

const foregroundWindowScript = `
$memberDefinition = @'
[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
[DllImport("user32.dll", SetLastError=true)] public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder text, int count);
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
'@
Add-Type -Namespace Win32 -Name User32 -MemberDefinition $memberDefinition
$hwnd = [Win32.User32]::GetForegroundWindow()
$text = New-Object System.Text.StringBuilder 1024
[void][Win32.User32]::GetWindowText($hwnd, $text, $text.Capacity)
$processId = 0
[void][Win32.User32]::GetWindowThreadProcessId($hwnd, [ref]$processId)
$process = Get-Process -Id $processId -ErrorAction SilentlyContinue
[PSCustomObject]@{
  appName = if ($process) { $process.ProcessName } else { "Unknown app" }
  windowTitle = $text.ToString()
} | ConvertTo-Json -Compress
`;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#020617",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const startUrl = process.env.ELECTRON_START_URL || await startStaticServer();
  mainWindow.loadURL(startUrl);
}

function resolveStaticFile(pathname) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const relativePath = requestedPath.replace(/^\/+/, "");
  const candidates = [];

  if (path.extname(requestedPath)) {
    candidates.push(path.join(staticOutDir, relativePath));
  } else {
    candidates.push(path.join(staticOutDir, `${relativePath}.html`));
    candidates.push(path.join(staticOutDir, relativePath, "index.html"));
  }

  candidates.push(path.join(staticOutDir, "404.html"));

  return candidates.find((candidate) => {
    const resolved = path.resolve(candidate);
    return resolved.startsWith(path.resolve(staticOutDir)) && fs.existsSync(resolved);
  });
}

function startStaticServer() {
  if (staticServerUrl) {
    return Promise.resolve(staticServerUrl);
  }

  staticServer = http.createServer((request, response) => {
    const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
    const filePath = resolveStaticFile(decodeURIComponent(requestUrl.pathname));

    if (!filePath) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    const stats = fs.statSync(filePath);
    const contentType = contentTypeFor(filePath);
    const range = request.headers.range;

    if (range) {
      const match = range.match(/bytes=(\d+)-(\d*)/);
      const start = match ? Number(match[1]) : 0;
      const end = match && match[2] ? Number(match[2]) : stats.size - 1;
      const safeEnd = Math.min(end, stats.size - 1);
      const chunkSize = safeEnd - start + 1;

      response.writeHead(206, {
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunkSize),
        "Content-Range": `bytes ${start}-${safeEnd}/${stats.size}`,
        "Content-Type": contentType,
      });
      fs.createReadStream(filePath, { start, end: safeEnd }).pipe(response);
      return;
    }

    response.writeHead(200, {
        "Accept-Ranges": "bytes",
        "Content-Length": String(stats.size),
        "Content-Type": contentType,
    });
    fs.createReadStream(filePath).pipe(response);
  });

  return new Promise((resolve) => {
    staticServer.listen(0, "127.0.0.1", () => {
      const address = staticServer.address();
      const port = typeof address === "object" && address ? address.port : 0;
      staticServerUrl = `http://127.0.0.1:${port}`;
      resolve(staticServerUrl);
    });
  });
}

function contentTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".html") return "text/html; charset=utf-8";
  if (extension === ".js") return "text/javascript; charset=utf-8";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".json") return "application/json; charset=utf-8";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".ico") return "image/x-icon";
  if (extension === ".mp4") return "video/mp4";
  if (extension === ".txt") return "text/plain; charset=utf-8";

  return "application/octet-stream";
}

function getForegroundWindow() {
  return new Promise((resolve) => {
    execFile(
      powershellPath,
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-EncodedCommand",
        Buffer.from(foregroundWindowScript, "utf16le").toString("base64"),
      ],
      { windowsHide: true, timeout: 5000 },
      (error, stdout) => {
        if (error || !stdout.trim()) {
          trackerStatus.lastError = error ? error.message : "No foreground window output";
          resolve(null);
          return;
        }

        try {
          const json = stdout.match(/\{.*\}/s)?.[0];

          if (!json) {
            trackerStatus.lastError = "Foreground window output did not include JSON";
            resolve(null);
            return;
          }

          const parsed = JSON.parse(json);
          const appName = String(parsed.appName || "Unknown app").trim();
          const windowTitle = String(parsed.windowTitle || "").trim();

          if (!windowTitle) {
            trackerStatus.lastError = `Foreground app has empty window title: ${appName}`;
            resolve(null);
            return;
          }

          resolve({
            appName,
            windowTitle,
          });
        } catch {
          trackerStatus.lastError = "Could not parse foreground window output";
          resolve(null);
        }
      },
    );
  });
}

function usageCategory(appName, windowTitle) {
  const text = `${appName} ${windowTitle}`.toLowerCase();
  const unproductiveKeywords = [
    "youtube",
    "netflix",
    "spotify",
    "facebook",
    "instagram",
    "whatsapp",
    "telegram",
    "reddit",
    "twitter",
    "x.com",
    "game",
    "steam",
    "epic games",
  ];

  return unproductiveKeywords.some((keyword) => text.includes(keyword))
    ? "UNPRODUCTIVE"
    : "PRODUCTIVE";
}

async function sendUsageEvent(usage, durationSeconds) {
  if (!trackerState || durationSeconds <= 0 || !usage?.windowTitle) {
    return;
  }

  try {
    const response = await fetch(`${trackerState.apiBaseUrl}/api/tracking/event`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${trackerState.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId: trackerState.sessionId,
        type: "APP_USAGE",
        durationSeconds,
        appName: usage.appName,
        windowTitle: usage.windowTitle,
        metadata: {
          category: usageCategory(usage.appName, usage.windowTitle),
          source: "electron-foreground-window",
        },
      }),
    });
    trackerStatus.lastSentAt = new Date().toISOString();
    trackerStatus.lastResponseStatus = response.status;
    trackerStatus.lastUsage = usage;
    trackerStatus.lastError = response.ok ? "" : `Backend rejected app usage: ${response.status}`;
  } catch (error) {
    trackerStatus.lastError = error instanceof Error ? error.message : "Could not send app usage";
  }
}

async function sampleForegroundWindow() {
  if (!trackerState) {
    return;
  }

  const now = Date.now();
  const currentUsage = await getForegroundWindow();

  if (!currentUsage) {
    trackerState.lastSeenAt = now;
    return;
  }

  const previousUsage = trackerState.currentUsage;
  const durationSeconds = Math.max(1, Math.round((now - trackerState.lastSeenAt) / 1000));

  if (
    previousUsage &&
    (previousUsage.appName !== currentUsage.appName ||
      previousUsage.windowTitle !== currentUsage.windowTitle)
  ) {
    await sendUsageEvent(previousUsage, trackerState.pendingSeconds + durationSeconds);
    trackerState.currentUsage = currentUsage;
    trackerState.lastSeenAt = now;
    trackerState.pendingSeconds = 0;
    return;
  }

  trackerState.currentUsage = currentUsage;
  trackerState.pendingSeconds += durationSeconds;
  trackerState.lastSeenAt = now;

  if (trackerState.pendingSeconds >= 5) {
    await sendUsageEvent(currentUsage, trackerState.pendingSeconds);
    trackerState.pendingSeconds = 0;
  }
}

async function stopTracker() {
  if (!trackerState) {
    return { ok: true };
  }

  clearInterval(trackerState.interval);

  if (trackerState.currentUsage) {
    const durationSeconds =
      trackerState.pendingSeconds +
      Math.max(1, Math.round((Date.now() - trackerState.lastSeenAt) / 1000));
    await sendUsageEvent(trackerState.currentUsage, durationSeconds);
  }

  trackerState = null;
  trackerStatus.isRunning = false;
  return { ok: true };
}

ipcMain.handle("desktop-tracker:start", async (_event, config) => {
  await stopTracker();

  trackerState = {
    apiBaseUrl: String(config.apiBaseUrl || "").replace(/\/$/, ""),
    token: String(config.token || ""),
    sessionId: Number(config.sessionId),
    currentUsage: null,
    lastSeenAt: Date.now(),
    pendingSeconds: 0,
    interval: null,
  };
  trackerStatus = {
    isRunning: true,
    lastUsage: null,
    lastError: "",
    lastSentAt: null,
    lastResponseStatus: null,
  };

  await sampleForegroundWindow();
  trackerState.interval = setInterval(sampleForegroundWindow, 5000);

  return { ok: true, status: trackerStatus };
});

ipcMain.handle("desktop-tracker:stop", stopTracker);
ipcMain.handle("desktop-tracker:status", () => trackerStatus);
ipcMain.handle("desktop-tracker:capture-now", async () => {
  await sampleForegroundWindow();
  return trackerStatus;
});

app.whenReady().then(createWindow);

app.on("before-quit", () => {
  stopTracker();
});

app.on("window-all-closed", () => {
  staticServer?.close();

  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
