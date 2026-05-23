const { app, BrowserWindow } = require("electron");
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
    },
  });

  mainWindow.loadURL(process.env.ELECTRON_START_URL || startUrl);
}

let staticServer;

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
  if (staticServer) {
    staticServer.close();
  }

  if (process.platform !== "darwin") {
    app.quit();
  }
});
