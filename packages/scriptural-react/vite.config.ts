import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { join } from "path";
import dts from "vite-plugin-dts";
import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import viteTsConfigPaths from "vite-tsconfig-paths";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { readFileSync } from "fs";

const packageName = "scriptural-react";
const outDir = `packages/${packageName}/dist`;
const privatePackagesDirName = `internal-packages`;

const privatePackagesPaths: Set<string> = new Set();

export default defineConfig({
  cacheDir: ".vite",
  plugins: [
    react(),
    nodeResolve({
      moduleDirectories: ["node_modules"],
    }),
    dts({
      tsconfigPath: join(__dirname, "tsconfig.lib.json"),
      entryRoot: "src",
      include: ["src", "../../packages/**/*"],
      pathsToAliases: true,
      strictOutput: false,
      copyDtsFiles: true,
      beforeWriteFile: (filePath, content) => {
        let newFilePath = filePath;

        if (filePath.includes("packages/")) {
          const match = filePath.match(/packages\/([^/]+)(?:\/src)?\/(.*)$/);
          if (match) {
            const pkgName = match[1];

            if (pkgName === packageName) {
              newFilePath = outDir + "/" + match[2].replace("src/", "").replace("dist/", "");
            } else if (privatePackagesPaths.has(`${pkgName}`)) {
              newFilePath = outDir + "/" + privatePackagesDirName + "/" + pkgName + "/" + match[2];
            } else {
              return false;
            }
          }
        }

        let newContent = content;

        const privatePackages = [...privatePackagesPaths].join("|");
        const regexString = `from ['"]../../((?:../)*)(${privatePackages})([^'"]*)['"]`;
        const regex = new RegExp(regexString, "g");

        // Fix import paths in the content
        newContent = content.replace(regex, `from '$1${privatePackagesDirName}/$2$3'`);

        return {
          filePath: newFilePath,
          content: newContent,
        };
      },
    }),
    nxViteTsPaths(),
    viteTsConfigPaths({
      root: "../../",
    }),
    viteStaticCopy({
      targets: [
        {
          src: "src/styles/**/*.css",
          dest: "styles",
        },
        {
          src: [
            "README.md",
            "LICENSE",
            "API.md",
            "GUIDES.md",
            "CONTRIBUTING.md",
            "CODE_OF_CONDUCT.md",
            "CHANGELOG.md",
          ],
          dest: ".",
        },
      ],
    }),
  ],
  build: {
    minify: false,
    lib: {
      entry: "src/index.ts",
      fileName: "index",
      formats: ["es"],
      name: packageName,
    },
    rollupOptions: {
      jsx: "preserve",
      external: (id: string) => {
        if (id.includes("node_modules")) {
          const pkgName = id.match(/node_modules\/(?:\.pnpm\/)?([^/]+)/)?.[1];
          return !!pkgName;
        }
        return false;
      },
      makeAbsoluteExternalsRelative: false,
      preserveEntrySignatures: "allow-extension",
      output: {
        minifyInternalExports: false,

        chunkFileNames: "[name].js",
        manualChunks: (_id: string) => {
          const id = _id.replace(/\\/g, "/");
          if (id.includes("node_modules")) {
            return null;
          }

          if (id.includes(packageName + "/")) {
            return id.split("src/")[1].replace(".tsx", "").replace(".ts", "");
          }

          if (id.includes("packages/") && !id.includes(packageName + "/")) {
            const match = id.match(/packages\/([^/]+)/);
            if (match) {
              // Add the package path to our Set when encountered
              privatePackagesPaths.add(`${match[1]}`);

              return (
                privatePackagesDirName +
                "/" +
                id
                  .split("packages/")[1]
                  .replace("src/", "")
                  .replace(".tsx", "")
                  .replace(".ts", "")
                  .replace(".js", "")
                  .replace(".jsx", "")
              );
            }
          }
          console.log("\x1b[31m\x1b[1m=== ID ===\x1b[0m SKIPPING:", id);
          return id.replace(".tsx", "").replace(".ts", "").replace(".js", "").replace(".jsx", "");
        },
        exports: "named",
        paths: (id: string) => {
          if (id.includes("node_modules")) {
            const rgx = /(.*node_modules\/(?:\.pnpm\/)?)((?:@[^/]+\/[^/]+)|[^/]+)(.*)/;
            const matches = id.match(rgx);
            if (matches) {
              // const fullPath = matches[0];
              const nodeModulesPath = matches[1];
              const pkgName = matches[2];
              const filePath = matches[3];

              const pkgJsonPath = join(nodeModulesPath, pkgName, "package.json");
              const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
              const main = pkgJson.main;
              const module = pkgJson.module;
              const unpkg = pkgJson.unpkg;
              const types = pkgJson.types;
              const exports = pkgJson.exports as Exports;

              const replacements: Array<{
                pattern: string; // The part of the path to be replaced
                replacement: string; // What to replace it with
              }> = [
                { pattern: main, replacement: "" },
                { pattern: module, replacement: "" },
                { pattern: unpkg, replacement: "" },
                { pattern: types, replacement: "" },
              ];

              if (typeof exports === "string") {
                replacements.push({ pattern: exports, replacement: "" });
              } else if (typeof exports === "object") {
                const handleExports = (exports: Exports, parentKey = "") => {
                  if (typeof exports === "string") {
                    replacements.push({ pattern: exports, replacement: parentKey });
                  } else if (Array.isArray(exports)) {
                    exports.forEach((exp) => {
                      if (typeof exp === "string") {
                        replacements.push({ pattern: exp, replacement: parentKey });
                      } else if (typeof exp === "object") {
                        Object.entries(exp).forEach(([key, value]) => {
                          if (key.startsWith("./") || key === ".") {
                            if (typeof value === "string") {
                              replacements.push({ pattern: value, replacement: key });
                            } else if (typeof value === "object") {
                              handleExports(value, key);
                            }
                          } else {
                            if (typeof value === "string") {
                              replacements.push({ pattern: value, replacement: parentKey });
                            } else if (typeof value === "object") {
                              handleExports(value, parentKey);
                            }
                          }
                        });
                      }
                    });
                  } else if (typeof exports === "object" && exports !== null) {
                    Object.entries(exports).forEach(([key, value]) => {
                      if (key.startsWith("./") || key === ".") {
                        if (typeof value === "string") {
                          replacements.push({ pattern: value, replacement: key });
                        } else if (typeof value === "object") {
                          handleExports(value, key);
                        }
                      } else {
                        if (typeof value === "string") {
                          replacements.push({ pattern: value, replacement: parentKey });
                        } else if (typeof value === "object") {
                          handleExports(value, parentKey);
                        }
                      }
                    });
                  }
                };

                handleExports(exports);
              }

              let finalPath = pkgName + filePath;

              replacements.forEach((x) => {
                if (!x.pattern) return;
                const cleanMatch = x.pattern.startsWith("./") ? x.pattern.slice(2) : x.pattern;
                const cleanReplacement = x.replacement.startsWith("./")
                  ? x.replacement.slice(2)
                  : x.replacement;
                //convert cleanPattern to a regex if it contains *
                const regex = cleanMatch.includes("*")
                  ? new RegExp(
                      cleanMatch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace("\\*", "(.*)"),
                    )
                  : cleanMatch;

                const replacementPattern = cleanReplacement.includes("*")
                  ? cleanReplacement.replace(/\*/g, (_, i) => `$${i + 1}`)
                  : cleanReplacement === "."
                    ? ""
                    : cleanReplacement;

                finalPath = finalPath.replace(regex, replacementPattern);
              });

              return finalPath.replace(/\/$/, "");
            }
          }

          return id
            .replace(/\.js$/, "")
            .replace(/\.jsx$/, "")
            .replace(/\.tsx$/, "")
            .replace(/\.ts$/, "");
        },
      },
    },
  },
});

type ExportConditions = {
  // eslint-disable-line @typescript-eslint/consistent-indexed-object-style
  [condition: string]: Exports;
};

/**
	Entry points of a module, optionally with conditions and subpath exports.
	*/
export type Exports = null | string | Array<string | ExportConditions> | ExportConditions;
