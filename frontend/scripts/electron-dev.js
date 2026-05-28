const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const isWindows = process.platform === "win32";
const devServerUrl = "http://localhost:3000";

function run(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: rootDir,
    shell: isWindows,
    stdio: "inherit",
    ...options,
  });

  return child;
}

function waitForUrl(url, timeoutMs = 60_000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      const request = http.get(url, (response) => {
        response.resume();
        resolve();
      });

      request.on("error", () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }

        setTimeout(check, 500);
      });

      request.setTimeout(1500, () => {
        request.destroy();
      });
    };

    check();
  });
}

const next = run("npm", ["run", "dev", "--", "--port", "3000"]);

waitForUrl(devServerUrl)
  .then(() => {
    const electronPath = require("electron");
    const electron = run(electronPath, ["."], {
      env: {
        ...process.env,
        ELECTRON_START_URL: devServerUrl,
      },
    });

    electron.on("exit", () => {
      next.kill();
    });
  })
  .catch((error) => {
    console.error(error.message);
    next.kill();
    process.exit(1);
  });

process.on("SIGINT", () => {
  next.kill();
  process.exit();
});
