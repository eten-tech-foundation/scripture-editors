# CHECKPOINT — scripture-editors → paranext-core propagation is unreliable (BLOCKING)

**Date:** 2026-07-03
**Repos:** `scripture-editors` (branch `standard-view`), `paranext-core` worktree `/home/lyonsm/paranext-core-standard-view` (branch `standard-view` off main)
**Status:** Phase 3 (footnote UX) code is COMPLETE, reviewed, unit-verified. The ONE remaining problem is a build/propagation blocker: a verified library fix does **not** reach the running Platform.Bible app. The user has declared this a **must-solve** blocker for all later phases, not a one-off.

---

## 0. DO THIS FIRST (housekeeping)

- **The progress ledger is STASHED.** `git stash list` → `stash@{0}: WIP on standard-view: cc82802 ...`. That stash holds `.superpowers/sdd/progress.md` (the Phase 3 execution ledger — gitignored, tracked-in-place). The user asked that it be `git stash pop`'d back **when they are done** with their own testing. Confirm they're done before popping. `stash@{1}`/`stash@{2}` are older, unrelated — leave them.
- **`paranext-core-standard-view/dev-packages.json`** has an **uncommitted local edit**: revision changed from `platform-yalc` → `standard-view`. This MUST stay. paranext's `link-dev-packages.ts` postinstall does `checkoutRevision(scripture-editors, <that revision>)`, so this points the link at our branch.
- **Never** edit `/home/lyonsm/Paratext` (PT9 C# read-only reference) or the non-worktree `/home/lyonsm/paranext-core`. All paranext work happens in the worktree only; never commit to paranext `main`.

---

## 1. The blocking problem, precisely

Getting a code change made in `scripture-editors` (specifically in `libs/shared-react`) into the **running** paranext-core Electron app is currently unreliable. A concrete, correct fix (commit `cc82802`) is confirmed present in the library source, the library `dist`, and (apparently) paranext's `node_modules` — yet the running app still executes the **old** behavior. We could not prove which hop is stale.

This must be turned into a **repeatable, verifiable propagation procedure** so later phases don't hit the same wall.

---

## 2. The fix that must propagate (so you have a concrete probe)

**Commit `cc82802`** "fix: keep \fr/\ft char-span markers on note insert in standard view".

**Bug:** Inserting a footnote in standard (marker-editable) view produced an empty `\f \f*` note. Root cause: `$createNoteChildren` built `CharNode`s (`\fr`, `\ft`) with **no opener glyph**, so `$charNodeDeletionTransform`/`$unwrapCharNode` unwrapped them back to plain text in the same commit, emptying the note.

**Fix:** `libs/shared-react/src/nodes/usj/node-react.utils.ts`
- New helper `$createNoteContentChar(marker, content, viewOptions)` at **line 208** — appends a `$createMarkerNode(marker)` opener when `viewOptions.markerMode === "editable"`, so the char isn't unwrapped. Empty content → `EMPTY_CHAR_PLACEHOLDER_TEXT` (lone NBSP), matching `createChar`.
- `$createNoteChildren` (line 221) now takes `viewOptions` and builds `\fr`/`\fq`/`\ft` (and `\xo`/`\xq`/`\xt`) via that helper.
- `$insertNote` passes `viewOptions` through (6-arg `$createNoteChildren(...)`).

**Unit test that PROVES the fix (passes):** `packages/platform/src/editor/markerEdit/noteInsertion.test.tsx` — mounts `MarkerEditPlugin` in standard view, inserts a footnote, asserts the note contains `\fr`/`\ft` char children. Reproduces the exact bug; green with the fix.

So: **the fix is correct and unit-verified. The code is not in question.** Only propagation to the running app is.

---

## 3. The propagation chain (every hop the change must survive)

```
libs/shared-react/src/.../node-react.utils.ts      (FIX lives here — count 7 refs to $createNoteContentChar)
  └─(vite lib build; nxViteTsPaths resolves shared-react to SOURCE via tsconfig paths, DEV cond)
packages/platform/dist/index.js                     (MINIFIED bundle = platform src + shared-react src)
  └─(pnpm -C packages/platform devpub → prepare-publish removes `development` export cond, extract-api, yalc push)
.yalc store + node_modules/@eten-tech-foundation/platform-editor/dist/index.js   (in paranext worktree)
  └─(paranext extension webpack: build:extensions, bundles platform-editor DIST)
paranext-core-standard-view/extensions/dist/platform-scripture-editor/src/main.js  (~16 MB single bundle; editor + web-view live HERE, not a separate webView file)
  └─(Electron loads extension at app start)
RUNNING APP  (footnote insert should yield \fr/\ft)
```

Key facts about the chain:
- platform is consumed by paranext as **`@eten-tech-foundation/platform-editor`** via yalc. Consumers use platform's **dist** (the `development`→src condition is stripped at publish).
- The extension's `build:extensions` emits **`main`** and **`webView`** in logs, but the only `.js` in `extensions/dist/platform-scripture-editor/` is **`src/main.js`** (~16 MB). The editor is bundled into it.
- Electron loads the extension at startup; `refresh.sh` does `npm run build` then `npm start`, so a fresh start loads the freshly-built extension.

---

## 4. What is CONFIRMED vs UNKNOWN (the paradox to resolve)

**Confirmed:**
- shared-react **src** has the fix (`grep -c createNoteContentChar` = 7).
- shared-react **dist** has the fix.
- The platform vite build **reads current shared-react source** — PROVEN by injecting a unique string literal (`PROPTEST9Z8Y7X`) into the source; it appeared in the platform bundle after rebuild. (The marker was in the SAME file as the fix, `node-react.utils.ts`, so if the marker propagated, the fix did too — to the platform dist.)
- After a **from-scratch** paranext extension build (wiped `extensions/dist` + ALL `node_modules/.cache/webpack-*`, fresh `main.js` re-emitted), with a confirmed caret in standard-editable view, footnote insert **STILL produced empty `\f \f*`** (`.note[data-caller="+"]` had zero `.char` children).

**Unknown / unresolved:**
- Whether the running app's bundled editor actually contains the fix. Name-greps on the bundle are **useless** (minified — `createNoteContentChar`, `createMarkerNode` mangle to 0 hits). Byte-size arithmetic (pre-fix platform dist `390871` → post-fix `390877`, +6 bytes; marker build `390908`) was **too shaky to trust** and led in circles.

**The paradox:** the fix appears present through platform dist → node_modules, yet the app runtime shows the old (empty) behavior even after a no-cache from-scratch extension rebuild. Exactly one hop is lying. We never isolated which.

---

## 5. Everything already tried (do NOT repeat blindly)

- `nx reset`; all Nx gates run with `--skip-nx-cache`.
- Wiped platform + shared-react `dist`, `tsbuildinfo`, `node_modules/.vite` cache.
- Cleared `node_modules/.cache/webpack-extensions` (it gets recreated by the build; recreated-then-still-stale = NOT purely a webpack fs cache).
- Wiped `extensions/dist` entirely + moved aside `webpack-extensions` AND `webpack-renderer` caches → from-scratch build. Still empty.
- `touch`ed the extension source (`platform-scripture-editor.web-view.tsx`) to trigger webpack `--watch` re-emit — **did not re-emit** (`main.js` mtime frozen at an old time despite "compiled successfully").
- Multiple full `./.erb/scripts/refresh.sh` cycles (refresh3/4/5) + multiple `devpub`s.
- Confirmed the runtime test harness itself is sound: caret placement returns `CARET-OK active=true`, editor frame is `wgPIDGIN (Editable)`, class `editor-input usfm marker-editable ...`. The empty result is real, not a test artifact.

Observed anomaly worth chasing: after a successful `build:extensions`, `main.js` mtime **did not change** in one cycle (webpack wrote byte-identical output → it bundled the *same* editor module → suggests webpack resolved a stale platform-editor, OR yalc didn't update node_modules). The from-scratch build DID re-emit a fresh `main.js` (17:22:19) and STILL produced empty — which points the finger either at (a) node_modules/platform-editor being stale despite the size check, or (b) the fix not holding in the full-app runtime.

---

## 6. THE DEFINITIVE NEXT EXPERIMENT — marker bisection of the chain

Invoke **superpowers:systematic-debugging**. Stop guessing at byte sizes. Plant ONE unique, grep-able, minification-surviving marker in the fix code path and follow it hop by hop. The FIRST hop where the marker is absent is the broken link.

**Use a string literal** (survives minification as a string), not an identifier (mangled). E.g. add to `$createNoteContentChar` in `libs/shared-react/src/nodes/usj/node-react.utils.ts`:

```ts
function $createNoteContentChar(marker: string, content: string, viewOptions: ViewOptions): CharNode {
  if (typeof window !== "undefined") console.log("PROP_MARKER_Q7X2K", marker); // TEMP bisection probe
  const char = $createCharNode(marker);
  ...
```

Then check the marker at each hop, in order:

1. **shared-react src → platform dist:**
   `nx build platform --skip-nx-cache` then `grep -c PROP_MARKER_Q7X2K packages/platform/dist/index.js`. Expect ≥1. (If 0 → the platform build is not bundling current shared-react src — investigate nxViteTsPaths / tsconfig path resolution / vite cache.)

2. **platform dist → paranext node_modules (yalc):**
   `pnpm -C packages/platform devpub`, then in the worktree
   `grep -c PROP_MARKER_Q7X2K /home/lyonsm/paranext-core-standard-view/node_modules/@eten-tech-foundation/platform-editor/dist/index.js`.
   Expect ≥1. **This is the most-suspected hop.** If 0 → yalc push/link is stale: node_modules holds an old copy. Fixes to try: re-run `devpub`; check `.yalc` store contents/version; `yalc push --force`; verify node_modules/@eten-tech-foundation/platform-editor is the yalc link (not a stale npm copy); consider that yalc keeps the SAME version `0.8.15` across pushes which defeats content-addressed caches downstream.

3. **node_modules → extension bundle (webpack):**
   From-scratch extension build (wipe `extensions/dist` + `node_modules/.cache/webpack-*`), then
   `grep -c PROP_MARKER_Q7X2K /home/lyonsm/paranext-core-standard-view/extensions/dist/platform-scripture-editor/src/main.js`.
   Expect ≥1. If 0 while hop 2 = ≥1 → webpack is resolving/caching a stale platform-editor. Because yalc keeps version `0.8.15`, webpack's persistent fs cache may key the module by version and serve stale. Fixes: locate the extension webpack `cache` config (grep `.erb/configs` — no explicit `cacheDirectory` was found, so it may default; try `cache:false` or a from-scratch with cache disabled), or **bump the platform-editor version** so every downstream cache sees a new module (most reliable yalc/webpack cache-buster).

4. **extension bundle → running app (Electron):**
   Launch via `refresh.sh`, open the editor, insert a footnote, watch the app **console** for `PROP_MARKER_Q7X2K`. If it fires → the app IS running the fixed code, so the *empty note is a genuine runtime gap in the full app* (see §7 hypothesis B). If it does NOT fire while hop 3 = ≥1 → Electron loaded a stale extension (stale load path / it didn't restart on the new bundle).

**Whichever hop first shows 0 (or no console fire) is the culprit. Fix that hop's tooling, then remove the probe.** Once the procedure is known-good, document it as the canonical "propagate a library change to the app" runbook — that is the deliverable the user actually wants.

---

## 7. Two hypotheses the bisection distinguishes

- **Hypothesis A (propagation) — most likely:** a stale hop (yalc node_modules copy at hop 2, or webpack resolving stale at hop 3). yalc's fixed `0.8.15` version across pushes is the prime suspect for defeating a downstream cache. Resolution: version bump or the specific stale cache/copy.
- **Hypothesis B (runtime gap):** the fix holds in the unit test (which mounts only `MarkerEditPlugin`) but a DIFFERENT mechanism empties the note in the full app (another plugin, the onUsjChange save round-trip, or the collab **delta-ops** path — note content in collab delta ops was flagged lossy in Phase 0). NOTE: an earlier `registerUpdateListener` probe showed the note empty on the **first** (synchronous) update, which points at the synchronous transform (Hypothesis A territory) rather than an async save — but re-confirm this if hop 4's console fires.

---

## 8. Operational reference

**Ports:** renderer `1212`, PAPI/websocket `8876`, CDP `9223`.

**paranext skills** (read manually — they are NOT registered as slash skills; read the files):
- `/home/lyonsm/paranext-core-standard-view/.claude/skills/app-runner/` — `./.erb/scripts/refresh.sh` runs headless (xvfb) + CDP on 9223. `npm stop` kills the app/webpack (exit 144 is normal, shell gets reset).
- `/home/lyonsm/paranext-core-standard-view/.claude/skills/visual-verification/` — `node .claude/skills/visual-verification/scripts/pw-server.mjs` reads newline-delimited JSON commands over CDP: `{"cmd":"frames"}`, `{"cmd":"frame-by-title","title":"..."}`, `{"cmd":"eval","code":"..."}`, `{"cmd":"press","key":"Control+t"}`, `{"cmd":"wait-ms","ms":N}`, `{"cmd":"screenshot","output":"..."}`, `{"cmd":"quit"}`. Pipe via `printf '%s\n' '<json>' ... | node .../pw-server.mjs`.

**Runtime footnote-insert test recipe** (proven harness):
1. `frame-by-title` → `"wgPIDGIN (Editable)"` (standard-editable view).
2. Place caret: TreeWalker over `.editor-input` text nodes, pick a text node not inside `.note`, `range.setStart(node, N); collapse; selection.addRange; root.focus()`. Confirm `active=true`.
3. `press` `Control+t` (or `Control+Shift+t`); `wait-ms` ~1800.
4. Read result: last `.note[data-caller="+"]` → `Array.from(note.querySelectorAll(".char")).map(c=>c.getAttribute("data-marker"))`. **Empty `[]` with textContent `"\\f \\f*"` = bug present. `["fr","ft"]` = fixed.**

**paranext link flow:** `link-dev-packages.ts` (postinstall) → `checkoutRevision(scripture-editors, dev-packages.json.revision="standard-view")` → `pnpm install` → `nx devpub` → `editor:link`. `@lexical/clipboard` sometimes needs a `pnpm install` to relink after branch churn (no lockfile change).

**scratchpad** (session-scoped, may not survive a new session): `/tmp/claude-1000/-home-lyonsm-scripture-editors/cc870772-a537-4ac1-88d6-d0d63e29f16c/scratchpad/` holds `refresh{3,4,5}.log`, probe `*.jsonl`, screenshots `pb-0{6,7}-*.png`, and the moved-aside webpack caches `wpc-ext-final`/`wpc-rend-final`.

---

## 9. Git state

- `scripture-editors` branch **`standard-view`**, HEAD **`cc82802`** (the fix). Pushed to **`fork`** (`git@github.com:lyonsil/scripture-editors.git`) with upstream tracking `fork/standard-view` (`origin` = BiblioNexus-Foundation, no write access for the session identity `lyonsil`). Do NOT push elsewhere or open PRs without explicit approval; the fork push was the only approved one.
- Working tree change at session start: `M .superpowers/sdd/progress.md` — that's the ledger, now STASHED (see §0).
- Phase 3 plan (committed, `git add -f`, gitignored dir): `docs/superpowers/plans/2026-07-02-standard-view-phase-3.md`.

---

## 10. Deferred non-blocking fast-follows (after propagation is solved)

OT-collab `closed` threading; `\fq`/`\xq` quotation-branch test; footnote popover whitespace/copy rules; Mac `Cmd+T`; re-`devpub` the library after ANY further fix (and re-verify via §6). None block; the propagation runbook is the priority.
