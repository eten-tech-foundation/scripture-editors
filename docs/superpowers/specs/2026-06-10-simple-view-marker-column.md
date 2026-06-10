# Simple View — Paragraph Marker Column

**Date:** 2026-06-10

In simple view, every block-level paragraph marker (`\p`, `\s1`, `\q1`, `\r`, etc.) appears in a fixed-width gutter to the left of the paragraph content (right of the content in RTL). Text alignment within each paragraph is unchanged — headings stay centered, verse paragraphs stay left-aligned.

---

## Visual

```
\s1    THE WORD OF LIFE
\p   1 In the beginning God created…
\q1  2 And God said, "Let there be light,"
\r     (Mt 3.1–12; Mk 1.1–8)
```

The marker column is muted gray, small monospace font. The verse text is full width inside the content area. Section headings remain centered within the content area.

---

## Architecture

Pure CSS change. No new JavaScript, no new Lexical nodes, no new React components.

**What already exists:**

- Every `<p class="para usfm_p" data-marker="p">` element has a `<span class="marker">\p</span>` as its first child, rendered by `MarkerNode`.
- `psc-simple-view` scopes all simple-view CSS via the class on the editor container div.
- `.para` elements in simple view already get `position: relative` when `psc-active-verse` is applied. This is generalized to all `.para` in simple view.
- `.editor-input` has `padding: 15px 10px`. The left padding is increased to create the gutter.

**What changes:**

- `packages/platform/src/editor/editor.css` — new rules in the `psc-simple-view` section only.

---

## CSS Design

### Gutter space

```css
.psc-simple-view .editor-input {
  padding-left: 4em; /* gutter width (~60px at 15px font) */
}
```

The existing `padding-right: 10px` and `padding-top/bottom: 15px` are unchanged.

### Paragraph positioning context

```css
.psc-simple-view .para {
  position: relative;
}
```

(Generalizes the existing `.psc-simple-view .psc-active-verse { position: relative }` rule — both can coexist.)

### Marker column

```css
.psc-simple-view .para > .marker {
  position: absolute;
  right: calc(100% + 0.5em); /* 0.5em gap between gutter and content */
  top: 0.15em; /* optical alignment with first line */
  width: 3em;
  text-align: right;
  white-space: nowrap;
  color: rgba(140, 140, 140, 0.7);
  font-size: 0.75em;
  font-family: monospace;
}
```

The `> .marker` direct-child selector ensures only the paragraph's own marker (the block-level marker) is affected, not nested inline character markers.

### RTL

```css
[dir="rtl"] .psc-simple-view .editor-input {
  padding-right: 4em;
  padding-left: 10px; /* restore original */
}

[dir="rtl"] .psc-simple-view .para > .marker {
  right: auto;
  left: calc(100% + 0.5em);
  text-align: left;
}
```

---

## Interactions with existing simple-view features

| Feature                                 | Impact                                                                                                                                            |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Active verse `::before` outline         | None — outline lives on `::before`, marker on the `.marker` child span                                                                            |
| Empty verse `::after` placeholder       | None — lives on `::after`                                                                                                                         |
| `--verse-end` dynamic measurement       | None — `updateVerseOffset` measures the verse span relative to the `<p>` content box, unaffected by the absolutely-positioned marker              |
| Section heading `text-align: center`    | Headings stay centered within the content area; `\s1` appears in the gutter                                                                       |
| `marker-hidden` / `marker-visible` mode | In simple view the paragraph marker is always shown in the gutter regardless of the mode setting, because the new rule overrides display behavior |

---

## What is NOT in scope

- Character/inline markers (e.g. `\nd`, `\wj`) — these are not `.para > .marker` direct children, so the gutter rule does not affect them.
- Chapter markers (`\c`) — chapter numbers are already displayed as large decorative elements in simple view; the `\c` marker in the gutter would be redundant. Exclude via `.para:not(.usfm_c)` if needed after visual testing.
- Any change to the `ViewOptions` / `markerMode` API — the gutter is purely a visual behavior of `psc-simple-view`.

---

## Files changed

| File                                      | Change                                                                                                   |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `packages/platform/src/editor/editor.css` | Add gutter padding, `.para > .marker` positioning, and RTL variants — all within `psc-simple-view` scope |
