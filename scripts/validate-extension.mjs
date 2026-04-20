import fs from "node:fs";
import path from "node:path";

export function validateExtensionProject(projectRoot) {
  const extensionRoot = path.join(projectRoot, "extension");
  const manifestPath = path.join(extensionRoot, "manifest.json");

  assertExists(manifestPath, "Missing manifest.json");

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const errors = [];

  const requiredFiles = new Set();
  if (manifest.background?.service_worker) {
    requiredFiles.add(manifest.background.service_worker);
  }
  if (manifest.action?.default_popup) {
    requiredFiles.add(manifest.action.default_popup);
  }
  for (const script of manifest.content_scripts || []) {
    for (const file of script.js || []) {
      requiredFiles.add(file);
    }
    for (const file of script.css || []) {
      requiredFiles.add(file);
    }
  }
  for (const iconPath of Object.values(manifest.icons || {})) {
    requiredFiles.add(iconPath);
  }

  for (const relativeFile of requiredFiles) {
    const fullPath = path.join(extensionRoot, relativeFile);
    if (!fs.existsSync(fullPath)) {
      errors.push(`Manifest references missing file: extension/${relativeFile}`);
    }
  }

  const popupPath = manifest.action?.default_popup
    ? path.join(extensionRoot, manifest.action.default_popup)
    : null;
  if (popupPath && fs.existsSync(popupPath)) {
    const popupHtml = fs.readFileSync(popupPath, "utf8");
    const scriptMatches = [...popupHtml.matchAll(/<script[^>]+src="([^"]+)"/g)];
    const stylesheetMatches = [...popupHtml.matchAll(/<link[^>]+href="([^"]+)"/g)];

    for (const [, relativeFile] of [...scriptMatches, ...stylesheetMatches]) {
      const fullPath = path.join(path.dirname(popupPath), relativeFile);
      if (!fs.existsSync(fullPath)) {
        errors.push(`Popup references missing file: extension/${relativeFile}`);
      }
    }
  }

  if (manifest.manifest_version !== 3) {
    errors.push("Only Manifest V3 is supported by the local build tooling.");
  }

  return {
    errors,
    extensionRoot,
    manifest,
    manifestPath,
  };
}

function assertExists(filePath, message) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${message}: ${filePath}`);
  }
}
