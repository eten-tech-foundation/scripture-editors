# RESOLVED — scripture-editors → paranext-core propagation WORKS (was a verification artifact)

**Date:** 2026-07-03
**Repos:** `scripture-editors` (branch `standard-view`), `paranext-core` worktree `/home/lyonsm/paranext-core-standard-view` (branch `standard-view`).

## TL;DR

The "must-solve blocker" — a verified library fix (commit `cc82802`, empty-footnote) supposedly not reaching the running Platform.Bible app — **was not real**. Propagation works reliably. The apparent "empty note" in the running app was a **flawed runtime measurement**, and a secondary **webpack `--watch` gotcha** made rebuilds look like no-ops. Both are now understood and a reliable runbook is below. Footnote insertion in the app produces a correct `\f + \fr <ref> \ft \f*` note, confirmed by editor-state inspection AND a screenshot of the footnote popover showing `\fr 1:2 \ft`.

---

## What was actually wrong (two compounding red herrings)

1. **The runtime verification was measuring the wrong thing (the real cause of the false alarm).**
   The QA probe checked `noteElement.querySelectorAll(".char")` on **the last `+`-caller note in document order**, in the **main editor DOM**. Two bugs in that:
   - Standard-view notes render **`noteMode: "collapsed"`** — a collapsed note shows only its caller inline and hides its content (content lives in the popover/pane), so `.char` on the collapsed inline DOM is empty **even for a perfectly good note**.
   - "Last `+` note in document order" was **not** the note just inserted — it was a stale/empty `+` note left over from earlier inserts. So the probe read an unrelated empty note and concluded "fix not working / stale bundle."
   The correct check is on **editor state**: `root.__lexicalEditor.getEditorState().toJSON()`, walk to the note you just inserted (identify it by a before/after diff, not "last in DOM"), and look for `char` children with markers `fr`/`ft`. Done that way, the inserted note is `[marker/f, immutable-note-caller, text, char/fr[fr," 1:3 "], text, char/ft[ft," "], text, marker/f]` — correct.

2. **webpack `--watch` does not re-emit the extension bundle on a yalc same-version swap.**
   paranext consumes the editor via yalc, which keeps version `0.8.15` across every `devpub`. The running app's webpack `--watch` (and even `touch`ing the extension source) will NOT re-bundle when only the yalc file content changed — it produced byte-identical output / frozen mtime, which read as "the rebuild didn't take." A **fresh `npm run build:extensions` invocation (with the watch stopped) DOES re-read `node_modules` and re-bundle correctly.** (Confirmed: after `devpub`, a plain `build:extensions` picked up both adding and removing a probe.)

Neither was a code bug. `viewOptions` threads `markerMode:"editable"` into `$createNoteChildren` correctly at insert time (independently verified by source trace: `Editor.tsx:160` memo → `usj-marker-action.utils.ts:109` → `$insertNote` → `$createNoteChildren`; the `?? getDefaultViewOptions()` fallbacks are bypassed whenever `options.view` is the STANDARD/editable ViewOptions, which it must be for the view to render).

---

## THE RELIABLE RUNBOOK (propagate a scripture-editors change to the running app)

```
# 1. In scripture-editors (branch standard-view): make the change, then
pnpm nx build platform --skip-nx-cache          # bundles shared-react SOURCE into platform/dist (minified)
pnpm -C packages/platform devpub                 # prepare-publish (strips `development` cond) + yalc push
                                                 #   → updates node_modules/@eten-tech-foundation/platform-editor
                                                 #     in EVERY linked worktree, incl. paranext-core-standard-view

# 2. In the paranext worktree /home/lyonsm/paranext-core-standard-view:
npm stop                                         # stops the app AND its webpack --watch (exit 144 is normal)
npm run build:extensions                         # FRESH build — re-reads node_modules, re-bundles the editor
                                                 #   (a fresh invocation works even though --watch would not)
./.erb/scripts/refresh.sh                        # headless (xvfb) launch + CDP; Electron loads the fresh extension
```

Notes:
- **A fresh `build:extensions` is the key** — do NOT rely on the running `--watch` to pick up a yalc swap.
- Wiping `extensions/dist` + `node_modules/.cache/webpack-*` is a heavier "from-scratch" option; it was NOT necessary once the fresh-invocation insight was understood, but it is the fallback if a build ever looks stale.
- To VERIFY a change reached the app end to end, plant a unique **string literal** (survives minification) in the changed function, and grep the hops (`grep` on the huge minified files may be permission-blocked — use `node -e "fs.readFileSync(...).match(/MARKER/g)"`):
  1. `packages/platform/dist/index.js`
  2. `.../paranext-core-standard-view/node_modules/@eten-tech-foundation/platform-editor/dist/index.js` (after devpub)
  3. `.../extensions/dist/platform-scripture-editor/src/main.js` (after build:extensions) — NB the editor is embedded ~3× as sourcemap/eval strings; count>1 is normal
  4. hook `console.log` in the iframe and confirm it fires at runtime (see recipe below)

---

## Bisection evidence (all four hops confirmed this session)

Probe = a `console.log("PROP_MARKER_Q7X2K", marker, JSON.stringify(viewOptions))` planted in `$createNoteChildren`.
1. src → `platform/dist`: marker present. ✓
2. `platform/dist` → paranext `node_modules` (after `devpub`): marker present, size 390877→390958. ✓
3. `node_modules` → `extensions/dist/.../main.js` (after `build:extensions`): marker present (×3, embedded as strings). ✓
4. → running app: probe **fired in the app console**, logging `vo={"markerMode":"editable","noteMode":"collapsed",...}`. ✓ And the inserted note gained `char/fr`+`char/ft` and kept them (before/after `contentNotes` +1, `charTotal` +2).

Note: `node_modules` held size **390877** (the fix build) at session start — so the fix had ALREADY propagated in the prior session; the app was NOT stale. The prior "stale bundle" conclusion was the measurement artifact, not reality.

---

## Runtime test recipe (CORRECTED — state-based, not collapsed-DOM)

Ports: renderer `1212`, PAPI `8876`, CDP `9223`. Drive via `node .claude/skills/visual-verification/scripts/pw-server.mjs` (newline-delimited JSON: `frame-by-title`, `eval`, `press`, `wait-ms`, `screenshot`, `quit`).

1. `frame-by-title` → `"wgPIDGIN (Editable)"`.
2. In one `eval`: grab `window.__ed = document.querySelector(".editor-input").__lexicalEditor`; take a **before** snapshot = count of `+`-caller notes that have ≥1 `char` child (walk `__ed.getEditorState().toJSON().root`); then place the caret in verse text (TreeWalker to a text node not inside `.note`, `setStart(node,8)`, collapse, `addRange`, `root.focus()`).
3. `press` `Control+t`; `wait-ms` ~2500.
4. `eval`: **after** snapshot; assert `after.contentNotes - before.contentNotes === 1` and dump the newly-contentful note's children — expect `char/fr` (with a `<chap>:<verse>` reference) and `char/ft`.
   - Do NOT judge by `.char` in the collapsed main-editor DOM, and do NOT use "last `+` note in document order."

---

## Housekeeping (still open)

- **Ledger is STASHED:** `git stash list` → `stash@{0}: WIP on standard-view: cc82802 ...` holds `.superpowers/sdd/progress.md`. `git stash pop` it **only after the user says they're done** testing. `stash@{1}`/`stash@{2}` are older/unrelated.
- **`paranext-core-standard-view/dev-packages.json`** has an uncommitted `revision: standard-view` edit — must stay.
- **Never** edit `/home/lyonsm/paranext-core` (non-worktree) or `/home/lyonsm/Paratext` (PT9 C# reference).
- Side effect of `yalc push`: it also relinks OTHER worktrees (hyphenation-experiment, synchronized-scrolling, pt-2602-...) — dev-only, harmless.

## Git state

- `scripture-editors` branch **`standard-view`**, fix commit **`cc82802`**, checkpoint commit `d75a097` (this file). Pushed to **`fork`** (`git@github.com:lyonsil/scripture-editors.git`), upstream `fork/standard-view`. `origin` = BiblioNexus-Foundation (no session write access). No PRs / no other-branch pushes without explicit approval.
- Working tree clean after the probe was removed (source == `cc82802`).

## Phase 3 status & deferred fast-follows

Phase 3 (footnote UX) is complete, reviewed, unit-verified, and now **runtime-confirmed in the app**. Non-blocking follow-ups: OT-collab `closed` threading; `\fq`/`\xq` quotation-branch test; footnote popover whitespace/copy rules; Mac `Cmd+T`. Re-run the runbook + the corrected verify recipe after any further library change.
