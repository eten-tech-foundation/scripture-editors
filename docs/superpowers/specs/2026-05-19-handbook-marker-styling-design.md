# Handbook Marker Styling — Design

**Status:** Approved, ready for implementation plan
**Owner:** Ira
**Date:** 2026-05-19
**Appetite:** 2 weeks, one dev (Plan B from brainstorming)
**Source PRD:** [`docs/prd_simple_saroj-uses-handbooks-for-exegesis.md`](../../prd_simple_saroj-uses-handbooks-for-exegesis.md)

## 1. Context

PT10's scripture editor doesn't render the UBS Handbook (HBKENG) or SIL Translator's Notes (TNN, TND) the way translators expect, because each resource ships a `custom.sty` that defines project-specific markers and styling. The editor has no mechanism to apply per-resource custom stylesheets, and many of the markers used in these resources aren't enumerated in the Lexical nodes' `isValidMarker` lists. Separately, [PT-3537](https://paratextstudio.atlassian.net/browse/PT-3537) reports that the application hangs when changing chapter inside HBKENG.

The PRD declares parity with PT9 a goal but not an expectation inside this 2-week budget. The objective is to ship enough that translators can read all three resources, with at least the visual styling parity their PT9 stylesheets define.

### Key insight that shapes this design

The USJ ingested by the platform adaptor already carries `type: "char"` / `type: "para"` per marker, so `recurseNodes` in `packages/platform/src/editor/adaptors/usj-editor.adaptor.ts` routes every marker to the correct Lexical node regardless of whether it's enumerated as a valid marker. The only side effect of an unenumerated marker is a `_logger?.warn(...)` per occurrence. **The markers already render; only the warnings and the styling are missing.** This means we can ship visual styling without touching node validation in v1.

## 2. Approach

A pragmatic-first / less-hacky-later split:

**v1 (this 2 weeks)** — pipe each resource's PT9-derived CSS through to the editor as committed SCSS, loaded dynamically per resource. Warnings stay; nodes aren't touched.

**Stretch / future** — runtime or build-time generation of the CSS by calling Paratext's `CSSCreator.CreateDefaultCSS` directly from paranext-core; marker registration API on Lexical nodes to silence warnings.

### Pipeline

```
Paratext 9 (running HBKENG / TNN / TND)
         │  one-time per resource
         ▼
  paranext-core/tools/pt9-css-extractor/ (C# CLI)
         │
         ▼
  paranext-core/data/pt9-css/{hbkeng,tnn,tnd}.css        ← committed, flat
         │
         ▼
  scripture-editors/scripts/pt9-css-to-editor-scss.ts (TS, run via Nx)
         │
         ▼
  paranext-core/extensions/src/platform-scripture-editor/src/marker-styles/
    {hbkeng,tnn,tnd}.scss                                ← committed

  At runtime (platform-scripture-editor.web-view.tsx):
    useEffect → detect resource ID → dynamic `import(./marker-styles/<id>.scss)`
    Webpack code-splits each SCSS into its own chunk.
```

The pipeline spans both repos: the C# CLI and the raw/generated CSS artifacts live in `paranext-core` (where the DLL toolchain is already set up); the TS converter stays in `scripture-editors` and reads/writes via the sibling-repo relative path.

In parallel, a separate workstream investigates and fixes the chapter-change hang (PT-3537).

## 3. Components

### 3.1 C# CLI — `paranext-core/tools/pt9-css-extractor/`

Small .NET console app. Loads a Paratext project's `ScrStylesheet` (which already applies `custom.sty` on top of `usfm.sty`) and calls `CSSCreator.CreateDefaultCSS(scrText, zoom: 100, fontFamilies: …, includeFontFaces: false)`. Writes the resulting CSS to disk.

- **Lives in paranext-core** because that repo already has the ParatextData DLL toolchain set up — building a sibling .NET tool there avoids duplicating the dependency wiring in scripture-editors.
- **DLL references:** `ParatextData.dll`, `ParatextInternalShared.dll`, `PtxUtils.dll`. All .NET Standard, no UI deps.
- **Invocation:** `dotnet run -- --project HBKENG --out paranext-core/data/pt9-css/hbkeng.css`
- **Output:** flat CSS file, selectors of the form `.usfm_<marker> { … }` (PT9 already follows this naming convention, so no selector renaming is needed downstream — only the view-mode split in §3.3).
- **Run once per resource.** Output committed to `paranext-core/data/pt9-css/`; CLI doesn't run in CI.
- The `.csproj` is checked in but the built binary isn't.

### 3.2 Validation pass

For HBKENG only, also perform a **manual extraction** of the rendered CSS from PT9 (option a — capture via PT9's debug inspector or whichever export mechanism exists). Save as `paranext-core/data/pt9-css/hbkeng-manual.css`. Diff against the CLI output. If they match modulo whitespace and ordering, the CLI is trusted and TNN/TND skip the manual step.

If the diff is non-trivial, that's a Day 5 gate: fix the CLI before proceeding to TNN/TND.

### 3.3 TS converter — `scripts/pt9-css-to-editor-scss.ts`

Node script run via Nx. Parses the flat PT9 CSS and emits SCSS that fits the editor's view-mode-scoped convention (see `paranext-core/extensions/src/platform-scripture-editor/src/_usj-nodes.scss` for the existing pattern).

#### View-mode split — the key transformation

The editor's existing CSS isn't flat — properties for each marker are bucketed into view-mode-scoped selectors:

- `.formatted-font .usfm_<marker>` — typography
- `.text-spacing  .usfm_<marker>` — layout (direction-independent)
- `.text-spacing[dir='ltr'] .usfm_<marker>` and `[dir='rtl']` — directional layout (`margin-left`/`margin-right` get mirrored)

The script's job is to take each flat `.usfm_<marker> { …decls… }` rule from PT9 and re-emit it as up to four scoped rules.

#### Property classifier

| Bucket                                     | Properties                                                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `.formatted-font`                          | `font-weight`, `font-style`, `font-size`, `font-family`, `color`, `text-decoration`, `font-variant`, `vertical-align`     |
| `.text-spacing` (non-directional)          | `margin-top`, `margin-bottom`, `padding-top`, `padding-bottom`, `text-indent`, `text-align`, `line-height`, `white-space` |
| `.text-spacing[dir='ltr']` / `[dir='rtl']` | `margin-left`, `margin-right`, `padding-left`, `padding-right` (LTR: keep as-is; RTL: mirror left↔right)                  |

Unknown properties: emit into `.formatted-font` and log a one-line warning in the generated file's header comment so a reviewer can spot misclassifications.

#### Other transformations

- **Skip table markers.** Regex `^(tr|tc\d+|th\d+|tcr\d+|tcc\d+|thr\d+|thc\d+)$` — table structure isn't implemented; the bare cells would render misleadingly.
- **Emit even when base `_usj-nodes.scss` already covers the marker.** Cascade resolves; we'd rather have explicit per-resource styling than mysterious base-style fallthrough. Log duplicates in the header for review.
- **Strip `@font-face` rules** from PT9 output if present — the editor handles fonts via its own `_usj-nodes.scss` setup.
- **Header comment** in output SCSS: source CSS file path, generation timestamp, marker count, any classifier warnings.

#### Library choice

`postcss` (already in the workspace's dep graph via downstream tooling) for CSS AST traversal. Lighter alternative: `css-tree`. Decide during implementation.

### 3.4 Dynamic SCSS loading — `platform-scripture-editor.web-view.tsx` (in paranext-core)

```ts
const HANDBOOK_RESOURCES = new Set(["HBKENG", "TNN", "TND"]);

useEffect(() => {
  if (!HANDBOOK_RESOURCES.has(resourceId)) return;
  let active = true;
  import(
    /* webpackChunkName: "marker-styles-[request]" */
    `./marker-styles/${resourceId.toLowerCase()}.scss`
  ).catch((err) => {
    if (active) logger?.warn(`No marker styles for ${resourceId}`, err);
  });
  return () => {
    active = false;
  };
}, [resourceId]);
```

- **Bundler:** paranext-core uses **webpack** (not Vite). The dynamic import is webpack-native; existing SCSS pipeline (sass-loader → css-loader → style-loader) handles compilation. The magic-comment chunk name keeps emitted chunk filenames readable.
- **Allowlist** is hardcoded for v1 — three resources. Extending to more resources later is one-line.
- **Resource ID derivation:** from the project metadata exposed to the webview. Implementation detail to verify on Day 7.
- **No de-registration.** A stylesheet stays loaded for the webview's lifetime. If a user opens HBKENG, then re-uses the same webview for TNN, both stylesheets coexist; selectors are marker-scoped so this shouldn't visually conflict, but if it does we'll fall back to a `<link>` element we manage manually. Flag this on Day 7.

### 3.5 Hang fix — separate workstream

Independent of the styling pipeline. Day 1 spike, Days 2-4 fix, hard stop EOD4.

**Repro:** open HBKENG → change chapter → hang. Restart resets it. First chapter loads fine even after restart.

**Working hypothesis:** state accumulation between chapter renders. Smells already identified:

- `packages/platform/src/editor/adaptors/usj-editor.adaptor.ts` has module-scope mutable state (`commentIds`, `_viewOptions`, `_nodeOptions`, `addMissingComments`, `_logger`, `callerData.count`). Only `commentIds` is reset in `initialize()`.
- Lexical plugins / listeners may not be torn down cleanly between chapter renders.

**Tooling:** Chrome DevTools (or PT10's Electron equivalent) Performance + Memory profilers; React DevTools profiler.

**Likely fix shape:** move adaptor state from module-level to per-render context; ensure `initialize()` resets all mutable state; audit plugin teardown.

**Hard stop:** EOD Day 4. If unresolved, ship marker work, document findings in JIRA, leave WIP on a branch.

### 3.6 Marker registration — explicitly deferred

Not in v1. The `_logger?.warn(...)` calls in `createChar`, `createPara`, `createNote`, and `createMilestone` will fire for unenumerated markers. They're noisy but harmless.

If picked up as Day 10 stretch: add static `registerMarkers(string[])` methods to `CharNode` and `ParaNode` that extend their `isValidMarker` checks; plumb a per-resource marker list through the adaptor's `initialize()`.

## 4. Schedule (Plan B)

| Day | Goal                                           | Deliverable                                                                                                      | Gate                                                |
| --- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 1   | Hang investigation spike                       | JIRA comment with hypothesis + code pointers + profiler trace                                                    | Must have working hypothesis EOD. If not, escalate. |
| 2   | First hang fix attempt                         | Commit + manual repro showing no hang                                                                            | Fix may not hold; backup hypothesis ready.          |
| 3   | Verify fix or pivot                            | Repro evidence across HBKENG/TNN/TND chapter cycles                                                              | If still hanging EOD, prepare cut-losses Day 4.     |
| 4   | Polish + regression test, or hard stop         | Merged PR + test, or WIP branch + writeup                                                                        | **Hard stop EOD.** Marker work starts Day 5.        |
| 5   | C# CLI + HBKENG extraction + manual validation | `paranext-core/tools/pt9-css-extractor/` + `paranext-core/data/pt9-css/hbkeng.css` + diff vs `hbkeng-manual.css` | If diff is large, fix CLI before TNN/TND.           |
| 6   | TS converter                                   | `scripts/pt9-css-to-editor-scss.ts` + `marker-styles/hbkeng.scss`                                                | Classifier unit-tested on hand-picked rules.        |
| 7   | HBKENG end-to-end                              | Dynamic SCSS import wired in webview; HBKENG smoke-tested across FRT/INT/MAT/XXA                                 | If visual is way off PT9, iterate classifier.       |
| 8   | TNN end-to-end                                 | `tnn.css` + `tnn.scss` + smoke test                                                                              | Mostly mechanical.                                  |
| 9   | TND end-to-end                                 | `tnd.css` + `tnd.scss` + smoke test                                                                              | Mostly mechanical.                                  |
| 10  | Buffer + stretch                               | Cross-resource regression + stretch picks                                                                        | —                                                   |

### Stretch backlog (Day 10, priority order)

1. **Marker registration API** (~½ day). Silences warnings.
2. **CSSCreator integration spike** (~½–1 day investigation). Foundation for replacing committed CSS with build-time generation.
3. **Converter snapshot tests** (~½ day). Golden-file pattern so future re-runs diff cleanly.

## 5. Out of scope (explicit no-gos)

- Table rendering (`tr`, `tc*`, `th*`, `tcr*`, `tcc*`, `thr*`, `thc*`)
- Figures / images
- BCV navigation to FRT/BAK/INT/XXA — PRD rabbit hole #1 defers versification
- Quick reference popovers for `jmp` links — PRD rabbit hole #6
- Custom-stylesheet auto-loading from project metadata (handbook allowlist is hardcoded)
- Marker registration in v1

## 6. Risks

| Risk                                                                                           | Likelihood | Impact                                                       | Mitigation                                                                                   |
| ---------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Hang fix exceeds 4-day budget                                                                  | Medium     | Marker work proceeds without it; handbook still crash-prone. | Hard stop; document findings; deliver marker work regardless.                                |
| C# build env setup eats Day 5 morning                                                          | Low–Medium | ½ day delay                                                  | Dev installs .NET 8 SDK Day 4 evening if not already present.                                |
| PT9 CSS output has surprises (font-face, table rules, scoped selectors, unfamiliar properties) | Medium     | Converter needs iteration                                    | Classifier emits unknowns into `.formatted-font` + logs warnings; review on Day 6.           |
| Webpack dynamic-import chunk naming or sass-loader edge case                                   | Low        | 1–2 hour debug                                               | Editor already imports SCSS this way; precedent should hold.                                 |
| HBKENG output looks visually different from PT9 despite matching CSS                           | Low        | Investigation cost                                           | The base `_usj-nodes.scss` may shadow some rules; cascade order is the first place to check. |

## 7. Deliverables summary

1. **Hang fix PR** (if root cause tractable in 3 days; otherwise WIP + JIRA writeup)
2. **C# CLI** in `paranext-core/tools/pt9-css-extractor/` — committed source (`.csproj`), gitignored binary
3. **Raw CSS files** in `paranext-core/data/pt9-css/` — `hbkeng.css`, `tnn.css`, `tnd.css`, plus `hbkeng-manual.css` for validation
4. **TS converter** in `scripts/pt9-css-to-editor-scss.ts`
5. **Generated SCSS** in `paranext-core/extensions/src/platform-scripture-editor/src/marker-styles/` — `hbkeng.scss`, `tnn.scss`, `tnd.scss`
6. **Dynamic loader** in `platform-scripture-editor.web-view.tsx`
7. _(Stretch)_ Marker registration API on `CharNode` and `ParaNode`
