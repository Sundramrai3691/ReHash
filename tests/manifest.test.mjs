import test from "node:test";
import assert from "node:assert/strict";

import { validateExtensionProject } from "../scripts/validate-extension.mjs";

test("manifest and popup asset references are internally consistent", () => {
  const { errors, manifest } = validateExtensionProject(process.cwd());
  assert.equal(manifest.name, "ReHash");
  assert.deepEqual(errors, []);
});
