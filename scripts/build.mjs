import fs from "node:fs";
import path from "node:path";

import { validateExtensionProject } from "./validate-extension.mjs";

const projectRoot = process.cwd();
const distRoot = path.join(projectRoot, "dist");
const bundleRoot = path.join(distRoot, "rehash-extension");

const { errors, manifest } = validateExtensionProject(projectRoot);

if (errors.length > 0) {
  console.error("Build failed because the extension is not internally consistent:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

fs.rmSync(distRoot, { force: true, recursive: true });
fs.mkdirSync(bundleRoot, { recursive: true });
fs.cpSync(path.join(projectRoot, "extension"), bundleRoot, { recursive: true });

const publicRoot = path.join(projectRoot, "public");
if (fs.existsSync(publicRoot)) {
  fs.cpSync(publicRoot, path.join(bundleRoot, "public"), { recursive: true });
}

console.log("ReHash build is ready.");
console.log(`Bundle folder: ${bundleRoot}`);
console.log(`Load this folder in chrome://extensions as an unpacked extension.`);
console.log(`Manifest: ${manifest.name} v${manifest.version}`);
