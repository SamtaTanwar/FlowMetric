const { spawnSync } = require("node:child_process");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const electronBuilderCli = path.join(
  rootDir,
  "node_modules",
  "electron-builder",
  "out",
  "cli",
  "cli.js",
);

const env = {
  ...process.env,
  NPM_CONFIG_LOGLEVEL: "silent",
  npm_config_loglevel: "silent",
};

if (process.platform === "win32") {
  const system32 = "C:\\Windows\\System32";
  env.PATH = `${system32};${env.PATH || ""}`;
  env.Path = `${system32};${env.Path || ""}`;
}

const result = spawnSync(process.execPath, [electronBuilderCli, "--projectDir", ".electron-app"], {
  cwd: rootDir,
  env,
  shell: false,
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error);
}

process.exit(result.status ?? 1);
