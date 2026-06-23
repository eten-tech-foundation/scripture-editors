#!/bin/bash
# volta-fix-snapshot.sh — Claude Code PreToolUse hook for Bash.
#
# Claude Code captures a "shell snapshot" at session start that hard-codes
# PATH (including VS Code's resolved Volta image paths). This snapshot is
# sourced before every Bash command, overriding BASH_ENV and profile fixes.
#
# This hook patches the snapshot so the image paths use the project-pinned
# Volta versions from package.json instead of VS Code's defaults.
#
# Safe no-op when: no snapshot exists, no volta config in package.json,
# or the snapshot is already patched.

set -euo pipefail

VOLTA_HOME="${VOLTA_HOME:-$HOME/.volta}"

# Find the active snapshot
SNAP_DIR="$HOME/.claude/shell-snapshots"
[[ -d "$SNAP_DIR" ]] || exit 0
SNAP=$(ls -t "$SNAP_DIR"/snapshot-*.sh 2>/dev/null | head -1)
[[ -n "$SNAP" && -f "$SNAP" ]] || exit 0

# Only patch if there's a Volta image path in the snapshot
grep -q "$VOLTA_HOME/tools/image/" "$SNAP" 2>/dev/null || exit 0

# Find nearest package.json with volta config
_dir="$PWD"
_pkg=""
while [[ "$_dir" != "/" ]]; do
  if [[ -f "$_dir/package.json" ]] && grep -q '"volta"' "$_dir/package.json" 2>/dev/null; then
    _pkg="$_dir/package.json"
    break
  fi
  _dir=$(dirname "$_dir")
done
[[ -n "$_pkg" ]] || exit 0

# Patch each tool's image path
for _tool in node pnpm; do
  _pin=$(grep -oP "\"$_tool\"\\s*:\\s*\"\\K[^\"]+" "$_pkg" 2>/dev/null | head -1)
  [[ -n "$_pin" ]] || continue
  _img_dir="$VOLTA_HOME/tools/image/$_tool/$_pin/bin"
  [[ -d "$_img_dir" ]] || continue

  if grep -q "$VOLTA_HOME/tools/image/$_tool/" "$SNAP" 2>/dev/null; then
    # Replace existing image path with correct version
    sed -i "s|$VOLTA_HOME/tools/image/$_tool/[^:/']*/bin|$_img_dir|g" "$SNAP"
  else
    # Tool not in snapshot — inject its image path after the Volta shim dir
    sed -i "s|$VOLTA_HOME/bin|$VOLTA_HOME/bin:$_img_dir|" "$SNAP"
  fi
done
