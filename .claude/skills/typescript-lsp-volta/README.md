# typescript-lsp-volta

A committed, cross-platform replacement for the official `typescript-lsp` Claude
Code plugin. It loads automatically for everyone who starts Claude Code from the
repo root (a "skills-directory plugin": `<repo>/.claude/skills/<name>/.claude-plugin/plugin.json`),
so there is no install step.

## Why this exists

The official `typescript-lsp` plugin spawns `typescript-language-server` from
`PATH` **without a shell** (libuv `uv_spawn`). On Windows, Volta (and npm)
provide only a `.cmd` + shell-script shim for that binary — no native `.exe` — and
a shell-free spawn cannot launch a `.cmd`, so it fails with
`ENOENT: uv_spawn 'typescript-language-server'`. macOS/Linux are unaffected
because Volta shims are real executables there.

## How it avoids the bug

`.lsp.json` runs the language server as:

```
node ${CLAUDE_PROJECT_DIR}/node_modules/typescript-language-server/lib/cli.mjs --stdio
```

- `node` is a real executable under Volta on every OS, so it spawns shell-free.
- `typescript-language-server` is a repo **devDependency**, so `cli.mjs` is a
  stable, version-pinned, repo-relative path — no global install, no `PATH`
  lookup, no `.cmd` shim, no `cmd.exe`, no wrapper script.

The official plugin is disabled in `.claude/settings.json`
(`"typescript-lsp@claude-plugins-official": false`) so the two don't both
register a server for `.ts`/`.tsx`.

## Requirements

- All devs use Volta (so `node` resolves shell-free on every OS).
- `pnpm install` provides `typescript-language-server` and `typescript`.
- Start Claude Code from the repo root — project-scope skills-dir plugins do not
  walk up from a subdirectory. After changing directories, run `/reload-plugins`.
