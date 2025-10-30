/**
 * Prepare package.json for publishing by removing development-only conditional export and other
 * properties. Commit all changes to `package.json` before running the publish command since the
 * post publish step restores the original file.
 */

import fs from "fs";
import path from "path";

// Define a minimal type for package.json structure
interface PackageJson {
  exports?: {
    "."?: {
      development?: string;
      [key: string]: unknown; // Allow other properties
    };
    [key: string]: unknown; // Allow other export paths
  };
  [key: string]: unknown; // Allow other top-level properties
}

const pkgPath = path.join(process.cwd(), "package.json");
const pkg: PackageJson = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

// Remove the development conditional export if it exists
if (pkg.exports?.["."]?.development) {
  console.log('Removing "development" conditional export...');
  delete pkg.exports["."]["development"];
}

// Remove devDependencies if it exists
if (pkg.devDependencies) {
  console.log('Removing "devDependencies"...');
  delete pkg.devDependencies;
}

// Remove volta if it exists
if (pkg.volta) {
  console.log('Removing "volta"...');
  delete pkg.volta;
}

// Write the modified content back to package.json
fs.writeFileSync(pkgPath, JSON.stringify(pkg, undefined, 2) + "\n");
console.log("package.json prepared for publishing.");
