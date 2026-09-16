import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import ts from "typescript";

// Use the same esbuild version as the workspace's Vite build.
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("vite"))("esbuild");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageArg = process.argv.indexOf("--package-dir");
if (packageArg >= 0 && !process.argv[packageArg + 1]) {
  throw new Error("--package-dir requires a built package directory");
}
const packageRoot =
  packageArg < 0
    ? path.join(root, "packages/platform")
    : path.resolve(process.argv[packageArg + 1]);
const packageName = "@eten-tech-foundation/platform-editor";
const manifest = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8"));
const measureOnly = process.argv.includes("--measure-only");
const cases = [
  ["root-editorial", "", "Editorial"],
  ["root-all", "", "*"],
  ["root-view-options", "", "getViewOptions"],
  ["editorial", "/editorial", "Editorial"],
  ["view-options", "/view-options", "getViewOptions"],
];
const measurements = {};

for (const [name, subpath, symbol] of cases) {
  if (measureOnly && subpath && !manifest.exports["." + subpath]) {
    continue;
  }
  const result = await build({
    stdin: {
      contents: `export ${symbol === "*" ? "*" : `{ ${symbol} }`} from "${packageName}${subpath}";`,
      sourcefile: "consumer.js",
      resolveDir: packageRoot,
    },
    bundle: true,
    minify: true,
    platform: "browser",
    format: "esm",
    target: "es2022",
    define: { "process.env.NODE_ENV": '"production"' },
    external: ["react", "react-dom", "yjs"],
    metafile: true,
    write: false,
    outfile: path.join(root, "tmp/platform-bundle/consumer.js"),
    logLevel: "silent",
  });
  const js = result.outputFiles.find((file) => file.path.endsWith(".js"));
  assert(js, `No JavaScript output for ${name}`);
  const inputs = Object.values(result.metafile.outputs).flatMap((output) =>
    Object.entries(output.inputs)
      .filter(([, contribution]) => contribution.bytesInOutput > 0)
      .map(([file]) => file.replaceAll("\\", "/")),
  );
  measurements[name] = {
    minifiedBytes: js.contents.length,
    gzipBytes: gzipSync(js.contents).length,
  };
  if (measureOnly) continue;

  if (name === "root-editorial" || name === "editorial" || name.endsWith("view-options")) {
    assert(
      !inputs.some((file) => /\/marginal\/|@lexical\/yjs|LexicalCollaboration/.test(file)),
      `${name} includes margin comments or the Yjs binding`,
    );
    assert(
      !Object.values(result.metafile.outputs).some((output) =>
        output.imports.some((item) => item.path === "yjs"),
      ),
      `${name} imports the optional yjs peer`,
    );
  }
  if (name.endsWith("view-options")) {
    assert(
      !inputs.some((file) => /node_modules\/(@lexical\/|lexical\/|react\/)/.test(file)),
      "View helpers include an editor runtime",
    );
    assert(js.contents.length < 5000, "View helpers should remain a small standalone entry");
  }
  if (name === "root-all") {
    assert(
      inputs.some((file) => /\/marginal\//.test(file)),
      "The compatibility entry must still export Marginal",
    );
  }
}

// A published entry's declaration must be self-contained, including private workspace types.
if (!measureOnly) {
  for (const entry of ["index", "editorial-entry", "view-options"]) {
    const declarations = readFileSync(path.join(packageRoot, "dist", entry + ".d.ts"), "utf8");
    assert(
      !/from ["']shared(?:-react)?["']/.test(declarations),
      `${entry}.d.ts exposes a private workspace import`,
    );
  }
  const cssExports = Object.entries(manifest.exports).filter(([name]) => name.endsWith(".css"));
  if (cssExports.length === 0) {
    assert(
      existsSync(path.join(packageRoot, "dist/index.css")),
      "Keep the existing CSS artifact name",
    );
  }
  for (const [subpath, target] of cssExports) {
    assert(
      typeof target === "string" && existsSync(path.join(packageRoot, target)),
      `Missing stylesheet export: ${subpath}`,
    );
    const styled = await build({
      stdin: {
        contents: `import "${packageName}${subpath.slice(1)}";`,
        resolveDir: packageRoot,
      },
      bundle: true,
      write: false,
      outfile: path.join(root, "tmp/platform-bundle/style-check.js"),
      logLevel: "silent",
    });
    assert(
      styled.outputFiles.some((file) => file.path.endsWith(".css") && file.contents.length > 0),
      `Consumer bundling drops stylesheet: ${subpath}`,
    );
  }
}
if (!measureOnly) {
  const program = ts.createProgram({
    rootNames: [path.join(root, "scripts/fixtures/platform-bundle/types.ts")],
    options: {
      noEmit: true,
      strict: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      paths: {
        [packageName]: [path.join(packageRoot, "dist/index.d.ts")],
        [packageName + "/editorial"]: [path.join(packageRoot, "dist/editorial-entry.d.ts")],
        [packageName + "/view-options"]: [path.join(packageRoot, "dist/view-options.d.ts")],
      },
    },
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(
    diagnostics.length,
    0,
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (file) => file,
      getCurrentDirectory: () => root,
      getNewLine: () => "\n",
    }),
  );
}
console.log(JSON.stringify(measurements, undefined, 2));
