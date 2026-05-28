#!/usr/bin/env node
// Cross-platform npx launcher for MCP servers.
// On Windows, npx is a .cmd file that cannot be invoked directly via CreateProcess.
// Using shell:true makes Node spawn via cmd.exe on Windows and /bin/sh on Unix,
// which resolves .cmd scripts correctly on both platforms.
const { spawn } = require("child_process");

const args = process.argv.slice(2);
const child = spawn("npx", args, { stdio: "inherit", shell: true });

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});

process.on("SIGTERM", () => child.kill("SIGTERM"));
process.on("SIGINT", () => child.kill("SIGINT"));
