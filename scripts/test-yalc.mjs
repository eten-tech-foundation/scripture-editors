import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageRoot = join(workspace, "packages/platform");
const packageName = "@eten-tech-foundation/platform-editor";

// Keep the consumer outside the workspace so missing dependencies cannot resolve
// through the editor's development node_modules. Never use the user's yalc store.
const temporary = mkdtempSync(join(tmpdir(), "platform-editor-yalc-"));
const staging = join(temporary, "package");
const consumer = join(temporary, "consumer");
const store = join(temporary, "store");
const yalc = require.resolve("yalc/src/yalc.js");

function run(cwd, command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, NODE_PATH: "", CI: "true" },
    stdio: "inherit",
    ...options,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command} ${args.join(" ")} failed`);
}

function runYalc(cwd, ...args) {
  run(cwd, process.execPath, [yalc, ...args, "--store-folder", store]);
}

function runPnpm(...args) {
  // On Windows pnpm is a .cmd shim. All arguments here are fixed by this check.
  run(consumer, "pnpm", args, { shell: process.platform === "win32" });
}

function checkConsumer() {
  runPnpm("exec", "vite", "build");
  runPnpm("exec", "vitest", "run", "--environment", "jsdom", "--maxWorkers", "1");
}

console.log(`Testing yalc in ${temporary}`);
try {
  mkdirSync(staging);
  cpSync(join(packageRoot, "dist"), join(staging, "dist"), { recursive: true });
  cpSync(join(packageRoot, "package.json"), join(staging, "package.json"));
  // Used only by yalc to resolve workspace: versions in the staged manifest.
  // node_modules is never included in the stored or installed package.
  symlinkSync(join(packageRoot, "node_modules"), join(staging, "node_modules"), "junction");
  run(staging, process.execPath, [
    require.resolve("tsx/cli"),
    join(workspace, "scripts/prepare-publish.ts"),
  ]);
  runYalc(staging, "publish", "--no-scripts");

  cpSync(join(workspace, "scripts/fixtures/yalc-consumer"), consumer, { recursive: true });
  cpSync(join(consumer, "manifest.json"), join(consumer, "package.json"));
  runYalc(consumer, "add", packageName);
  runPnpm("add", "-D", "yjs@^13.6.30");
  runPnpm("install", "--no-frozen-lockfile");
  checkConsumer();

  // A push replaces pnpm's package symlink. Verify that the documented install
  // step both restores dependency resolution and loads the updated artifact.
  const entry = join(staging, "dist/index.js");
  writeFileSync(entry, readFileSync(entry, "utf8") + "\nexport const yalcSmokeUpdate = true;\n");
  runYalc(staging, "push", "--no-scripts");
  runPnpm("install", "--no-frozen-lockfile");
  writeFileSync(
    join(consumer, "update.test.js"),
    `import { expect, test } from "vitest";
import { yalcSmokeUpdate } from "${packageName}";
test("loads the pushed package", () => expect(yalcSmokeUpdate).toBe(true));
`,
  );
  checkConsumer();
  console.log("Yalc consumer build, render, and update passed.");
} finally {
  // Only the unique directory created above is removed, including on failure.
  rmSync(temporary, { recursive: true, force: true });
}
