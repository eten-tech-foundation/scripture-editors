#!/usr/bin/env tsx
/* eslint-disable no-console */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { convert } from "./convert.js";

interface CliArgs {
  in: string;
  out: string;
  base?: string;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const css = readFileSync(resolve(args.in), "utf-8");
  const baseScss = args.base ? readFileSync(resolve(args.base), "utf-8") : undefined;
  const { scss, markerCount, warnings } = convert(css, { source: args.in, baseScss });
  writeFileSync(resolve(args.out), scss, "utf-8");
  console.log(`Wrote ${args.out} — ${markerCount} markers${summarizeWarnings(warnings)}`);
}

function parseArgs(argv: string[]): CliArgs {
  let inPath: string | undefined;
  let outPath: string | undefined;
  let basePath: string | undefined;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") continue;
    else if (arg === "--in") inPath = argv[++i];
    else if (arg === "--out") outPath = argv[++i];
    else if (arg === "--base") basePath = argv[++i];
    else if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      printUsage();
      process.exit(2);
    }
  }
  if (!inPath || !outPath) {
    printUsage();
    process.exit(2);
  }
  return { in: inPath, out: outPath, base: basePath };
}

function summarizeWarnings(w: ReturnType<typeof convert>["warnings"]): string {
  const parts: string[] = [];
  if (w.unknownProperties.length) parts.push(`${w.unknownProperties.length} unknown properties`);
  if (w.skippedTableMarkers.length)
    parts.push(`${w.skippedTableMarkers.length} table markers skipped`);
  if (w.skippedSelectors.length)
    parts.push(`${w.skippedSelectors.length} non-marker selectors skipped`);
  if (w.duplicateMarkers.length) parts.push(`${w.duplicateMarkers.length} duplicate markers`);
  if (w.baseOverlapMarkers.length) parts.push(`${w.baseOverlapMarkers.length} base overlaps`);
  return parts.length ? ` (${parts.join(", ")})` : "";
}

function printUsage(): void {
  console.error(
    "Usage: pt9-css-to-editor-scss --in <input.css> --out <output.scss> [--base <_usj-nodes.scss>]",
  );
}

main();
