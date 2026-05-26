const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const appDir = path.join(rootDir, ".electron-app");
const outDir = path.join(rootDir, "out");

function copyDir(source, destination) {
  fs.mkdirSync(destination, { recursive: true });

  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      copyDir(sourcePath, destinationPath);
    } else {
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
}

fs.rmSync(appDir, { recursive: true, force: true });
fs.mkdirSync(appDir, { recursive: true });

fs.copyFileSync(path.join(rootDir, "electron.js"), path.join(appDir, "electron.js"));
fs.copyFileSync(path.join(rootDir, "preload.js"), path.join(appDir, "preload.js"));
copyDir(outDir, path.join(appDir, "out"));

const packageJson = {
  name: "flowmetric",
  version: "0.1.0",
  private: true,
  main: "electron.js",
  description: "FlowMetric Desktop App",
  author: "Nandni",
  dependencies: {},
  devDependencies: {},
  build: {
    appId: "com.employee.workflow",
    productName: "FlowMetric",
    electronVersion: "42.2.0",
    asar: false,
    npmRebuild: false,
    directories: {
      output: "../dist",
    },
    files: [
      "electron.js",
      "preload.js",
      "package.json",
      "out/**/*",
    ],
    win: {
      target: "portable",
      signAndEditExecutable: false,
    },
  },
};

fs.writeFileSync(
  path.join(appDir, "package.json"),
  `${JSON.stringify(packageJson, null, 2)}\n`,
);
