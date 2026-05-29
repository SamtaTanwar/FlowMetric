const { app, BrowserWindow, desktopCapturer, ipcMain, powerMonitor, screen } = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { execFile } = require("node:child_process");

let mainWindow = null;
let trackerState = null;
let lastScreenshotCapture = {
  sessionId: null,
  capturedAtMs: 0,
};
let trackerStatus = {
  isRunning: false,
  lastUsage: null,
  lastError: "",
  lastSentAt: null,
  lastScreenshotAt: null,
  nextScreenshotAt: null,
  lastResponseStatus: null,
};
const powershellPath = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
const staticOutDir = path.join(__dirname, "out");
let staticServer = null;
let staticServerUrl = "";
const DEFAULT_SCREENSHOT_INTERVAL_MINUTES = 10;
const DEFAULT_IDLE_THRESHOLD_MINUTES = 5;

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
    width: 1920,
height: 1080,
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
  let loadAttempts = 0;
  const maxLoadAttempts = process.env.ELECTRON_START_URL ? 60 : 1;
  const loadApp = () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    loadAttempts += 1;
    mainWindow.loadURL(startUrl).catch(() => {});
    mainWindow.maximize();
mainWindow.show();
  };

  mainWindow.webContents.on(
    "did-fail-load",
    (_event, _errorCode, _errorDescription, _validatedUrl, isMainFrame) => {
      if (!isMainFrame || loadAttempts >= maxLoadAttempts) {
        return;
      }

      setTimeout(loadApp, 1000);
    },
  );

  loadApp();
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

          resolve({
            appName,
            windowTitle: windowTitle || appName,
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
  if (!trackerState || durationSeconds <= 0 || !usage?.appName) {
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
        windowTitle: usage.windowTitle || usage.appName,
        metadata: {
          category: usageCategory(usage.appName, usage.windowTitle || usage.appName),
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

async function captureDesktopScreenshot() {
  const display = screen.getPrimaryDisplay();
  const scaleFactor = display.scaleFactor || 1;
  const thumbnailSize = {
    width: Math.round(display.size.width * scaleFactor),
    height: Math.round(display.size.height * scaleFactor),
  };
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize,
  });
  const primarySource = sources.find((source) => source.display_id === String(display.id)) || sources[0];

  if (!primarySource || primarySource.thumbnail.isEmpty()) {
    throw new Error("Could not capture screen thumbnail");
  }

  const size = primarySource.thumbnail.getSize();

  return {
    imageDataUrl: primarySource.thumbnail.toDataURL(),
    width: size.width,
    height: size.height,
  };
}

function addIdleBorderToImageDataUrl(imageDataUrl, width, height) {
  const safeWidth = Math.max(1, Math.round(width || 1));
  const safeHeight = Math.max(1, Math.round(height || 1));
  const strokeWidth = Math.max(8, Math.round(Math.min(safeWidth, safeHeight) * 0.008));
  const inset = Math.ceil(strokeWidth / 2);
  const rectWidth = Math.max(1, safeWidth - strokeWidth);
  const rectHeight = Math.max(1, safeHeight - strokeWidth);
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${safeWidth}" height="${safeHeight}" viewBox="0 0 ${safeWidth} ${safeHeight}">
  <image href="${imageDataUrl}" x="0" y="0" width="${safeWidth}" height="${safeHeight}" preserveAspectRatio="none"/>
  <rect x="${inset}" y="${inset}" width="${rectWidth}" height="${rectHeight}" fill="none" stroke="#ef4444" stroke-width="${strokeWidth}"/>
</svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function setNextScreenshotDueAt(dueAtMs) {
  if (!trackerState) {
    return;
  }

  trackerState.nextScreenshotDueAtMs = dueAtMs;
  trackerStatus.nextScreenshotAt = new Date(dueAtMs).toISOString();
}

function scheduleNextScreenshotFrom(fromMs = Date.now()) {
  if (!trackerState) {
    return;
  }

  const dueAtMs = fromMs + trackerState.screenshotIntervalMs;
  const delayMs = Math.max(1_000, dueAtMs - Date.now());

  if (trackerState.screenshotInterval) {
    clearTimeout(trackerState.screenshotInterval);
  }

  setNextScreenshotDueAt(dueAtMs);
  trackerState.screenshotInterval = setTimeout(sendScheduledScreenshot, delayMs);
}

async function sendScheduledScreenshot() {
  if (!trackerState || trackerState.isScreenshotInFlight) {
    return;
  }

  await sendScreenshot();

  if (trackerState) {
    scheduleNextScreenshotFrom(lastScreenshotCapture.capturedAtMs || Date.now());
  }
}

async function sendScreenshot() {
  if (!trackerState) {
    return;
  }

  if (trackerState.isScreenshotInFlight) {
    return;
  }

  const now = Date.now();
  const minimumGapMs = Math.min(60_000, Math.max(1_000, trackerState.screenshotIntervalMs - 1_000));

  if (
    lastScreenshotCapture.sessionId === trackerState.sessionId &&
    now - lastScreenshotCapture.capturedAtMs < minimumGapMs
  ) {
    return;
  }

  trackerState.isScreenshotInFlight = true;

  try {
    const screenshot = await captureDesktopScreenshot();
    const currentUsage = trackerState.currentUsage || await getForegroundWindow();
    const idleSeconds = powerMonitor.getSystemIdleTime();
    const isIdle = idleSeconds > trackerState.idleThresholdSeconds;
    const imageDataUrl = isIdle
      ? addIdleBorderToImageDataUrl(screenshot.imageDataUrl, screenshot.width, screenshot.height)
      : screenshot.imageDataUrl;
    const response = await fetch(`${trackerState.apiBaseUrl}/api/screenshots`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${trackerState.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId: trackerState.sessionId,
        imageDataUrl,
        capturedAt: new Date().toISOString(),
        isIdle,
        appName: currentUsage?.appName || null,
        windowTitle: currentUsage?.windowTitle || null,
      }),
    });

    trackerStatus.lastScreenshotAt = new Date().toISOString();
    trackerStatus.lastResponseStatus = response.status;
    trackerStatus.lastError = response.ok ? "" : `Backend rejected screenshot: ${response.status}`;
    if (response.ok) {
      lastScreenshotCapture = {
        sessionId: trackerState.sessionId,
        capturedAtMs: Date.now(),
      };
    }
  } catch (error) {
    trackerStatus.lastError = error instanceof Error ? error.message : "Could not capture screenshot";
  } finally {
    if (trackerState) {
      trackerState.isScreenshotInFlight = false;
    }
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
  clearTimeout(trackerState.screenshotInterval);

  if (trackerState.currentUsage) {
    const durationSeconds =
      trackerState.pendingSeconds +
      Math.max(1, Math.round((Date.now() - trackerState.lastSeenAt) / 1000));
    await sendUsageEvent(trackerState.currentUsage, durationSeconds);
  }

  trackerState = null;
  trackerStatus.isRunning = false;
  trackerStatus.nextScreenshotAt = null;
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
    screenshotInterval: null,
    isScreenshotInFlight: false,
    nextScreenshotDueAtMs: null,
    screenshotIntervalMs: Math.max(
      60_000,
      Number(config.screenshotIntervalMinutes || DEFAULT_SCREENSHOT_INTERVAL_MINUTES) * 60_000,
    ),
    idleThresholdSeconds: Math.max(
      60,
      Number(config.idleThresholdMinutes || DEFAULT_IDLE_THRESHOLD_MINUTES) * 60,
    ),
    interval: null,
  };
  trackerStatus = {
    isRunning: true,
    lastUsage: null,
    lastError: "",
    lastSentAt: null,
    lastScreenshotAt: null,
    nextScreenshotAt: null,
    lastResponseStatus: null,
  };

  await sampleForegroundWindow();
  await sendScreenshot();
  trackerState.interval = setInterval(sampleForegroundWindow, 5000);
  scheduleNextScreenshotFrom(lastScreenshotCapture.capturedAtMs || Date.now());

  return { ok: true, status: trackerStatus };
});

ipcMain.handle("desktop-tracker:stop", stopTracker);
ipcMain.handle("desktop-tracker:status", () => trackerStatus);
ipcMain.handle("desktop-tracker:capture-now", async () => {
  await sampleForegroundWindow();
  await sendScreenshot();
  if (trackerState && lastScreenshotCapture.sessionId === trackerState.sessionId) {
    scheduleNextScreenshotFrom(lastScreenshotCapture.capturedAtMs || Date.now());
  }
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
