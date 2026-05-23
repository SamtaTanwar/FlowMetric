const { spawn } = require("node:child_process");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const isWindows = process.platform === "win32";

function run(command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: rootDir,
    shell: isWindows,
    stdio: "inherit",
    ...options,
  });

  return child;
}

const next = run("npm", ["run", "dev", "--", "--port", "3000"]);

setTimeout(() => {
  const electronPath = require("electron");
  const electron = run(electronPath, ["."], {
    env: {
      ...process.env,
      ELECTRON_START_URL: "http://localhost:3000",
    },
  });

  electron.on("exit", () => {
    next.kill();
  });
}, 3500);

process.on("SIGINT", () => {
  next.kill();
  process.exit();
});
