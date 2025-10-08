#!/usr/bin/env node
/**
 * Script to publish packages from the monorepo
 * Usage: node tools/scripts/publish.mjs <package-name> <version> <tag>
 * Example: node tools/scripts/publish.mjs scriptural-react 0.0.18 latest
 */

import { execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const [, , packageName, version, tag = "latest"] = process.argv;

if (!packageName) {
  console.error("❌ Error: Package name is required");
  console.log("Usage: node tools/scripts/publish.mjs <package-name> [version] [tag]");
  process.exit(1);
}

const packagePath = join("packages", packageName);
const distPath = join(packagePath, "dist");

// Verify package exists
if (!existsSync(packagePath)) {
  console.error(`❌ Error: Package "${packageName}" not found at ${packagePath}`);
  process.exit(1);
}

// Verify dist directory exists
if (!existsSync(distPath)) {
  console.error(`❌ Error: Dist directory not found at ${distPath}`);
  console.log("💡 Did you forget to build? Run: nx build " + packageName);
  process.exit(1);
}

// Read package.json to get actual version
const packageJsonPath = join(distPath, "package.json");
if (!existsSync(packageJsonPath)) {
  console.error(`❌ Error: package.json not found in dist at ${packageJsonPath}`);
  process.exit(1);
}

const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
const actualVersion = version || packageJson.version;

console.log(`\n📦 Publishing ${packageJson.name}@${actualVersion} with tag "${tag}"\n`);

try {
  // Check if already logged in to npm
  try {
    execSync("npm whoami", { stdio: "pipe" });
    console.log("✅ Already logged in to npm");
  } catch (error) {
    console.log("⚠️  Not logged in to npm. Please run: npm login");
    process.exit(1);
  }

  // Dry run first to check for issues
  console.log("🔍 Running publish dry-run...");
  execSync(`npm publish --dry-run --tag ${tag}`, {
    cwd: distPath,
    stdio: "inherit",
  });

  console.log("\n✅ Dry run successful!\n");

  // Ask for confirmation (in a real script, you'd use readline or similar)
  console.log("Ready to publish. To proceed, run:");
  console.log(`  cd ${distPath} && npm publish --tag ${tag}\n`);
} catch (error) {
  console.error("\n❌ Publish failed:", error.message);
  process.exit(1);
}
