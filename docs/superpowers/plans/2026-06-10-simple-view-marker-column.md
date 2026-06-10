# Simple View Marker Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In simple view, display each paragraph's USFM marker (`\p`, `\s1`, `\q1`, `\r`, etc.) in a fixed-width gutter to the left of the paragraph content (right in RTL), using a muted version of the verse-number accent color.

**Architecture:** Pure CSS addition to `packages/platform/src/editor/editor.css`, all scoped to `.psc-simple-view`. The `<p>` elements already carry a `data-marker` attribute and a `<span class="marker">` first child rendered by `MarkerNode`. We add a token, widen the editor's left padding to carve out the gutter, then absolutely-position each `.marker` span into that gutter. No JavaScript, no new nodes, no new React components.

**Tech Stack:** CSS (scoped to `.psc-simple-view`), existing Lexical/React platform editor.

---

## File Map

| File                                      | Change                                                                                                                                                          |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/platform/src/editor/editor.css` | Add `--scripture-accent-marker` token; add gutter padding; generalize `position: relative` to all `.para`; add `.para > .marker` gutter rules; add RTL variants |

---

### Task 1: Add `--scripture-accent-marker` token

**Files:**

- Modify: `packages/platform/src/editor/editor.css` (lines 3–7)

The `.psc-simple-view` token block at the top of the file currently has two tokens. Add the marker token so all three accent variants are defined together.

- [ ] **Step 1: Edit the token block**

Find this block (lines 3–7):

```css
/* Scripture accent tokens */
.psc-simple-view {
  --scripture-accent: #c4956a;
  --scripture-accent-chapter: rgba(196, 149, 106, 0.35);
}
```

Replace with:

```css
/* Scripture accent tokens */
.psc-simple-view {
  --scripture-accent: #c4956a;
  --scripture-accent-chapter: rgba(196, 149, 106, 0.35);
  --scripture-accent-marker: rgba(196, 149, 106, 0.45);
}
```

`0.45` opacity sits between the full accent (verse numbers) and the very muted chapter token, giving markers a visible but subordinate presence at the same hue.

- [ ] **Step 2: Verify no tests break**

```powershell
pnpm nx test "@eten-tech-foundation/platform-editor"
```

Expected: 73 passed, 3 skipped (0 failures).

- [ ] **Step 3: Commit**

```powershell
git add packages/platform/src/editor/editor.css
git commit -m "feat: add --scripture-accent-marker token to psc-simple-view"
```

---

### Task 2: Add gutter CSS and marker column rules

**Files:**

- Modify: `packages/platform/src/editor/editor.css` (append to the `10Simple visual styling` section)

This task adds four groups of rules, all at the **end** of `editor.css` (after the `.usfm_s*` block that currently ends the file at line 626).

- [ ] **Step 1: Append the gutter and marker rules**

Open `packages/platform/src/editor/editor.css`. The file currently ends at line 626 with:

```css
  border-top: none;
  margin-top: 1rem;
}
```

Append the following after that closing brace:

```css
/* ── Marker column ───────────────────────────────────────────────────────────
   Paragraph-level markers appear in a fixed-width gutter to the left of the
   content area. The .editor-input left padding creates the gutter space;
   each .para > .marker span is pulled into it with absolute positioning.
   All rules scoped to .psc-simple-view so toggling the class fully reverts. */

.psc-simple-view .editor-input {
  padding-left: 4em;
}

/* Generalize position: relative to all .para elements (not just psc-active-verse)
   so the absolutely-positioned .marker span has the right containing block. */
.psc-simple-view .para {
  position: relative;
}

.psc-simple-view .para > .marker {
  position: absolute;
  right: calc(100% + 0.5em);
  top: 0.15em;
  width: 3em;
  text-align: right;
  white-space: nowrap;
  color: var(--scripture-accent-marker);
  font-size: 0.75em;
  font-family: monospace;
}

/* RTL: move gutter to the right */
[dir="rtl"] .psc-simple-view .editor-input {
  padding-right: 4em;
  padding-left: 10px;
}

[dir="rtl"] .psc-simple-view .para > .marker {
  right: auto;
  left: calc(100% + 0.5em);
  text-align: left;
}
```

- [ ] **Step 2: Run tests**

```powershell
pnpm nx test "@eten-tech-foundation/platform-editor"
```

Expected: 73 passed, 3 skipped (0 failures).

- [ ] **Step 3: Run typecheck**

```powershell
pnpm nx typecheck "@eten-tech-foundation/platform-editor"
```

Expected: no errors.

- [ ] **Step 4: Commit**

```powershell
git add packages/platform/src/editor/editor.css
git commit -m "feat: paragraph marker column in simple view"
```

---

## Visual verification checklist (manual, after both tasks)

Run the platform dev server:

```powershell
pnpm nx dev platform
```

Enable simple view (`isSimpleView: true`). Check:

- [ ] Paragraph markers (`\p`, `\q1`, etc.) appear to the left of the content area in muted accent color
- [ ] Section headings (`\s1`) show their marker in the gutter; heading text remains centered
- [ ] Verse numbers and text are unaffected (accent color unchanged, active-verse outline still works)
- [ ] Empty verse `…` placeholder still appears
- [ ] Non-simple-view (formatted/unformatted) is visually unchanged
- [ ] If testing RTL: gutter appears on the right
